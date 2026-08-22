import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { SAMPLE_PLACES } from "../app/lib/places.ts";
import { planRoutes } from "../app/lib/route-engine.ts";
import { formatMinutes, addClock, toRouteViews } from "../app/lib/route-view.ts";

const catalogUrl = new URL("../app/data/ashiato-spots.json", import.meta.url);

const STATION = { name: "近鉄奈良駅", lat: 34.6844, lng: 135.8298 };
const REQUEST = {
  availableMinutes: 165,
  budget: 3000,
  start: STATION,
  goal: STATION,
  notes: "",
};

describe("サンプル施設データ", () => {
  test("座標・料金・滞在時間が揃った施設だけを持つ", () => {
    assert.ok(SAMPLE_PLACES.length >= 6, `${SAMPLE_PLACES.length}件しかない`);
    for (const place of SAMPLE_PLACES) {
      assert.ok(place.id.length > 0, "idが空");
      assert.ok(place.name.length > 0, `${place.id}: 名前が空`);
      assert.equal(typeof place.lat, "number", `${place.name}: 緯度がない`);
      assert.equal(typeof place.lng, "number", `${place.name}: 経度がない`);
      assert.ok(place.lat > 34 && place.lat < 35, `${place.name}: 緯度が奈良の範囲外`);
      assert.ok(place.lng > 135 && place.lng < 136, `${place.name}: 経度が奈良の範囲外`);
      assert.ok(place.cost >= 0, `${place.name}: 料金が負`);
      assert.ok(place.stayMinutes > 0, `${place.name}: 滞在時間が0以下`);
      assert.ok(Array.isArray(place.genres), `${place.name}: ジャンルが配列でない`);
    }
  });

  test("idが重複していない", () => {
    const ids = SAMPLE_PLACES.map((place) => place.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("表示に必要な項目が揃っている", () => {
    for (const place of SAMPLE_PLACES) {
      assert.ok(place.address.length > 0, `${place.name}: 住所がない`);
      assert.ok(place.price.length > 0, `${place.name}: 料金表示がない`);
      assert.ok(place.image.length > 0, `${place.name}: 写真がない`);
      assert.ok(place.sourceNote.length > 0, `${place.name}: 出典の記載がない`);
    }
  });

  test("SHIKA no ASHIATO 掲載施設は公式カタログに実在する", async () => {
    const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));
    const officialNames = new Set(catalog.items.map((item) => item.name));
    for (const place of SAMPLE_PLACES) {
      if (!place.shikaMember) continue;
      assert.ok(
        officialNames.has(place.name),
        `${place.name} は掲載施設としているが、公式カタログ375件に無い`,
      );
    }
  });
});

describe("時間の表示", () => {
  test("分を「◯時間◯分」にする", () => {
    assert.equal(formatMinutes(165), "2時間45分");
    assert.equal(formatMinutes(60), "1時間");
    assert.equal(formatMinutes(45), "45分");
    assert.equal(formatMinutes(0), "0分");
  });

  test("開始時刻に分を足して時計表示にする", () => {
    assert.equal(addClock("11:30", 10), "11:40");
    assert.equal(addClock("11:30", 45), "12:15");
    assert.equal(addClock("23:30", 45), "00:15");
    assert.equal(addClock("09:05", 0), "09:05");
  });

  test("時計表示にできない入力は null を返す", () => {
    assert.equal(addClock("", 10), null);
    assert.equal(addClock("11時30分", 10), null);
  });
});

describe("ルートを画面表示用に変換する", () => {
  const plans = planRoutes(SAMPLE_PLACES, REQUEST);

  test("計算結果と同じ数だけ変換する", () => {
    const views = toRouteViews(plans, {});
    assert.equal(views.length, plans.length);
    assert.ok(views.length > 0, "そもそもルートが出ていない");
  });

  test("見出しと説明が空にならない", () => {
    for (const view of toRouteViews(plans, {})) {
      assert.ok(view.title.length > 0, `${view.id}: 見出しが空`);
      assert.ok(view.description.length > 0, `${view.id}: 説明が空`);
    }
  });

  test("金額と時間の表示が計算結果と一致する", () => {
    const views = toRouteViews(plans, {});
    views.forEach((view, index) => {
      assert.equal(view.totalCost, plans[index].totalCost);
      assert.equal(view.returnMinutes, plans[index].returnMinutes);
      assert.equal(view.durationLabel, formatMinutes(plans[index].returnMinutes));
      assert.match(view.walkLabel, /徒歩/);
    });
  });

  test("立ち寄り先に住所・写真・出典が引き継がれる", () => {
    for (const view of toRouteViews(plans, {})) {
      assert.ok(view.stops.length > 0, `${view.id}: 立ち寄り先が空`);
      for (const stop of view.stops) {
        assert.ok(stop.address.length > 0, `${stop.name}: 住所が落ちている`);
        assert.ok(stop.image.length > 0, `${stop.name}: 写真が落ちている`);
        assert.ok(stop.sourceNote.length > 0, `${stop.name}: 出典が落ちている`);
        assert.match(stop.travelLabel, /徒歩\d+分/);
      }
    }
  });

  test("開始時刻を渡すと到着・帰着が時計表示になる", () => {
    const views = toRouteViews(plans, { startClock: "11:30" });
    for (const view of views) {
      assert.equal(view.returnClock, addClock("11:30", view.returnMinutes));
      for (const stop of view.stops) {
        assert.equal(stop.arrivalClock, addClock("11:30", stop.arrivalMinutes));
        assert.equal(stop.departureClock, addClock("11:30", stop.departureMinutes));
      }
    }
  });

  test("開始時刻を渡さなければ時計表示を付けない", () => {
    for (const view of toRouteViews(plans, {})) {
      assert.equal(view.returnClock, undefined);
      for (const stop of view.stops) {
        assert.equal(stop.arrivalClock, undefined);
      }
    }
  });

  test("地図に置く位置が枠内に収まる", () => {
    for (const view of toRouteViews(plans, {})) {
      for (const stop of view.stops) {
        assert.ok(stop.x >= 0 && stop.x <= 100, `${stop.name}: x=${stop.x}`);
        assert.ok(stop.y >= 0 && stop.y <= 100, `${stop.name}: y=${stop.y}`);
      }
    }
  });

  test("ルートごとに色と写真が付く", () => {
    for (const view of toRouteViews(plans, {})) {
      assert.match(view.color, /^#[0-9a-f]{6}$/i, `${view.id}: 色が不正`);
      assert.ok(view.image.length > 0, `${view.id}: 写真がない`);
    }
  });

  test("空の計算結果は空の配列になる", () => {
    assert.deepEqual(toRouteViews([], {}), []);
  });
});
