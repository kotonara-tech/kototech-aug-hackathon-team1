import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  geocode,
  travelMatrixMinutes,
  buildTravelLookup,
  clearGeocodeCache,
  clearTravelMatrixCache,
  OSM_USER_AGENT,
} from "../app/lib/osm.ts";

// 前のテストで覚えた結果が次のテストへ漏れないようにする
beforeEach(() => {
  clearGeocodeCache();
  clearTravelMatrixCache();
});

/** 呼ばれたURLとヘッダーを記録しつつ、決まった応答を返す偽のfetch。 */
function fakeFetch(response, record = {}) {
  return async (url, init) => {
    record.url = String(url);
    record.headers = init?.headers ?? {};
    if (response instanceof Error) throw response;
    return response;
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("地名から座標を引く（Nominatim）", () => {
  test("正しいURLとUser-Agentで問い合わせる", async () => {
    const record = {};
    await geocode("ならまち", {
      fetchImpl: fakeFetch(jsonResponse([{ lat: "34.6772", lon: "135.8300", display_name: "ならまち" }]), record),
    });

    assert.match(record.url, /^https:\/\/nominatim\.openstreetmap\.org\/search\?/);
    assert.match(record.url, /format=jsonv2/);
    assert.match(record.url, /limit=1/);
    assert.match(record.url, new RegExp(encodeURIComponent("ならまち")));
    // Nominatimの利用規約でUser-Agentの明示が必須
    assert.equal(record.headers["User-Agent"], OSM_USER_AGENT);
  });

  test("結果を座標つきで返す。名前は入力した表記を残す", async () => {
    const result = await geocode("ならまち", {
      fetchImpl: fakeFetch(jsonResponse([{ lat: "34.6772", lon: "135.8300", display_name: "奈良町, 奈良市, 日本" }])),
    });
    assert.deepEqual(result, { name: "ならまち", lat: 34.6772, lng: 135.83 });
  });

  test("該当なしのときは null を返す", async () => {
    const result = await geocode("存在しない場所", { fetchImpl: fakeFetch(jsonResponse([])) });
    assert.equal(result, null);
  });

  test("サーバーがエラーを返したら null を返す", async () => {
    const result = await geocode("ならまち", { fetchImpl: fakeFetch(jsonResponse({}, 503)) });
    assert.equal(result, null);
  });

  test("通信に失敗しても例外を投げずに null を返す", async () => {
    const result = await geocode("ならまち", { fetchImpl: fakeFetch(new Error("network down")) });
    assert.equal(result, null);
  });

  test("座標が数値として読めなければ null を返す", async () => {
    const result = await geocode("ならまち", {
      fetchImpl: fakeFetch(jsonResponse([{ lat: "なにか", lon: "135.83" }])),
    });
    assert.equal(result, null);
  });

  test("同じ地名を2回引いても、問い合わせは1回で済む", async () => {
    let calls = 0;
    const counting = async () => {
      calls += 1;
      return jsonResponse([{ lat: "34.6772", lon: "135.8300" }]);
    };
    const first = await geocode("ならまち", { fetchImpl: counting });
    const second = await geocode("ならまち", { fetchImpl: counting });
    assert.deepEqual(first, second);
    assert.equal(calls, 1, "共有サーバーへ2回問い合わせている");
  });

  test("一時的な失敗は覚えない。次に成功すれば引ける", async () => {
    const failed = await geocode("ならまち", { fetchImpl: fakeFetch(new Error("network down")) });
    assert.equal(failed, null);
    const retried = await geocode("ならまち", {
      fetchImpl: fakeFetch(jsonResponse([{ lat: "34.6772", lon: "135.8300" }])),
    });
    assert.deepEqual(retried, { name: "ならまち", lat: 34.6772, lng: 135.83 });
  });

  test("空の地名は問い合わせずに null を返す", async () => {
    const record = {};
    const result = await geocode("   ", { fetchImpl: fakeFetch(jsonResponse([]), record) });
    assert.equal(result, null);
    assert.equal(record.url, undefined, "空欄なのに問い合わせている");
  });
});

describe("徒歩時間の総当たり表（OSRM foot）", () => {
  const POINTS = [
    { lat: 34.6844, lng: 135.8298 },
    { lat: 34.6778, lng: 135.8306 },
  ];

  test("徒歩用のエンドポイントへ、経度・緯度の順で問い合わせる", async () => {
    const record = {};
    await travelMatrixMinutes(POINTS, {
      fetchImpl: fakeFetch(jsonResponse({ code: "Ok", durations: [[0, 780], [780, 0]] }), record),
    });

    assert.match(record.url, /routed-foot\/table\/v1\/foot\//, "徒歩用のURLでない");
    // OSRMは「経度,緯度」の順
    assert.match(record.url, /135\.8298,34\.6844;135\.8306,34\.6778/);
    assert.equal(record.headers["User-Agent"], OSM_USER_AGENT);
  });

  test("秒を分に直して返す。端数は切り上げる", async () => {
    const matrix = await travelMatrixMinutes(POINTS, {
      fetchImpl: fakeFetch(jsonResponse({ code: "Ok", durations: [[0, 780], [790, 0]] })),
    });
    assert.deepEqual(matrix, [[0, 13], [14, 0]]);
  });

  test("到達できない区間は null のまま残す", async () => {
    const matrix = await travelMatrixMinutes(POINTS, {
      fetchImpl: fakeFetch(jsonResponse({ code: "Ok", durations: [[0, null], [null, 0]] })),
    });
    assert.deepEqual(matrix, [[0, null], [null, 0]]);
  });

  test("codeがOk以外なら null を返す", async () => {
    const matrix = await travelMatrixMinutes(POINTS, {
      fetchImpl: fakeFetch(jsonResponse({ code: "NoRoute" })),
    });
    assert.equal(matrix, null);
  });

  test("通信に失敗しても例外を投げずに null を返す", async () => {
    const matrix = await travelMatrixMinutes(POINTS, { fetchImpl: fakeFetch(new Error("timeout")) });
    assert.equal(matrix, null);
  });

  test("同じ地点の組み合わせを2回頼んでも、問い合わせは1回で済む", async () => {
    // 徒歩ルートの共有サーバーは応答が1〜11秒とばらつくため、覚えておく価値が大きい
    let calls = 0;
    const counting = async () => {
      calls += 1;
      return jsonResponse({ code: "Ok", durations: [[0, 780], [780, 0]] });
    };
    const first = await travelMatrixMinutes(POINTS, { fetchImpl: counting });
    const second = await travelMatrixMinutes(POINTS, { fetchImpl: counting });
    assert.deepEqual(first, second);
    assert.equal(calls, 1, "共有サーバーへ2回問い合わせている");
  });

  test("地点の組み合わせが変われば、あらためて問い合わせる", async () => {
    let calls = 0;
    const counting = async () => {
      calls += 1;
      return jsonResponse({ code: "Ok", durations: [[0, 780], [780, 0]] });
    };
    await travelMatrixMinutes(POINTS, { fetchImpl: counting });
    await travelMatrixMinutes([POINTS[0], { lat: 34.6711, lng: 135.8302 }], { fetchImpl: counting });
    assert.equal(calls, 2, "別の地点なのに前の結果を使い回している");
  });

  test("順番が違えば別の組み合わせとして問い合わせる", async () => {
    let calls = 0;
    const counting = async () => {
      calls += 1;
      return jsonResponse({ code: "Ok", durations: [[0, 780], [780, 0]] });
    };
    await travelMatrixMinutes(POINTS, { fetchImpl: counting });
    await travelMatrixMinutes([POINTS[1], POINTS[0]], { fetchImpl: counting });
    assert.equal(calls, 2, "並び順が違うのに同じ表を使い回している");
  });

  test("失敗は覚えない。次に成功すれば取れる", async () => {
    const failed = await travelMatrixMinutes(POINTS, { fetchImpl: fakeFetch(new Error("timeout")) });
    assert.equal(failed, null);
    const retried = await travelMatrixMinutes(POINTS, {
      fetchImpl: fakeFetch(jsonResponse({ code: "Ok", durations: [[0, 780], [780, 0]] })),
    });
    assert.deepEqual(retried, [[0, 13], [13, 0]]);
  });

  test("地点が1つ以下なら問い合わせない", async () => {
    const record = {};
    const matrix = await travelMatrixMinutes([POINTS[0]], { fetchImpl: fakeFetch(jsonResponse({}), record) });
    assert.equal(matrix, null);
    assert.equal(record.url, undefined);
  });
});

describe("総当たり表から所要時間を引く", () => {
  const POINTS = [
    { lat: 34.6844, lng: 135.8298 },
    { lat: 34.6778, lng: 135.8306 },
    { lat: 34.6759, lng: 135.8314 },
  ];
  const MATRIX = [
    [0, 13, 17],
    [13, 0, 4],
    [17, 4, 0],
  ];

  test("座標の組み合わせから所要時間を引ける", () => {
    const lookup = buildTravelLookup(POINTS, MATRIX);
    assert.equal(lookup(POINTS[0], POINTS[1]), 13);
    assert.equal(lookup(POINTS[2], POINTS[1]), 4);
    assert.equal(lookup(POINTS[0], POINTS[0]), 0);
  });

  test("表に無い地点は null を返す", () => {
    const lookup = buildTravelLookup(POINTS, MATRIX);
    assert.equal(lookup({ lat: 35.0, lng: 136.0 }, POINTS[0]), null);
  });

  test("表の値が null の区間は null を返す", () => {
    const lookup = buildTravelLookup(POINTS, [[0, null, 17], [null, 0, 4], [17, 4, 0]]);
    assert.equal(lookup(POINTS[0], POINTS[1]), null);
  });

  test("表が無いときは常に null を返す", () => {
    const lookup = buildTravelLookup(POINTS, null);
    assert.equal(lookup(POINTS[0], POINTS[1]), null);
  });

  test("わずかな座標の誤差は同じ地点として扱う", () => {
    const lookup = buildTravelLookup(POINTS, MATRIX);
    assert.equal(lookup({ lat: 34.68440001, lng: 135.82980001 }, POINTS[1]), 13);
  });
});
