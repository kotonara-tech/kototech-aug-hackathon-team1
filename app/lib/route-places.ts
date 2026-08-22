/**
 * ルート候補に使える施設の一覧を、実データから組み立てて配る。
 *
 * 読み込む3つのファイル:
 *
 * | ファイル | 中身 | 作った道具 |
 * | --- | --- | --- |
 * | app/data/ashiato-spots.json | 公式カタログ375件（名前・カテゴリ・ジャンル） | 奈良市公式PDFから抽出 |
 * | app/data/spot-locations.json | Nominatim で引いた座標 | scripts/geocode-spots.mjs |
 * | app/data/spot-locations-overpass.json | Overpass で名前を照合した座標 | scripts/match-overpass.mjs |
 *
 * どちらの座標も事前に取得済みで、実行中に外部へ問い合わせることはない。
 * 座標が引けなかった施設はルート候補にならない（行き先が決まらないため）。
 * カタログ375件の表示は app/page.tsx が別に行うので、ここで件数は減らない。
 */

import catalogJson from "../data/ashiato-spots.json" with { type: "json" };
import nominatimJson from "../data/spot-locations.json" with { type: "json" };
import overpassJson from "../data/spot-locations-overpass.json" with { type: "json" };

import { buildCatalogPlaces, type CatalogItem, type CatalogPlace } from "./catalog-places.ts";
import { SAMPLE_PLACES } from "./places.ts";
import { mergeLocations, type RawLocation } from "./spot-locations.ts";

/** ISO形式の日時から、日付だけを取り出す。表示に時刻まで要らないため。 */
function toDateOnly(value: unknown): string {
  if (typeof value !== "string" || value.length < 10) return "取得日不明";
  return value.slice(0, 10);
}

const locations = mergeLocations(
  nominatimJson.items as RawLocation[],
  overpassJson.items as RawLocation[],
);

/** 座標を取得した日。施設詳細の出典表示に出す。 */
export const LOCATION_FETCHED_AT = toDateOnly(overpassJson.fetchedAt ?? nominatimJson.fetchedAt);

/**
 * ルート計算に渡せる施設の一覧。
 * 手作業で確認済みの6件（app/lib/places.ts）は、そちらの値を優先する。
 */
export const ROUTE_PLACES: CatalogPlace[] = buildCatalogPlaces(
  catalogJson.items as CatalogItem[],
  locations,
  { overrides: SAMPLE_PLACES, fetchedAt: LOCATION_FETCHED_AT },
);

/** 画面に「375件中○件が候補」と正直に出すための数。 */
export const ROUTE_PLACE_STATS = {
  /** 公式カタログの総数。 */
  catalogCount: catalogJson.count as number,
  /** そのうち、座標が揃ってルート候補にできた数。 */
  routeReadyCount: ROUTE_PLACES.length,
  /** 手作業で料金まで確認済みの数。 */
  curatedCount: SAMPLE_PLACES.length,
  /** 座標を取得した日。 */
  fetchedAt: LOCATION_FETCHED_AT,
};
