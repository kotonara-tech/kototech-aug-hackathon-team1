import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { distanceKm, walkMinutes, planRoutes } from "../app/lib/route-engine.ts";

/** テスト用の施設。座標・料金・滞在時間が揃っているものだけを使う。 */
const PLACES = [
  { id: "kamado", name: "鹿の舟 竈", type: "和食・カフェ", lat: 34.6711, lng: 135.8302,
    cost: 2200, stayMinutes: 45, genres: ["和食", "カフェ"], shikaMember: true },
  { id: "nakanishi", name: "寧楽菓子司 中西与三郎", type: "和菓子・文化体験", lat: 34.6778, lng: 135.8306,
    cost: 650, stayMinutes: 30, genres: ["和菓子", "甘いもの", "ならまち"], shikaMember: true },
  { id: "tanaka", name: "奈良筆 田中", type: "伝統工芸・文化体験", lat: 34.6758, lng: 135.8317,
    cost: 1600, stayMinutes: 50, genres: ["伝統工芸", "体験"], shikaMember: true },
  { id: "kanakana", name: "カナカナ", type: "町家カフェ・和食", lat: 34.6759, lng: 135.8314,
    cost: 1683, stayMinutes: 50, genres: ["カフェ", "ならまち"], shikaMember: true },
  { id: "kitokito", name: "器人器人", type: "工芸品・文化体験", lat: 34.692104, lng: 135.832627,
    cost: 0, stayMinutes: 30, genres: ["工芸品", "きたまち"], shikaMember: true },
  { id: "yusai", name: "なら泉勇斎", type: "日本酒・飲食", lat: 34.6791, lng: 135.8281,
    cost: 500, stayMinutes: 30, genres: ["日本酒", "ならまち"], shikaMember: true },
  { id: "faraway", name: "遠すぎる店", type: "テスト用", lat: 34.9000, lng: 136.1000,
    cost: 100, stayMinutes: 10, genres: ["テスト"], shikaMember: false },
];

const STATION = { name: "近鉄奈良駅", lat: 34.6844, lng: 135.8298 };

const BASE_REQUEST = {
  availableMinutes: 165,
  budget: 3000,
  start: STATION,
  goal: STATION,
  notes: "",
};

describe("距離と徒歩時間の計算", () => {
  test("同じ地点どうしの距離は0km", () => {
    assert.equal(distanceKm(STATION, STATION), 0);
  });

  test("近鉄奈良駅と鹿の舟の距離は約1.5km", () => {
    const km = distanceKm(STATION, PLACES[0]);
    assert.ok(km > 1.2 && km < 1.9, `想定より離れている: ${km}km`);
  });

  test("距離の計算はどちら向きでも同じ", () => {
    assert.equal(distanceKm(STATION, PLACES[2]), distanceKm(PLACES[2], STATION));
  });

  test("徒歩時間は分速80mで切り上げる", () => {
    assert.equal(walkMinutes(0), 0);
    assert.equal(walkMinutes(0.8), 10);
    assert.equal(walkMinutes(4), 50);
    assert.equal(walkMinutes(0.81), 11);
  });
});

describe("ルート提案の必須条件", () => {
  const plans = planRoutes(PLACES, BASE_REQUEST);

  test("ルートを1つ以上提案する", () => {
    assert.ok(plans.length > 0, "ルートが1件も出ていない");
  });

  test("提案は最大3ルートまで", () => {
    assert.ok(plans.length <= 3, `${plans.length}件返っている`);
  });

  test("すべてのルートが安全余裕を残してゴールへ戻る", () => {
    const limit = BASE_REQUEST.availableMinutes - 10;
    for (const plan of plans) {
      assert.ok(plan.returnMinutes <= limit,
        `${plan.id}: ${plan.returnMinutes}分かかり、上限${limit}分を超えている`);
    }
  });

  test("すべてのルートが予算内に収まる", () => {
    for (const plan of plans) {
      assert.ok(plan.totalCost <= BASE_REQUEST.budget,
        `${plan.id}: ${plan.totalCost}円で、予算${BASE_REQUEST.budget}円を超えている`);
    }
  });

  test("どのルートにも必ず立ち寄り先がある", () => {
    for (const plan of plans) {
      assert.ok(plan.places.length > 0, `${plan.id}: 立ち寄り先が空`);
    }
  });

  test("同じ施設を1つのルートで重複して訪れない", () => {
    for (const plan of plans) {
      const ids = plan.places.map((p) => p.id);
      assert.equal(new Set(ids).size, ids.length, `${plan.id}: 同じ施設が重複している`);
    }
  });

  test("3ルートの中身がそれぞれ異なる", () => {
    const keys = plans.map((plan) => plan.places.map((p) => p.id).sort().join("+"));
    assert.equal(new Set(keys).size, keys.length, `同じ組み合わせのルートがある: ${keys.join(" / ")}`);
  });

  test("合計時間の内訳が合っている", () => {
    for (const plan of plans) {
      const stay = plan.places.reduce((sum, p) => sum + p.stayMinutes, 0);
      assert.equal(plan.travelMinutes + stay, plan.returnMinutes, `${plan.id}: 内訳が合わない`);
      assert.equal(plan.totalCost, plan.places.reduce((sum, p) => sum + p.cost, 0), `${plan.id}: 金額が合わない`);
    }
  });

  test("立ち寄り先ごとの到着・出発時刻が矛盾しない", () => {
    for (const plan of plans) {
      let previousDeparture = 0;
      for (const leg of plan.legs) {
        assert.equal(leg.arrivalMinutes, previousDeparture + leg.travelMinutes, `${plan.id}: 到着時刻がずれている`);
        assert.equal(leg.departureMinutes, leg.arrivalMinutes + leg.place.stayMinutes, `${plan.id}: 出発時刻がずれている`);
        previousDeparture = leg.departureMinutes;
      }
    }
  });
});

describe("条件による絞り込み", () => {
  test("時間内に戻れない遠い施設は選ばれない", () => {
    const plans = planRoutes(PLACES, BASE_REQUEST);
    for (const plan of plans) {
      assert.ok(!plan.places.some((p) => p.id === "faraway"), `${plan.id}: 遠すぎる店が入っている`);
    }
  });

  test("予算が少ないときは高い施設を外す", () => {
    const plans = planRoutes(PLACES, { ...BASE_REQUEST, budget: 700 });
    assert.ok(plans.length > 0, "予算700円で1件も出ていない");
    for (const plan of plans) {
      assert.ok(plan.totalCost <= 700, `${plan.id}: ${plan.totalCost}円`);
      assert.ok(!plan.places.some((p) => p.id === "kamado"), `${plan.id}: 2200円の店が入っている`);
    }
  });

  test("空き時間が短すぎるときは空の配列を返す", () => {
    const plans = planRoutes(PLACES, { ...BASE_REQUEST, availableMinutes: 15 });
    assert.deepEqual(plans, []);
  });

  test("予算0円のときは無料の施設だけを使う", () => {
    const plans = planRoutes(PLACES, { ...BASE_REQUEST, budget: 0 });
    for (const plan of plans) {
      assert.equal(plan.totalCost, 0, `${plan.id}: 無料ではない`);
    }
  });

  test("候補が空なら空の配列を返す", () => {
    assert.deepEqual(planRoutes([], BASE_REQUEST), []);
  });

  test("安全余裕は指定した分だけ確保する", () => {
    const plans = planRoutes(PLACES, { ...BASE_REQUEST, safetyBufferMinutes: 60 });
    for (const plan of plans) {
      assert.ok(plan.returnMinutes <= BASE_REQUEST.availableMinutes - 60,
        `${plan.id}: ${plan.returnMinutes}分で余裕60分を確保できていない`);
    }
  });
});

describe("移動時間の差し替え", () => {
  test("渡した移動時間の計算方法を使う", () => {
    const plans = planRoutes(PLACES, BASE_REQUEST, { travelMinutes: () => 1 });
    assert.ok(plans.length > 0);
    for (const plan of plans) {
      for (const leg of plan.legs) {
        assert.equal(leg.travelMinutes, 1, `${plan.id}: 差し替えた計算が使われていない`);
      }
    }
  });

  test("移動時間が長くなると、立ち寄れる数が減る", () => {
    // 空き時間165分、安全余裕10分 → 使えるのは155分
    const fast = planRoutes(PLACES, BASE_REQUEST, { travelMinutes: () => 1 });
    // 1区間60分なら、1か所だけ（往復120分＋滞在30分＝150分）が限界
    const slow = planRoutes(PLACES, BASE_REQUEST, { travelMinutes: () => 60 });

    assert.ok(Math.max(...fast.map((plan) => plan.places.length)) > 1, "速いときに複数か所へ寄れていない");
    for (const plan of slow) {
      assert.equal(plan.places.length, 1, `${plan.id}: 1区間60分なのに複数か所へ寄っている`);
    }
  });

  test("移動時間が長すぎればルートを返さない", () => {
    // 1区間80分なら往復だけで160分となり、155分に収まらない
    const tooSlow = planRoutes(PLACES, BASE_REQUEST, { travelMinutes: () => 80 });
    assert.deepEqual(tooSlow, [], "往復160分でも戻れることになっている");
  });

  test("差し替えた場合も、ゴールへ戻る区間を必ず数える", () => {
    const plans = planRoutes(PLACES, BASE_REQUEST, { travelMinutes: () => 5 });
    for (const plan of plans) {
      // 立ち寄り先ぶんの移動 + ゴールへ戻る1区間
      assert.equal(plan.travelMinutes, (plan.places.length + 1) * 5, `${plan.id}: 帰りが数えられていない`);
    }
  });

  test("計算方法には出発地・施設・ゴールの座標が渡る", () => {
    const seen = [];
    planRoutes([PLACES[1]], BASE_REQUEST, {
      travelMinutes: (from, to) => {
        seen.push([from, to]);
        return 5;
      },
    });
    assert.ok(seen.length >= 2, "行きと帰りの2区間が計算されていない");
    assert.deepEqual(seen[0][0], STATION);
    assert.equal(seen[0][1].id, "nakanishi");
    assert.equal(seen[1][0].id, "nakanishi");
    assert.deepEqual(seen[1][1], STATION);
  });

  test("渡さなければ直線距離からの概算を使う", () => {
    const withDefault = planRoutes(PLACES, BASE_REQUEST);
    const explicit = planRoutes(PLACES, BASE_REQUEST, {});
    assert.deepEqual(
      withDefault.map((plan) => plan.returnMinutes),
      explicit.map((plan) => plan.returnMinutes),
    );
  });
});

describe("好みの反映", () => {
  test("備考のキーワードに合う施設が先頭のルートに入る", () => {
    const plans = planRoutes(PLACES, { ...BASE_REQUEST, notes: "甘いもの" });
    assert.ok(plans.length > 0);
    assert.ok(plans[0].places.some((p) => p.id === "nakanishi"),
      "「甘いもの」を指定したのに和菓子店が1番目のルートに入っていない");
  });

  test("備考が施設名そのものでも拾える", () => {
    const plans = planRoutes(PLACES, { ...BASE_REQUEST, notes: "カナカナ" });
    assert.ok(plans[0].places.some((p) => p.id === "kanakana"));
  });

  test("備考が空でも順位が決まる", () => {
    const plans = planRoutes(PLACES, BASE_REQUEST);
    for (let i = 1; i < plans.length; i += 1) {
      assert.ok(plans[i - 1].score >= plans[i].score, "点数の高い順に並んでいない");
    }
  });

  test("同じ入力なら同じ結果を返す", () => {
    const a = planRoutes(PLACES, { ...BASE_REQUEST, notes: "ならまち" });
    const b = planRoutes(PLACES, { ...BASE_REQUEST, notes: "ならまち" });
    assert.deepEqual(a.map((p) => p.id), b.map((p) => p.id));
    assert.deepEqual(
      a.map((p) => p.places.map((s) => s.id)),
      b.map((p) => p.places.map((s) => s.id)),
    );
  });

  test("元の候補リストを書き換えない", () => {
    const copy = JSON.parse(JSON.stringify(PLACES));
    planRoutes(PLACES, BASE_REQUEST);
    assert.deepEqual(PLACES, copy);
  });
});
