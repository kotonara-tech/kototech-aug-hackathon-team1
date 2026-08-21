import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const catalogUrl = new URL("../app/data/ashiato-spots.json", import.meta.url);

let renderPromise;
let htmlPromise;

async function renderOnce() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

// ビルド済みworkerの呼び出しは1度だけ。全テストで結果を使い回す。
function render() {
  renderPromise ??= renderOnce();
  return renderPromise;
}

function pageHtml() {
  htmlPromise ??= render().then((response) => response.clone().text());
  return htmlPromise;
}

async function readCatalog() {
  return JSON.parse(await readFile(catalogUrl, "utf8"));
}

function countBySection(catalog) {
  const counts = new Map();
  for (const item of catalog.items) {
    for (const section of item.sections) {
      counts.set(section, (counts.get(section) ?? 0) + 1);
    }
  }
  return counts;
}

test("トップページが奈良よりみちの画面をサーバーレンダリングする", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await pageHtml();
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /奈良よりみち｜空き時間からつくる奈良旅/);
  assert.match(html, /SHIKA no ASHIATO/);

  // スターターテンプレートの名残が残っていないこと
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton|codex-preview/i);
});

test("2つの入力モードとルート生成の導線が表示される", async () => {
  const html = await pageHtml();

  assert.match(html, /予定がある旅行/);
  assert.match(html, /いまの空き時間/);
  assert.match(html, /3つのルートをつくる/);

  // 「必ずゴール地点へ戻る」はサービスの必須条件（CLAUDE.md）
  assert.match(html, /出発地へ戻る/);
  assert.match(html, /移動時間込み/);
  assert.match(html, /予算内/);
});

test("3つのルート案が表示される", async () => {
  const html = await pageHtml();

  assert.match(html, /奈良のごはんと町家甘味/);
  assert.match(html, /職人にふれる奈良筆体験/);
  assert.match(html, /きたまちの器と奈良酒/);

  // 試算値であることの但し書きを消さない
  assert.match(html, /プロトタイプ試算/);
});

test("公式カタログの375件とカテゴリ内訳が欠けていない", async () => {
  const catalog = await readCatalog();

  assert.equal(catalog.count, 375);
  assert.equal(catalog.items.length, 375);
  assert.equal(
    catalog.source.url,
    "https://www.city.nara.lg.jp/uploaded/attachment/204172.pdf",
  );

  const names = catalog.items.map((item) => item.name);
  assert.equal(new Set(names).size, 375, "施設名に重複がある");

  for (const item of catalog.items) {
    assert.equal(typeof item.name, "string");
    assert.ok(item.name.length > 0);
    assert.ok(Array.isArray(item.sections) && item.sections.length > 0);
    assert.ok(Array.isArray(item.genres));
    assert.equal(typeof item.narafuru, "boolean");
    assert.ok(Array.isArray(item.sourcePages) && item.sourcePages.length > 0);
    for (const page of item.sourcePages) {
      assert.ok(page >= 1 && page <= 11, `${item.name} の掲載ページが1〜11外`);
    }
  }

  const counts = countBySection(catalog);
  assert.equal(counts.get("グルメ・カフェ"), 188);
  assert.equal(counts.get("お土産・ショッピング"), 127);
  assert.equal(counts.get("文化体験・体験"), 67);
  assert.equal(counts.get("宿泊"), 34);
  assert.equal(counts.get("サービス"), 20);
});

test("画面に表示するカテゴリ件数がカタログの実数と一致する", async () => {
  const [html, catalog] = await Promise.all([pageHtml(), readCatalog()]);

  assert.match(html, new RegExp(`<strong>${catalog.count}</strong>件の掲載スポット`));
  for (const [section, count] of countBySection(catalog)) {
    assert.match(
      html,
      new RegExp(`<span>${count}</span><strong>${section}</strong>`),
      `${section} の表示件数がカタログと一致しない`,
    );
  }
});

test("モーダルと検索欄がキーボード操作に対応している", async () => {
  const page = await readFile(pageUrl, "utf8");

  // jsx-a11y/no-autofocus
  assert.doesNotMatch(page, /autoFocus/, "autoFocus は使わない");
  // Escapeキーで閉じられること（背景クリックだけに頼らない）
  assert.match(page, /"Escape"/, "Escapeキーで閉じる処理がない");
});
