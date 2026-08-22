/**
 * OpenStreetMap の公開サービスを呼ぶ部分。
 *
 * - 地名から座標を引く: Nominatim
 * - 実際の徒歩時間を引く: OSRM（OpenStreetMap Deutschland の徒歩プロファイル）
 *
 * どちらも無料・APIキー不要だが、**ボランティアが運営する共有サーバー**である。
 * 大量アクセスは利用規約で禁止されているので、次を守ること。
 *
 * - User-Agent を必ず名乗る（Nominatim の必須要件）
 * - 1回のルート生成につき、問い合わせは数回まで
 * - 距離は1件ずつではなく table サービスでまとめて取る
 * - 同じ地名の問い合わせはキャッシュする
 *
 * 失敗しても例外を投げず null を返す。呼び出し側は直線距離の概算へ戻すこと。
 * 本番運用するなら、自前のOSRM/Nominatimを立てるか有料サービスへ移す必要がある。
 *
 * 出典・規約:
 * - https://operations.osmfoundation.org/policies/nominatim/
 * - https://routing.openstreetmap.de/
 */

export const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";
export const OSRM_FOOT_ENDPOINT = "https://routing.openstreetmap.de/routed-foot/table/v1/foot";
export const OSM_USER_AGENT = "nara-yorimichi/0.1 (hackathon prototype; local use)";

/** 地名検索の応答を待つ上限。実測でおおむね0.1秒なので短くてよい。 */
const GEOCODE_TIMEOUT_MS = 5000;
/**
 * 徒歩時間の応答を待つ上限。
 * 共有サーバーの応答は実測で1〜11秒とばらつくため長めに取り、
 * その代わり結果をキャッシュして2回目以降は待たせない。
 */
const MATRIX_TIMEOUT_MS = 12000;
/** 座標を同じ地点と見なす丸めの桁数。約1mの精度。 */
const COORD_PRECISION = 5;

export type Point = { lat: number; lng: number };
export type GeocodeResult = { name: string; lat: number; lng: number };

type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;
type CallOptions = { fetchImpl?: FetchLike };

/**
 * 同じ地名を何度も問い合わせないための、実行中だけのキャッシュ。
 * 成功した結果だけを覚える。失敗を覚えると、一時的な通信断でその地名が
 * ずっと引けなくなってしまうため。
 */
const geocodeCache = new Map<string, GeocodeResult>();

/** キャッシュを空にする。テストや、地名データを入れ替えたときに使う。 */
export function clearGeocodeCache(): void {
  geocodeCache.clear();
}

/**
 * 同じ地点の組み合わせを何度も問い合わせないためのキャッシュ。
 * 立ち寄り先の候補は固定で、出発地も繰り返されやすいので効果が大きい。
 * 成功した結果だけを覚える。
 */
const travelMatrixCache = new Map<string, (number | null)[][]>();

/** 徒歩時間のキャッシュを空にする。テスト用。 */
export function clearTravelMatrixCache(): void {
  travelMatrixCache.clear();
}

async function requestJson(url: string, fetchImpl: FetchLike, timeoutMs: number): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { "User-Agent": OSM_USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    // 通信断・時間切れ・壊れたJSON。呼び出し側で概算へ戻す。
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 地名・施設名から座標を引く。見つからなければ null。
 * 表示に使う名前は、入力された表記をそのまま残す。
 */
export async function geocode(query: string, options: CallOptions = {}): Promise<GeocodeResult | null> {
  const name = (query ?? "").trim();
  if (name === "") return null;
  const cached = geocodeCache.get(name);
  if (cached) return cached;

  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchLike);
  const url = `${NOMINATIM_ENDPOINT}?q=${encodeURIComponent(name)}&format=jsonv2&limit=1`;
  const body = await requestJson(url, fetchImpl, GEOCODE_TIMEOUT_MS);

  let result: GeocodeResult | null = null;
  if (Array.isArray(body) && body.length > 0) {
    const lat = toFiniteNumber(body[0]?.lat);
    const lng = toFiniteNumber(body[0]?.lon);
    if (lat !== null && lng !== null) result = { name, lat, lng };
  }

  if (result) geocodeCache.set(name, result);
  return result;
}

/**
 * 地点どうしの徒歩時間（分）を総当たり表で取る。
 * 1回の通信で全組み合わせが取れるので、区間ごとに呼ばないこと。
 * 取れなければ null。到達できない区間だけが null になることもある。
 */
export async function travelMatrixMinutes(
  points: Point[],
  options: CallOptions = {},
): Promise<(number | null)[][] | null> {
  if (!Array.isArray(points) || points.length < 2) return null;

  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchLike);
  // OSRM は「経度,緯度」の順で受け取る
  const coordinates = points.map((point) => `${point.lng},${point.lat}`).join(";");

  const cached = travelMatrixCache.get(coordinates);
  if (cached) return cached;

  const body = await requestJson(`${OSRM_FOOT_ENDPOINT}/${coordinates}`, fetchImpl, MATRIX_TIMEOUT_MS);

  if (!body || typeof body !== "object") return null;
  const payload = body as { code?: string; durations?: (number | null)[][] };
  if (payload.code !== "Ok" || !Array.isArray(payload.durations)) return null;

  const minutes = payload.durations.map((row) =>
    row.map((seconds) => (typeof seconds === "number" ? Math.ceil(seconds / 60) : null)),
  );
  travelMatrixCache.set(coordinates, minutes);
  return minutes;
}

function coordKey(point: Point): string {
  return `${point.lat.toFixed(COORD_PRECISION)},${point.lng.toFixed(COORD_PRECISION)}`;
}

/**
 * 総当たり表から、2地点の所要時間（分）を引く関数を作る。
 * 表に無い地点や、到達できない区間は null を返すので、
 * 呼び出し側で直線距離の概算へ戻すこと。
 */
export function buildTravelLookup(
  points: Point[],
  matrix: (number | null)[][] | null,
): (from: Point, to: Point) => number | null {
  if (!matrix) return () => null;

  const indexByKey = new Map<string, number>();
  points.forEach((point, index) => indexByKey.set(coordKey(point), index));

  return (from: Point, to: Point) => {
    const fromIndex = indexByKey.get(coordKey(from));
    const toIndex = indexByKey.get(coordKey(to));
    if (fromIndex === undefined || toIndex === undefined) return null;
    return matrix[fromIndex]?.[toIndex] ?? null;
  };
}
