/**
 * 公式カタログ375施設を、ルート計算に使える形へ組み立てる。
 *
 * 元データは3つに分かれている。混ぜないこと。
 *
 * | 種別 | 出どころ | 中身 |
 * | --- | --- | --- |
 * | 公式データ | app/data/ashiato-spots.json | 施設名・カテゴリ・ジャンル・掲載ページ |
 * | 外部から補ったデータ | app/data/spot-locations.json | 座標・住所（Nominatim、取得日つき） |
 * | 試算値 | app/lib/spot-estimates.ts | 料金・滞在時間（カテゴリからの目安） |
 *
 * 座標が引けなかった施設はルート候補にしない（行き先が分からないため）。
 * カタログ375件の表示自体は app/page.tsx が別に行うので、ここで件数は減らない。
 */

import type { EnginePlace } from "./route-engine.ts";
import { ESTIMATE_NOTE, estimateSpot, isRouteCandidate } from "./spot-estimates.ts";

/** 公式カタログ1件分。 */
export type CatalogItem = {
  name: string;
  sections: string[];
  genres: string[];
  narafuru: boolean;
  sourcePages: number[];
};

/** Nominatim で引いた座標1件分。 */
export type SpotLocation = {
  name: string;
  lat: number;
  lng: number;
  address?: string;
  displayName?: string;
  /** どこから取った座標か。省略時は「OpenStreetMap」とだけ書く。 */
  source?: string;
};

/** エンジンが使う項目に、画面表示用の項目を足したもの。app/lib/places.ts と同じ形。 */
export type CatalogPlace = EnginePlace & {
  address: string;
  price: string;
  stay: string;
  image: string;
  note: string;
  sourceNote: string;
};

export type BuildOptions = {
  /** 手作業で確認済みの施設。名前が一致したらこちらを優先する。 */
  overrides?: CatalogPlace[];
  /** 座標を取得した日。出典表示に出す。 */
  fetchedAt?: string;
};

const UNKNOWN_FETCHED_AT = "取得日不明";
/**
 * OpenStreetMap に住所が登録されていない施設に出す文言。
 * 空欄にすると画面の住所行が消えてしまい、なぜ無いのかも伝わらない。
 */
const UNKNOWN_ADDRESS = "奈良市内（詳しい住所は未取得）";

/** 料金の表示。無料なら「無料」と書く。 */
function priceLabel(cost: number): string {
  if (cost <= 0) return "無料（目安）";
  return `目安 約${cost.toLocaleString("ja-JP")}円`;
}

function sourceNote(location: SpotLocation, fetchedAt: string): string {
  const where = location.displayName ? `［${location.displayName}］` : "";
  const service = location.source ?? "OpenStreetMap";
  return [
    `座標・住所：${service}${where} ${fetchedAt}取得`,
    "掲載属性：奈良市公式PDF「ASHIATOポイントが使えるお店・施設一覧」",
    `料金・滞在時間：${ESTIMATE_NOTE}`,
  ].join(" / ");
}

function noteOf(item: CatalogItem): string {
  const genres = item.genres.filter((genre) => genre.length > 0);
  const tail = genres.length > 0 ? `ジャンル: ${genres.join("・")}` : "";
  const pages = item.sourcePages.length > 0 ? `公式PDF ${item.sourcePages.join("・")}ページ掲載` : "";
  return [tail, pages].filter((part) => part.length > 0).join(" / ");
}

/**
 * カタログと座標を突き合わせて、ルート候補にできる施設を作る。
 *
 * - 座標が無い施設は返さない
 * - 施設名は公式カタログの表記のまま変えない
 * - 同じ入力なら毎回同じ順序・同じidを返す（カタログの並び順）
 */
export function buildCatalogPlaces(
  items: CatalogItem[],
  locations: SpotLocation[],
  options: BuildOptions = {},
): CatalogPlace[] {
  if (!Array.isArray(items) || !Array.isArray(locations)) return [];

  const fetchedAt = options.fetchedAt ?? UNKNOWN_FETCHED_AT;
  const locationByName = new Map<string, SpotLocation>();
  for (const location of locations) {
    if (!location || typeof location.name !== "string") continue;
    if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) continue;
    if (!locationByName.has(location.name)) locationByName.set(location.name, location);
  }

  const overrideByName = new Map<string, CatalogPlace>();
  for (const override of options.overrides ?? []) {
    if (override && typeof override.name === "string") overrideByName.set(override.name, override);
  }

  const places: CatalogPlace[] = [];
  items.forEach((item, index) => {
    if (!item || typeof item.name !== "string") return;

    // 手作業で確認済みの施設は、そのまま使う（座標も料金も人が確かめた値のため）
    const override = overrideByName.get(item.name);
    if (override) {
      places.push(override);
      return;
    }

    // 泊まる場所やサービス業は、寄り道の目的地にならないので候補から外す
    if (!isRouteCandidate(item)) return;

    const location = locationByName.get(item.name);
    if (!location) return;

    const estimate = estimateSpot(item);
    places.push({
      id: `spot-${index}`,
      name: item.name,
      type: estimate.type,
      lat: location.lat,
      lng: location.lng,
      cost: estimate.cost,
      stayMinutes: estimate.stayMinutes,
      // 備考の検索に引っかかるよう、ジャンルとカテゴリの両方を入れる
      genres: [...new Set([...(item.genres ?? []), ...(item.sections ?? [])])],
      shikaMember: true,
      address: location.address && location.address.length > 0 ? location.address : UNKNOWN_ADDRESS,
      price: priceLabel(estimate.cost),
      stay: `${estimate.stayMinutes}分`,
      image: "",
      note: noteOf(item),
      sourceNote: sourceNote(location, fetchedAt),
    });
  });

  return places;
}
