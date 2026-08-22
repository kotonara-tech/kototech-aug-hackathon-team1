import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { mergeLocations } from "../app/lib/spot-locations.ts";

/**
 * 座標の取得元は2つある。どちらを信じるかを決める部分のテスト。
 *
 * - Overpass の完全一致: OpenStreetMap の施設名がそのまま一致した。最も確か
 * - Nominatim: 検索エンジン任せなので、近い名前の別施設を引くことがある
 * - Overpass の部分一致: 「Kakigori ほうせき箱」と「ほうせき箱」のような一致。取り違えの幅が広い
 */
const NOMINATIM = [
  { name: "鹿の舟 竈", lat: 34.6711, lng: 135.8302, address: "奈良県奈良市井上町", displayName: "鹿の舟" },
  { name: "只今食堂", lat: 34.68, lng: 135.83, address: "", displayName: "只今食堂" },
];

const OVERPASS = [
  { name: "鹿の舟 竈", lat: 34.6712, lng: 135.8303, address: "", displayName: "鹿の舟 竈", matchType: "exact" },
  { name: "只今食堂", lat: 34.69, lng: 135.84, address: "", displayName: "只今", matchType: "partial" },
  { name: "ほうせき箱", lat: 34.6805, lng: 135.8295, address: "", displayName: "ほうせき箱", matchType: "exact" },
];

describe("mergeLocations", () => {
  test("両方にある施設は、Overpassの完全一致を優先する", () => {
    const merged = mergeLocations(NOMINATIM, OVERPASS);
    const kamado = merged.find((item) => item.name === "鹿の舟 竈");
    assert.equal(kamado.lat, 34.6712, "Overpassの完全一致を採用する");
    assert.match(kamado.source, /Overpass/);
  });

  test("Overpassが部分一致どまりなら、Nominatimを優先する", () => {
    const merged = mergeLocations(NOMINATIM, OVERPASS);
    const shokudo = merged.find((item) => item.name === "只今食堂");
    assert.equal(shokudo.lat, 34.68, "Nominatimの結果を採用する");
    assert.match(shokudo.source, /Nominatim/);
  });

  test("片方にしかない施設も残す", () => {
    const merged = mergeLocations(NOMINATIM, OVERPASS);
    assert.ok(merged.some((item) => item.name === "ほうせき箱"));
  });

  test("同じ施設が2件になることはない", () => {
    const merged = mergeLocations(NOMINATIM, OVERPASS);
    const names = merged.map((item) => item.name);
    assert.equal(new Set(names).size, names.length);
  });

  test("どの施設にも取得元が入っている", () => {
    const merged = mergeLocations(NOMINATIM, OVERPASS);
    assert.ok(merged.every((item) => typeof item.source === "string" && item.source.length > 0));
  });

  test("座標が数値でないものは捨てる", () => {
    const merged = mergeLocations([{ name: "壊れた店", lat: "abc", lng: null }], []);
    assert.deepEqual(merged, []);
  });

  test("入力が空でも落ちない", () => {
    assert.deepEqual(mergeLocations([], []), []);
    assert.deepEqual(mergeLocations(undefined, undefined), []);
  });

  test("同じ入力なら毎回同じ並びを返す", () => {
    const first = mergeLocations(NOMINATIM, OVERPASS).map((item) => item.name);
    const second = mergeLocations(NOMINATIM, OVERPASS).map((item) => item.name);
    assert.deepEqual(first, second);
  });
});
