import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

/**
 * /api/routes をビルド済みworker経由で呼ぶ。
 *
 * OpenStreetMapへの通信は globalThis.fetch を差し替えて偽物にする。
 * 共有のボランティアサーバーをテストのたびに叩かないため、また
 * 通信状況でテストの結果が変わらないようにするため。
 */

let worker;
let realFetch;
/** 直近の呼び出しURLの記録。どこへ何回問い合わせたかを検査する。 */
let calls;
/** 偽の徒歩時間（分）。1区間あたりこの値を返す。 */
let stubTravelMinutes;
/** OSRMの応答を失敗させるかどうか。 */
let failMatrix;
/** Nominatimの応答を失敗させるかどうか。 */
let failGeocode;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubFetch(url) {
  const href = String(url);
  calls.push(href);

  if (href.includes("nominatim.openstreetmap.org")) {
    if (failGeocode) return Promise.resolve(jsonResponse({}, 503));
    // 奈良公園あたりの座標を返す
    return Promise.resolve(jsonResponse([{ lat: "34.6851", lon: "135.8430" }]));
  }

  if (href.includes("routed-foot")) {
    if (failMatrix) return Promise.resolve(jsonResponse({}, 503));
    const coordinates = href.split("/foot/")[1] ?? "";
    const size = coordinates.split(";").length;
    const durations = Array.from({ length: size }, (_, i) =>
      Array.from({ length: size }, (_, j) => (i === j ? 0 : stubTravelMinutes * 60)),
    );
    return Promise.resolve(jsonResponse({ code: "Ok", durations }));
  }

  throw new Error(`テストが想定していない外部通信: ${href}`);
}

before(async () => {
  realFetch = globalThis.fetch;
  globalThis.fetch = stubFetch;

  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  worker = (await import(workerUrl.href)).default;
});

after(() => {
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  calls = [];
  stubTravelMinutes = 5;
  failMatrix = false;
  failGeocode = false;
});

function callApi(body, method = "POST") {
  return worker.fetch(
    new Request("http://localhost/api/routes", {
      method,
      headers: { "content-type": "application/json" },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

const PLANNED = {
  mode: "planned",
  freeStart: "11:30",
  freeEnd: "14:15",
  budget: "3000",
  start: "近鉄奈良駅",
  returnTo: "近鉄奈良駅",
  notes: "ならまち、甘いもの",
};

describe("POST /api/routes", () => {
  test("条件を渡すとルートがJSONで返る", async () => {
    const response = await callApi(PLANNED);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);

    const data = await response.json();
    assert.ok(Array.isArray(data.routes), "routes が配列でない");
    assert.ok(data.routes.length > 0, "ルートが1件も返っていない");
    assert.ok(data.routes.length <= 3, `${data.routes.length}件返っている`);
    assert.equal(data.budget, 3000);
  });

  test("すべてのルートが予算内で、ゴールへ戻れる", async () => {
    const data = await (await callApi(PLANNED)).json();
    for (const route of data.routes) {
      assert.ok(route.totalCost <= 3000, `${route.id}: ${route.totalCost}円`);
      // 11:30〜14:15 は165分。安全余裕10分を引いた155分以内であること。
      assert.ok(route.returnMinutes <= 155, `${route.id}: ${route.returnMinutes}分`);
    }
  });

  test("画面に必要な項目が揃っている", async () => {
    const data = await (await callApi(PLANNED)).json();
    for (const route of data.routes) {
      assert.ok(route.title.length > 0, `${route.id}: 見出しが空`);
      assert.match(route.durationLabel, /分|時間/);
      assert.match(route.walkLabel, /徒歩/);
      assert.match(route.returnClock, /^\d{2}:\d{2}$/, `${route.id}: 帰着時刻がない`);
      assert.ok(route.stops.length > 0, `${route.id}: 立ち寄り先が空`);
      for (const stop of route.stops) {
        assert.ok(stop.name.length > 0);
        assert.ok(stop.address.length > 0, `${stop.name}: 住所がない`);
        assert.ok(stop.sourceNote.length > 0, `${stop.name}: 出典がない`);
        assert.match(stop.arrivalClock, /^\d{2}:\d{2}$/, `${stop.name}: 到着時刻がない`);
      }
    }
  });

  test("提案する施設は公式カタログに載っている", async () => {
    const data = await (await callApi(PLANNED)).json();
    for (const route of data.routes) {
      for (const stop of route.stops) {
        assert.equal(stop.shikaMember, true, `${stop.name} が掲載施設になっていない`);
      }
    }
  });

  test("空き時間モードでも計算できる", async () => {
    const response = await callApi({
      mode: "gap",
      duration: "2時間30分",
      budget: "2000",
      start: "JR奈良駅",
      returnTo: "近鉄奈良駅",
      notes: "",
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.ok(data.routes.length > 0);
    for (const route of data.routes) {
      assert.ok(route.totalCost <= 2000, `${route.id}: ${route.totalCost}円`);
      // 開始時刻が分からないモードなので、時計表示は付かない
      assert.equal(route.returnClock, undefined);
    }
  });

  test("備考の希望が結果に反映される", async () => {
    const data = await (await callApi({ ...PLANNED, notes: "日本酒" })).json();
    const names = data.routes[0].stops.map((stop) => stop.name).join("");
    assert.match(names, /泉勇斎/, "「日本酒」を指定したのに酒の店が1番目に入っていない");
  });

  test("条件に合うルートが無いときは、空の配列と理由を返す", async () => {
    const response = await callApi({ ...PLANNED, freeStart: "11:30", freeEnd: "12:05" });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.routes, []);
    assert.ok(typeof data.message === "string" && data.message.length > 0, "理由の説明がない");
  });
});

describe("OpenStreetMap の徒歩時間を使う", () => {
  test("実際の徒歩時間が取れたら、それを使ったと明示する", async () => {
    const data = await (await callApi(PLANNED)).json();
    assert.equal(data.travelSource, "osm");
    for (const route of data.routes) {
      for (const stop of route.stops) {
        assert.equal(stop.travelMinutes, 5, `${stop.name}: 取得した徒歩時間が使われていない`);
      }
    }
  });

  // 徒歩時間は地点の組み合わせごとに覚えるので、
  // 問い合わせ回数を数えるテストは、他と重ならない出発地を使う。
  test("徒歩時間の問い合わせは1回だけ（区間ごとに呼ばない）", async () => {
    await callApi({ ...PLANNED, start: "東大寺", returnTo: "東大寺" });
    const matrixCalls = calls.filter((url) => url.includes("routed-foot"));
    assert.equal(matrixCalls.length, 1, `${matrixCalls.length}回問い合わせている`);
  });

  test("同じ条件を2回頼んでも、問い合わせは1回で済む", async () => {
    // 共有サーバーの応答は1〜11秒とばらつくため、覚えておく効果が大きい
    const request = { ...PLANNED, start: "春日大社", returnTo: "春日大社" };
    await callApi(request);
    await callApi(request);
    const matrixCalls = calls.filter((url) => url.includes("routed-foot"));
    assert.equal(matrixCalls.length, 1, `${matrixCalls.length}回問い合わせている`);
  });

  test("徒歩時間が長ければ、その分だけ提案が変わる", async () => {
    stubTravelMinutes = 5;
    const quick = await (await callApi({ ...PLANNED, start: "奈良公園", returnTo: "奈良公園" })).json();
    stubTravelMinutes = 40;
    const slow = await (await callApi({ ...PLANNED, start: "ならまち", returnTo: "ならまち" })).json();

    const maxStopsQuick = Math.max(...quick.routes.map((route) => route.stops.length));
    const maxStopsSlow = slow.routes.length === 0 ? 0 : Math.max(...slow.routes.map((route) => route.stops.length));
    assert.ok(maxStopsSlow < maxStopsQuick, "徒歩時間を増やしても提案が変わっていない");
  });

  test("外部サービスが落ちていても、概算に切り替えて提案を返す", async () => {
    failMatrix = true;
    const response = await callApi({ ...PLANNED, start: "きたまち", returnTo: "きたまち" });
    assert.equal(response.status, 200, "外部サービスの障害で画面が止まっている");
    const data = await response.json();
    assert.ok(data.routes.length > 0, "概算に切り替えられていない");
    assert.equal(data.travelSource, "estimate");
  });
});

describe("OpenStreetMap で地名を座標に直す", () => {
  test("知らない地名は問い合わせて座標を得る", async () => {
    await callApi({ ...PLANNED, start: "元興寺", returnTo: "元興寺" });
    const geocodeCalls = calls.filter((url) => url.includes("nominatim"));
    assert.ok(geocodeCalls.length > 0, "知らない地名なのに問い合わせていない");
    assert.match(geocodeCalls[0], new RegExp(encodeURIComponent("元興寺")));
  });

  test("知っている地名は問い合わせない（共有サーバーへの負荷を避ける）", async () => {
    await callApi(PLANNED);
    const geocodeCalls = calls.filter((url) => url.includes("nominatim"));
    assert.equal(geocodeCalls.length, 0, "知っている地名なのに問い合わせている");
  });

  test("地名が引けなくても、既定の地点で提案を返す", async () => {
    failGeocode = true;
    const response = await callApi({ ...PLANNED, start: "存在しない地名", returnTo: "存在しない地名" });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.ok(data.routes.length > 0, "地名が引けないだけで提案が止まっている");
  });
});

describe("POST /api/routes の入力エラー", () => {
  test("時刻が逆転していたら400と日本語の理由を返す", async () => {
    const response = await callApi({ ...PLANNED, freeStart: "14:15", freeEnd: "11:30" });
    assert.equal(response.status, 400);
    const data = await response.json();
    assert.ok(typeof data.error === "string" && data.error.length > 0);
    assert.match(data.error, /終了/);
  });

  test("入力が誤りのときは外部サービスへ問い合わせない", async () => {
    await callApi({ ...PLANNED, freeStart: "14:15", freeEnd: "11:30" });
    assert.deepEqual(calls, [], "無駄な外部通信が発生している");
  });

  test("使える時間が短すぎたら400を返す", async () => {
    const response = await callApi({ mode: "gap", duration: "5分", budget: "1000" });
    assert.equal(response.status, 400);
    const data = await response.json();
    assert.match(data.error, /短/);
  });

  test("本文がJSONでなければ400を返す", async () => {
    const response = await worker.fetch(
      new Request("http://localhost/api/routes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "これはJSONではない",
      }),
      { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} },
    );
    assert.equal(response.status, 400);
  });

  test("GETでは受け付けない", async () => {
    const response = await callApi(null, "GET");
    assert.equal(response.status, 405);
  });
});

describe("POST /api/routes の候補", () => {
  const NEAR_TODAIJI = {
    mode: "gap",
    duration: "150",
    budget: "3000",
    start: "東大寺",
    returnTo: "東大寺",
    notes: "",
  };

  test("手作業の6件だけでなく、公式カタログの施設からも提案する", async () => {
    const { SAMPLE_PLACES } = await import("../app/lib/places.ts");
    const curated = new Set(SAMPLE_PLACES.map((place) => place.name));

    const data = await (await callApi(NEAR_TODAIJI)).json();
    const names = data.routes.flatMap((route) => route.stops.map((stop) => stop.name));
    assert.ok(names.length > 0, "立ち寄り先が空");
    assert.ok(
      names.some((name) => !curated.has(name)),
      `手作業の6件しか出ていない: ${names.join(", ")}`,
    );
  });

  test("提案される施設は、すべて公式カタログに載っている", async () => {
    const catalog = (await import("../app/data/ashiato-spots.json", { with: { type: "json" } })).default;
    const catalogNames = new Set(catalog.items.map((item) => item.name));

    const data = await (await callApi(NEAR_TODAIJI)).json();
    for (const route of data.routes) {
      for (const stop of route.stops) {
        assert.ok(catalogNames.has(stop.name), `カタログに無い施設: ${stop.name}`);
      }
    }
  });

  test("徒歩時間表に渡す地点数は、共有サーバーに配慮して抑える", async () => {
    // 徒歩時間表は座標の組み合わせごとにキャッシュされるので、テストごとに出発地を変える
    await callApi({ ...NEAR_TODAIJI, start: "奈良公園", returnTo: "奈良公園" });
    const matrixCall = calls.find((call) => call.includes("routed-foot"));
    assert.ok(matrixCall, "徒歩時間表を1回も呼んでいない");
    const size = (matrixCall.split("/foot/")[1] ?? "").split(";").length;
    assert.ok(size <= 30, `${size}か所渡している。多すぎる`);
  });

  test("候補が増えても、外部への通信回数は増やさない", async () => {
    await callApi(NEAR_TODAIJI);
    const matrixCalls = calls.filter((call) => call.includes("routed-foot"));
    // 区間ごとに呼ぶ実装に戻っていないことの見張り。キャッシュが効けば0回になる。
    assert.ok(matrixCalls.length <= 1, `徒歩時間表を${matrixCalls.length}回呼んでいる`);
  });
});
