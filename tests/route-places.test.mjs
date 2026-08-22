import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ROUTE_PLACES, ROUTE_PLACE_STATS } from "../app/lib/route-places.ts";
import { SAMPLE_PLACES } from "../app/lib/places.ts";
import catalogJson from "../app/data/ashiato-spots.json" with { type: "json" };

/**
 * 実データを読み込んで組み立てた、ルート候補一覧のテスト。
 *
 * 公式カタログ375件のうち、座標が引けたものだけがルート候補になる。
 * 何件引けたかは取得結果しだいなので、ここでは件数そのものではなく
 * 「手作業の6件より確実に増えている」ことと、データの整合性を確かめる。
 */
const CATALOG_NAMES = new Set(catalogJson.items.map((item) => item.name));

describe("ROUTE_PLACES", () => {
  test("手作業の6件より増えている", () => {
    assert.ok(
      ROUTE_PLACES.length > SAMPLE_PLACES.length,
      `候補が増えていない（${ROUTE_PLACES.length}件）`,
    );
  });

  test("すべての施設名が公式カタログに存在する", () => {
    const missing = ROUTE_PLACES.filter((place) => !CATALOG_NAMES.has(place.name));
    assert.deepEqual(missing.map((place) => place.name), [], "カタログに無い施設を混ぜない");
  });

  test("手作業で確認済みの6件は必ず含まれる", () => {
    const names = new Set(ROUTE_PLACES.map((place) => place.name));
    for (const sample of SAMPLE_PLACES) {
      assert.ok(names.has(sample.name), `${sample.name} が候補から消えている`);
    }
  });

  test("手作業の6件は、手作業の料金・滞在時間のまま", () => {
    for (const sample of SAMPLE_PLACES) {
      const place = ROUTE_PLACES.find((item) => item.name === sample.name);
      assert.equal(place.cost, sample.cost, `${sample.name} の料金が置き換わっている`);
      assert.equal(place.stayMinutes, sample.stayMinutes, `${sample.name} の滞在時間が置き換わっている`);
    }
  });

  test("idが重複しない", () => {
    const ids = new Set(ROUTE_PLACES.map((place) => place.id));
    assert.equal(ids.size, ROUTE_PLACES.length);
  });

  test("同じ施設が2件入らない", () => {
    const names = new Set(ROUTE_PLACES.map((place) => place.name));
    assert.equal(names.size, ROUTE_PLACES.length);
  });

  test("ルート計算に必要な値がすべて揃っている", () => {
    for (const place of ROUTE_PLACES) {
      assert.ok(Number.isFinite(place.lat) && Number.isFinite(place.lng), `${place.name} の座標が数値でない`);
      assert.ok(Number.isFinite(place.cost) && place.cost >= 0, `${place.name} の料金が不正`);
      assert.ok(place.stayMinutes > 0, `${place.name} の滞在時間が不正`);
    }
  });

  test("座標が奈良市のあたりに収まっている", () => {
    for (const place of ROUTE_PLACES) {
      assert.ok(place.lat > 34.5 && place.lat < 34.9, `${place.name} の緯度が奈良から外れている: ${place.lat}`);
      assert.ok(place.lng > 135.6 && place.lng < 136.1, `${place.name} の経度が奈良から外れている: ${place.lng}`);
    }
  });

  test("すべての施設に出典が入っている", () => {
    for (const place of ROUTE_PLACES) {
      assert.ok(place.sourceNote.length > 0, `${place.name} に出典が無い`);
    }
  });

  test("公式カタログの件数は減らさない", () => {
    assert.equal(ROUTE_PLACE_STATS.catalogCount, catalogJson.count);
    assert.equal(ROUTE_PLACE_STATS.catalogCount, 375);
  });

  test("ルート候補の件数を数えられる", () => {
    assert.equal(ROUTE_PLACE_STATS.routeReadyCount, ROUTE_PLACES.length);
    assert.ok(ROUTE_PLACE_STATS.routeReadyCount <= ROUTE_PLACE_STATS.catalogCount);
  });
});
