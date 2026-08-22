import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  NARA_STATION,
  isValidLatLng,
  buildMapPoints,
  computeBounds,
  computeCenter,
  buildWalkLine,
} from "../app/lib/map-view.ts";

const STOP_A = { id: "nakanishi", name: "寧楽菓子司 中西与三郎", lat: 34.6778, lng: 135.8306 };
const STOP_B = { id: "kamado", name: "鹿の舟 竈", lat: 34.6711, lng: 135.8302 };

describe("NARA_STATION（プロトタイプの固定値）", () => {
  test("近鉄奈良駅の固定座標を持つ", () => {
    assert.equal(NARA_STATION.lat, 34.6829);
    assert.equal(NARA_STATION.lng, 135.8291);
  });
});

describe("isValidLatLng", () => {
  test("有効な緯度経度は true", () => {
    assert.equal(isValidLatLng(34.6829, 135.8291), true);
  });

  test("NaN は false", () => {
    assert.equal(isValidLatLng(NaN, 135.8291), false);
    assert.equal(isValidLatLng(34.6829, NaN), false);
  });

  test("緯度が範囲外（±90超）は false", () => {
    assert.equal(isValidLatLng(91, 135), false);
    assert.equal(isValidLatLng(-91, 135), false);
  });

  test("経度が範囲外（±180超）は false", () => {
    assert.equal(isValidLatLng(34, 181), false);
    assert.equal(isValidLatLng(34, -181), false);
  });
});

describe("buildMapPoints", () => {
  test("起点と立ち寄り先2件から3点をつくる", () => {
    const points = buildMapPoints([STOP_A, STOP_B], NARA_STATION);
    assert.equal(points.length, 3);
    assert.equal(points[0].kind, "origin");
    assert.equal(points[0].lat, NARA_STATION.lat);
    assert.equal(points[0].lng, NARA_STATION.lng);
    assert.equal(points[1].kind, "stop");
    assert.equal(points[1].order, 1);
    assert.equal(points[1].id, "nakanishi");
    assert.equal(points[2].kind, "stop");
    assert.equal(points[2].order, 2);
    assert.equal(points[2].id, "kamado");
  });

  test("不正な座標の立ち寄り先は除外する", () => {
    const brokenStop = { id: "broken", name: "座標なし", lat: NaN, lng: 135.8 };
    const points = buildMapPoints([STOP_A, brokenStop], NARA_STATION);
    assert.equal(points.length, 2);
    assert.ok(!points.some((p) => p.id === "broken"));
  });

  test("起点の座標が不正なら起点を含めない", () => {
    const points = buildMapPoints([STOP_A], { lat: NaN, lng: 135.8291 });
    assert.equal(points.length, 1);
    assert.equal(points[0].kind, "stop");
  });
});

describe("computeBounds", () => {
  test("複数点の境界を南西・北東で返す", () => {
    const bounds = computeBounds([NARA_STATION, STOP_A, STOP_B]);
    assert.ok(bounds);
    assert.ok(bounds!.southWest.lat <= STOP_B.lat);
    assert.ok(bounds!.northEast.lat >= NARA_STATION.lat);
    assert.ok(bounds!.southWest.lng <= Math.min(NARA_STATION.lng, STOP_A.lng, STOP_B.lng));
    assert.ok(bounds!.northEast.lng >= Math.max(NARA_STATION.lng, STOP_A.lng, STOP_B.lng));
  });

  test("点が1つのときも境界が潰れない", () => {
    const bounds = computeBounds([NARA_STATION]);
    assert.ok(bounds);
    assert.ok(bounds!.northEast.lat > bounds!.southWest.lat);
    assert.ok(bounds!.northEast.lng > bounds!.southWest.lng);
  });

  test("有効な点が1つもなければ null", () => {
    assert.equal(computeBounds([{ lat: NaN, lng: NaN }]), null);
    assert.equal(computeBounds([]), null);
  });
});

describe("computeCenter", () => {
  test("複数点の中心座標を平均で出す", () => {
    const center = computeCenter([
      { lat: 0, lng: 0 },
      { lat: 2, lng: 4 },
    ]);
    assert.ok(center);
    assert.equal(center!.lat, 1);
    assert.equal(center!.lng, 2);
  });

  test("有効な点が1つもなければ null", () => {
    assert.equal(computeCenter([]), null);
    assert.equal(computeCenter([{ lat: NaN, lng: 135 }]), null);
  });
});

describe("buildWalkLine", () => {
  test("START → 立ち寄り先 → GOAL の順で座標列をつくる", () => {
    const line = buildWalkLine(NARA_STATION, [STOP_A, STOP_B], NARA_STATION);
    assert.equal(line.length, 4);
    assert.deepEqual(line[0], NARA_STATION);
    assert.deepEqual(line[1], { lat: STOP_A.lat, lng: STOP_A.lng });
    assert.deepEqual(line[2], { lat: STOP_B.lat, lng: STOP_B.lng });
    assert.deepEqual(line[3], NARA_STATION);
  });

  test("不正な座標の立ち寄り先は線から除外する", () => {
    const brokenStop = { id: "broken", name: "座標なし", lat: NaN, lng: 135.8 };
    const line = buildWalkLine(NARA_STATION, [STOP_A, brokenStop], NARA_STATION);
    assert.equal(line.length, 3);
  });
});
