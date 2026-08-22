import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  parseBudget,
  parseDurationText,
  minutesBetween,
  resolveWaypoint,
  isKnownWaypoint,
  buildRouteRequest,
  DEFAULT_WAYPOINT,
} from "../app/lib/route-request.ts";

describe("予算の読み取り", () => {
  test("数字だけの入力をそのまま使う", () => {
    assert.equal(parseBudget("3000"), 3000);
  });

  test("カンマや「円」が付いていても読める", () => {
    assert.equal(parseBudget("3,000円"), 3000);
    assert.equal(parseBudget("￥1,200"), 1200);
    assert.equal(parseBudget("1500円くらい"), 1500);
  });

  test("空欄や数字なしは0円として扱う", () => {
    assert.equal(parseBudget(""), 0);
    assert.equal(parseBudget("   "), 0);
    assert.equal(parseBudget("おまかせ"), 0);
  });

  test("マイナスにはならない", () => {
    assert.equal(parseBudget("-500"), 500);
  });
});

describe("使える時間の読み取り", () => {
  test("「2時間30分」を150分として読む", () => {
    assert.equal(parseDurationText("2時間30分"), 150);
  });

  test("「1時間」「90分」も読める", () => {
    assert.equal(parseDurationText("1時間"), 60);
    assert.equal(parseDurationText("90分"), 90);
    assert.equal(parseDurationText("3時間"), 180);
  });

  test("数字だけなら分として読む", () => {
    assert.equal(parseDurationText("120"), 120);
  });

  test("読み取れない入力は null を返す", () => {
    assert.equal(parseDurationText(""), null);
    assert.equal(parseDurationText("たっぷり"), null);
  });
});

describe("開始・終了時刻からの計算", () => {
  test("11:30から14:15までは165分", () => {
    assert.equal(minutesBetween("11:30", "14:15"), 165);
  });

  test("同じ時刻や逆転している場合は null を返す", () => {
    assert.equal(minutesBetween("14:15", "14:15"), null);
    assert.equal(minutesBetween("14:15", "11:30"), null);
  });

  test("時刻の形式が違うときは null を返す", () => {
    assert.equal(minutesBetween("", "14:15"), null);
    assert.equal(minutesBetween("11時30分", "14:15"), null);
  });
});

describe("地点の座標の解決", () => {
  test("知っている地点名は座標つきで返す", () => {
    const station = resolveWaypoint("近鉄奈良駅");
    assert.equal(station.name, "近鉄奈良駅");
    assert.ok(station.lat > 34 && station.lat < 35, "緯度が奈良の範囲にない");
    assert.ok(station.lng > 135 && station.lng < 136, "経度が奈良の範囲にない");
  });

  test("前後の空白や表記ゆれを吸収する", () => {
    assert.deepEqual(resolveWaypoint("  近鉄奈良駅 "), resolveWaypoint("近鉄奈良駅"));
    assert.equal(resolveWaypoint("JR奈良駅").name, "JR奈良駅");
  });

  test("知らない地点名は入力された名前のまま、既定の座標を使う", () => {
    const unknown = resolveWaypoint("よく分からない場所");
    assert.equal(unknown.name, "よく分からない場所");
    assert.equal(unknown.lat, DEFAULT_WAYPOINT.lat);
    assert.equal(unknown.lng, DEFAULT_WAYPOINT.lng);
  });

  test("空欄なら既定の地点を返す", () => {
    assert.deepEqual(resolveWaypoint(""), DEFAULT_WAYPOINT);
  });

  test("座標を知っている地点かどうかを判別できる", () => {
    // 知っている地点は外部サービスへ問い合わせずに済ませたい
    assert.equal(isKnownWaypoint("近鉄奈良駅"), true);
    assert.equal(isKnownWaypoint("  JR奈良駅 "), true);
    assert.equal(isKnownWaypoint("よく分からない場所"), false);
    assert.equal(isKnownWaypoint(""), true, "空欄は既定の地点として扱う");
  });
});

describe("画面の入力から計算用の条件を組み立てる", () => {
  const PLANNED = {
    mode: "planned",
    freeStart: "11:30",
    freeEnd: "14:15",
    duration: "",
    budget: "3000",
    start: "近鉄奈良駅",
    returnTo: "近鉄奈良駅",
    notes: "ならまち、甘いもの",
  };

  const GAP = {
    mode: "gap",
    freeStart: "",
    freeEnd: "",
    duration: "2時間30分",
    budget: "2,000円",
    start: "JR奈良駅",
    returnTo: "近鉄奈良駅",
    notes: "",
  };

  test("予定ありモードは開始・終了時刻から時間を出す", () => {
    const result = buildRouteRequest(PLANNED);
    assert.equal(result.ok, true);
    assert.equal(result.request.availableMinutes, 165);
    assert.equal(result.request.budget, 3000);
    assert.equal(result.request.notes, "ならまち、甘いもの");
  });

  test("空き時間モードは所要時間の文字から時間を出す", () => {
    const result = buildRouteRequest(GAP);
    assert.equal(result.ok, true);
    assert.equal(result.request.availableMinutes, 150);
    assert.equal(result.request.budget, 2000);
  });

  test("出発地とゴールをそれぞれ座標つきで持つ", () => {
    const result = buildRouteRequest(GAP);
    assert.equal(result.request.start.name, "JR奈良駅");
    assert.equal(result.request.goal.name, "近鉄奈良駅");
    assert.notEqual(result.request.start.lat, result.request.goal.lat);
  });

  test("ゴールが空欄なら出発地へ戻る条件にする", () => {
    const result = buildRouteRequest({ ...PLANNED, returnTo: "" });
    assert.equal(result.request.goal.name, result.request.start.name);
  });

  test("時刻が逆転していたら日本語の理由つきで断る", () => {
    const result = buildRouteRequest({ ...PLANNED, freeStart: "14:15", freeEnd: "11:30" });
    assert.equal(result.ok, false);
    assert.match(result.error, /終了/);
  });

  test("空き時間モードで時間が読めなければ断る", () => {
    const result = buildRouteRequest({ ...GAP, duration: "たっぷり" });
    assert.equal(result.ok, false);
    assert.ok(result.error.length > 0);
  });

  test("使える時間が短すぎる場合も断る", () => {
    const result = buildRouteRequest({ ...GAP, duration: "5分" });
    assert.equal(result.ok, false);
    assert.match(result.error, /短/);
  });

  test("予定ありモードでは開始時刻を時計表示用に持ち回る", () => {
    const result = buildRouteRequest(PLANNED);
    assert.equal(result.startClock, "11:30");
  });

  test("空き時間モードでは開始時刻を持たない", () => {
    const result = buildRouteRequest(GAP);
    assert.equal(result.startClock, undefined);
  });
});
