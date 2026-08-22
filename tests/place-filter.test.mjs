import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { selectCandidates, DEFAULT_CANDIDATE_LIMIT } from "../app/lib/place-filter.ts";

/**
 * 375件すべてを総当たりすると組み合わせが約880万通りになり、計算が終わらない。
 * そこで、出発地の近くと、ユーザーの希望に合うものだけを先に絞り込む。
 */
const START = { name: "近鉄奈良駅", lat: 34.6844, lng: 135.8299 };

function makePlace(id, lat, lng, extra = {}) {
  return {
    id,
    name: extra.name ?? id,
    type: extra.type ?? "テスト",
    lat,
    lng,
    cost: extra.cost ?? 500,
    stayMinutes: extra.stayMinutes ?? 30,
    genres: extra.genres ?? [],
    shikaMember: true,
  };
}

/** 出発地から少しずつ遠ざかる施設を作る。 */
function manyPlaces(count) {
  return Array.from({ length: count }, (_, index) =>
    makePlace(`p${index}`, START.lat + index * 0.002, START.lng),
  );
}

describe("selectCandidates", () => {
  test("既定の上限を超えて候補を返さない", () => {
    const selected = selectCandidates(manyPlaces(300), { start: START });
    assert.equal(selected.length, DEFAULT_CANDIDATE_LIMIT);
  });

  test("上限は呼び出し側で変えられる", () => {
    const selected = selectCandidates(manyPlaces(300), { start: START, limit: 5 });
    assert.equal(selected.length, 5);
  });

  test("候補が上限より少なければ全部返す", () => {
    const selected = selectCandidates(manyPlaces(4), { start: START });
    assert.equal(selected.length, 4);
  });

  test("出発地に近い順に選ぶ", () => {
    const selected = selectCandidates(manyPlaces(50), { start: START, limit: 3 });
    assert.deepEqual(selected.map((place) => place.id), ["p0", "p1", "p2"]);
  });

  test("希望に合う施設は、遠くても候補に残る", () => {
    const places = [
      ...manyPlaces(40),
      makePlace("faraway-sweets", START.lat + 0.2, START.lng, { name: "遠い甘味処", genres: ["甘いもの"] }),
    ];
    const selected = selectCandidates(places, { start: START, notes: "甘いもの", limit: 5 });
    assert.ok(selected.some((place) => place.id === "faraway-sweets"), "希望に合う施設を落とさない");
  });

  test("予算を超える施設は候補にしない", () => {
    const places = [
      makePlace("cheap", START.lat, START.lng, { cost: 500 }),
      makePlace("expensive", START.lat, START.lng, { cost: 9000 }),
    ];
    const selected = selectCandidates(places, { start: START, budget: 1000 });
    assert.deepEqual(selected.map((place) => place.id), ["cheap"]);
  });

  test("使える時間で往復できない施設は候補にしない", () => {
    const places = [
      makePlace("near", START.lat + 0.001, START.lng, { stayMinutes: 30 }),
      makePlace("too-far", START.lat + 0.5, START.lng, { stayMinutes: 30 }),
    ];
    const selected = selectCandidates(places, { start: START, goal: START, availableMinutes: 90 });
    assert.deepEqual(selected.map((place) => place.id), ["near"]);
  });

  test("候補が空でも落ちない", () => {
    assert.deepEqual(selectCandidates([], { start: START }), []);
  });

  test("同じ入力なら毎回同じ並びを返す", () => {
    const places = manyPlaces(100);
    const first = selectCandidates(places, { start: START, limit: 10 });
    const second = selectCandidates(places, { start: START, limit: 10 });
    assert.deepEqual(first.map((p) => p.id), second.map((p) => p.id));
  });
});
