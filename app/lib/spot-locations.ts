/**
 * 2つの取得元から集めた座標を1つにまとめる。
 *
 * | 取得元 | 引き方 | 確からしさ |
 * | --- | --- | --- |
 * | Overpass の完全一致 | OpenStreetMap の施設名がそのまま一致 | 高い |
 * | Nominatim | 検索エンジンに施設名を渡して先頭を採用 | 中くらい |
 * | Overpass の部分一致 | 片方の名前がもう片方を含む | 低い（別施設のことがある） |
 *
 * どちらも OpenStreetMap のデータだが、引き方が違うので取り違えの起きやすさが違う。
 * 確からしい順に採用し、どこから取ったかを source に残す。
 */

export type RawLocation = {
  name: string;
  lat: unknown;
  lng: unknown;
  address?: string;
  displayName?: string;
  /** Overpass のみ。"exact" か "partial"。 */
  matchType?: string;
};

export type MergedLocation = {
  name: string;
  lat: number;
  lng: number;
  address: string;
  displayName: string;
  /** どこから取った座標か。画面の出典表示に出す。 */
  source: string;
  matchType?: string;
};

const NOMINATIM_SOURCE = "OpenStreetMap Nominatim";
const OVERPASS_SOURCE = "OpenStreetMap Overpass API";

function toMerged(raw: RawLocation, source: string): MergedLocation | null {
  if (!raw || typeof raw.name !== "string" || raw.name.length === 0) return null;
  const lat = typeof raw.lat === "number" ? raw.lat : Number.NaN;
  const lng = typeof raw.lng === "number" ? raw.lng : Number.NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    name: raw.name,
    lat,
    lng,
    address: raw.address ?? "",
    displayName: raw.displayName ?? "",
    source: raw.matchType ? `${source}（名前の${raw.matchType === "exact" ? "完全" : "部分"}一致）` : source,
    ...(raw.matchType ? { matchType: raw.matchType } : {}),
  };
}

/**
 * 座標をまとめる。同じ施設が複数の取得元にある場合は、確からしい方を採る。
 * 並び順は「Overpassの完全一致 → Nominatim → Overpassの部分一致」で見つかった順。
 */
export function mergeLocations(
  nominatim: RawLocation[] | undefined,
  overpass: RawLocation[] | undefined,
): MergedLocation[] {
  const fromNominatim = Array.isArray(nominatim) ? nominatim : [];
  const fromOverpass = Array.isArray(overpass) ? overpass : [];

  const merged = new Map<string, MergedLocation>();

  // 確からしい順に入れて、先に入ったものを勝たせる
  const ordered: Array<[RawLocation[], string]> = [
    [fromOverpass.filter((item) => item?.matchType === "exact"), OVERPASS_SOURCE],
    [fromNominatim, NOMINATIM_SOURCE],
    [fromOverpass.filter((item) => item?.matchType !== "exact"), OVERPASS_SOURCE],
  ];

  for (const [list, source] of ordered) {
    for (const raw of list) {
      const location = toMerged(raw, source);
      if (!location) continue;
      if (merged.has(location.name)) continue;
      merged.set(location.name, location);
    }
  }

  return [...merged.values()];
}
