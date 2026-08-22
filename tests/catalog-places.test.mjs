import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { buildCatalogPlaces } from "../app/lib/catalog-places.ts";

const CATALOG = [
  { name: "37cafe", sections: ["グルメ・カフェ"], genres: ["カフェ", "バー"], narafuru: true, sourcePages: [1] },
  { name: "鹿の舟 竈", sections: ["グルメ・カフェ"], genres: ["和食"], narafuru: true, sourcePages: [2] },
  { name: "座標がない店", sections: ["お土産・ショッピング"], genres: ["雑貨"], narafuru: false, sourcePages: [3] },
];

const LOCATIONS = [
  { name: "37cafe", lat: 34.6801, lng: 135.8299, address: "奈良県奈良市小西町", displayName: "37cafe, 小西町, 奈良市" },
  { name: "鹿の舟 竈", lat: 34.6711, lng: 135.8302, address: "奈良県奈良市井上町", displayName: "鹿の舟, 井上町, 奈良市" },
];

const OVERRIDE = {
  id: "kamado",
  name: "鹿の舟 竈",
  type: "和食・カフェ",
  address: "奈良市井上町11",
  price: "定食 2,200円〜",
  cost: 2200,
  stay: "45分",
  stayMinutes: 45,
  lat: 34.6711,
  lng: 135.8302,
  genres: ["和食", "カフェ", "ならまち"],
  shikaMember: true,
  image: "https://example.com/kamado.png",
  note: "手作業で確認済みの施設。",
  sourceNote: "料金・営業時間：店舗公式サイト",
};

describe("buildCatalogPlaces", () => {
  test("座標がある施設だけがルート候補になる", () => {
    const places = buildCatalogPlaces(CATALOG, LOCATIONS);
    assert.equal(places.length, 2);
    assert.ok(!places.some((place) => place.name === "座標がない店"), "座標が無い施設は候補にしない");
  });

  test("施設名は公式カタログの表記のままにする", () => {
    const places = buildCatalogPlaces(CATALOG, LOCATIONS);
    const names = places.map((place) => place.name);
    assert.deepEqual(names.sort(), ["37cafe", "鹿の舟 竈"].sort());
  });

  test("ルート計算に必要な項目がすべて揃う", () => {
    const [place] = buildCatalogPlaces(CATALOG, LOCATIONS);
    assert.equal(typeof place.id, "string");
    assert.ok(place.id.length > 0);
    assert.ok(Number.isFinite(place.lat));
    assert.ok(Number.isFinite(place.lng));
    assert.ok(Number.isFinite(place.cost));
    assert.ok(place.stayMinutes > 0);
    assert.equal(typeof place.shikaMember, "boolean");
    assert.ok(Array.isArray(place.genres));
  });

  test("公式カタログ掲載なので shikaMember は true になる", () => {
    const places = buildCatalogPlaces(CATALOG, LOCATIONS);
    assert.ok(places.every((place) => place.shikaMember === true));
  });

  test("idは施設ごとに重ならない", () => {
    const places = buildCatalogPlaces(CATALOG, LOCATIONS);
    const ids = new Set(places.map((place) => place.id));
    assert.equal(ids.size, places.length);
  });

  test("出典と取得日を残す", () => {
    const places = buildCatalogPlaces(CATALOG, LOCATIONS, { fetchedAt: "2026-08-22" });
    const place = places.find((item) => item.name === "37cafe");
    assert.match(place.sourceNote, /Nominatim|OpenStreetMap/);
    assert.match(place.sourceNote, /2026-08-22/);
    assert.match(place.sourceNote, /試算|目安/, "料金と滞在時間が試算であることを示す");
  });

  test("手作業で確認済みの施設は、そちらの値を優先する", () => {
    const places = buildCatalogPlaces(CATALOG, LOCATIONS, { overrides: [OVERRIDE] });
    const kamado = places.find((place) => place.name === "鹿の舟 竈");
    assert.equal(kamado.id, "kamado");
    assert.equal(kamado.cost, 2200);
    assert.equal(kamado.stayMinutes, 45);
    assert.equal(kamado.address, "奈良市井上町11");
    assert.equal(kamado.sourceNote, OVERRIDE.sourceNote);
  });

  test("手作業データを足しても施設が重複しない", () => {
    const places = buildCatalogPlaces(CATALOG, LOCATIONS, { overrides: [OVERRIDE] });
    const kamados = places.filter((place) => place.name === "鹿の舟 竈");
    assert.equal(kamados.length, 1);
  });

  test("同じ入力なら毎回同じ順序・同じidを返す", () => {
    const first = buildCatalogPlaces(CATALOG, LOCATIONS);
    const second = buildCatalogPlaces(CATALOG, LOCATIONS);
    assert.deepEqual(first.map((place) => place.id), second.map((place) => place.id));
  });

  test("座標データが空でも落ちない", () => {
    assert.deepEqual(buildCatalogPlaces(CATALOG, []), []);
  });
});

describe("buildCatalogPlaces の出典表示", () => {
  test("座標の取得元が分かっていれば、その名前を出典に出す", () => {
    const locations = [
      { name: "37cafe", lat: 34.68, lng: 135.83, source: "OpenStreetMap Overpass API（名前の完全一致）" },
    ];
    const [place] = buildCatalogPlaces(CATALOG, locations, { fetchedAt: "2026-08-22" });
    assert.match(place.sourceNote, /Overpass/, "取得元をそのまま出す");
  });

  test("取得元が無いときは OpenStreetMap とだけ書く", () => {
    const [place] = buildCatalogPlaces(CATALOG, LOCATIONS, { fetchedAt: "2026-08-22" });
    assert.match(place.sourceNote, /OpenStreetMap/);
  });
});

describe("buildCatalogPlaces の住所", () => {
  test("住所が取れていない施設にも、空でない文言を入れる", () => {
    const locations = [{ name: "37cafe", lat: 34.68, lng: 135.83 }];
    const [place] = buildCatalogPlaces(CATALOG, locations);
    assert.ok(place.address.length > 0, "住所欄が空だと画面に何も出せない");
    assert.match(place.address, /奈良/);
  });

  test("住所が取れている施設は、その住所をそのまま使う", () => {
    const [place] = buildCatalogPlaces(CATALOG, LOCATIONS);
    assert.equal(place.address, "奈良県奈良市小西町");
  });
});

describe("ルート候補にしないカテゴリ", () => {
  const MIXED = [
    { name: "ふつうのカフェ", sections: ["グルメ・カフェ"], genres: ["カフェ"], narafuru: true, sourcePages: [1] },
    { name: "とあるホテル", sections: ["宿泊"], genres: ["ホテル"], narafuru: true, sourcePages: [1] },
    { name: "とある接骨院", sections: ["サービス"], genres: ["その他"], narafuru: false, sourcePages: [1] },
    { name: "食事もできる旅館", sections: ["宿泊", "グルメ・カフェ"], genres: ["旅館"], narafuru: true, sourcePages: [1] },
  ];
  const MIXED_LOCATIONS = MIXED.map((item, index) => ({
    name: item.name,
    lat: 34.68 + index * 0.001,
    lng: 135.83,
  }));

  test("宿泊だけの施設は寄り道先にしない", () => {
    const places = buildCatalogPlaces(MIXED, MIXED_LOCATIONS);
    assert.ok(!places.some((place) => place.name === "とあるホテル"), "泊まる場所は寄り道先ではない");
  });

  test("サービスだけの施設は寄り道先にしない", () => {
    const places = buildCatalogPlaces(MIXED, MIXED_LOCATIONS);
    assert.ok(!places.some((place) => place.name === "とある接骨院"), "接骨院は寄り道先ではない");
  });

  test("飲食も兼ねる宿は寄り道先にできる", () => {
    const places = buildCatalogPlaces(MIXED, MIXED_LOCATIONS);
    assert.ok(places.some((place) => place.name === "食事もできる旅館"));
  });

  test("グルメ・お土産・文化体験はそのまま候補になる", () => {
    const places = buildCatalogPlaces(MIXED, MIXED_LOCATIONS);
    assert.ok(places.some((place) => place.name === "ふつうのカフェ"));
  });
});
