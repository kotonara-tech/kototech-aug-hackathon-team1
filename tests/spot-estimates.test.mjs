import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { estimateSpot, ESTIMATE_NOTE } from "../app/lib/spot-estimates.ts";

/**
 * 料金と滞在時間の「目安」を決める部分のテスト。
 *
 * 公式カタログには料金も滞在時間も入っていないため、カテゴリとジャンルから
 * 試算するしかない。ここで作る値はリアルタイムの料金ではなく試算値であり、
 * 画面でもそう表示する。
 */
describe("estimateSpot", () => {
  test("グルメ・カフェは食事の目安料金と滞在時間になる", () => {
    const result = estimateSpot({ sections: ["グルメ・カフェ"], genres: ["カフェ", "飲食"] });
    assert.equal(result.type, "グルメ・カフェ");
    assert.ok(result.cost > 0, "飲食は無料ではない");
    assert.ok(result.stayMinutes >= 30, "食事は30分以上を見込む");
  });

  test("お土産・ショッピングは滞在時間が短い", () => {
    const shopping = estimateSpot({ sections: ["お土産・ショッピング"], genres: ["雑貨"] });
    const gourmet = estimateSpot({ sections: ["グルメ・カフェ"], genres: ["飲食"] });
    assert.ok(shopping.stayMinutes < gourmet.stayMinutes, "買い物は食事より短い想定");
  });

  test("文化体験は滞在時間が長い", () => {
    const culture = estimateSpot({ sections: ["文化体験・体験"], genres: ["体験"] });
    assert.ok(culture.stayMinutes >= 60, "体験は60分以上を見込む");
  });

  test("ジャンルが料金の目安を上書きする", () => {
    const ramen = estimateSpot({ sections: ["グルメ・カフェ"], genres: ["ラーメン"] });
    const sushi = estimateSpot({ sections: ["グルメ・カフェ"], genres: ["寿司"] });
    assert.ok(sushi.cost > ramen.cost, "寿司はラーメンより高い目安にする");
  });

  test("カテゴリが分からなくても値が返る", () => {
    const result = estimateSpot({ sections: [], genres: [] });
    assert.ok(Number.isFinite(result.cost));
    assert.ok(result.stayMinutes > 0);
    assert.equal(typeof result.type, "string");
    assert.ok(result.type.length > 0);
  });

  test("複数カテゴリのときは最初のカテゴリを使う", () => {
    const result = estimateSpot({ sections: ["文化体験・体験", "お土産・ショッピング"], genres: [] });
    assert.equal(result.type, "文化体験・体験");
  });

  test("試算であることを示す文言を持つ", () => {
    assert.match(ESTIMATE_NOTE, /試算|目安/);
  });
});
