/**
 * 公式カタログ375施設の座標を、Nominatim で事前に引いて JSON に保存する。
 *
 * 実行中（ルート生成のたび）ではなく、**事前に1回だけ**走らせるための道具である。
 * Nominatim は利用規約で毎秒1リクエストまでと定めているので、必ず間隔を空ける。
 *
 *   node scripts/geocode-spots.mjs
 *
 * 途中で止めても、次に走らせると引けていない施設から再開する（結果を都度保存するため）。
 *
 * 注意:
 * - カタログには施設名しか無いため、同名・類似名で別の場所を引く可能性がある。
 *   引けた結果には display_name を残してあるので、目視で確認できる。
 * - 引けなかった施設は failed に残す。座標が無い施設はルート候補にできない。
 *
 * 出典・規約: https://operations.osmfoundation.org/policies/nominatim/
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CATALOG_PATH = resolve(ROOT, "app/data/ashiato-spots.json");
const OUTPUT_PATH = resolve(ROOT, "app/data/spot-locations.json");

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "nara-yorimichi/0.1 (hackathon prototype; local use)";
/** 規約は毎秒1件まで。余裕を持たせる。 */
const INTERVAL_MS = 1100;
const TIMEOUT_MS = 15000;

/**
 * 奈良市の中心部を囲む枠。
 * 枠の外は返さない（bounded=1）ので、同名の別の場所を引く事故が減る。
 * 左, 上, 右, 下 の順で経度・緯度を渡す。
 */
const VIEWBOX = "135.72,34.73,135.92,34.60";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function requestJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "ja" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 施設名から座標を引く。
 * 1回目は奈良市の枠に限定して検索し、見つからなければ「奈良市 ＋ 施設名」で広げて再検索する。
 */
async function lookup(name) {
  const bounded = `${ENDPOINT}?q=${encodeURIComponent(name)}&format=jsonv2&limit=1&countrycodes=jp&viewbox=${VIEWBOX}&bounded=1&addressdetails=1`;
  const first = await requestJson(bounded);
  const hit = pickHit(first);
  if (hit) return { ...hit, query: name, strategy: "viewbox" };

  await sleep(INTERVAL_MS);
  const widened = `${ENDPOINT}?q=${encodeURIComponent(`奈良市 ${name}`)}&format=jsonv2&limit=1&countrycodes=jp&addressdetails=1`;
  const second = await requestJson(widened);
  const wideHit = pickHit(second);
  if (wideHit) return { ...wideHit, query: `奈良市 ${name}`, strategy: "widened" };

  return null;
}

function pickHit(body) {
  if (!Array.isArray(body) || body.length === 0) return null;
  const top = body[0];
  const lat = Number(top?.lat);
  const lng = Number(top?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    displayName: typeof top?.display_name === "string" ? top.display_name : "",
    address: buildAddress(top?.address),
    osmType: top?.osm_type ?? null,
    osmId: top?.osm_id ?? null,
    category: top?.category ?? null,
  };
}

/** 日本語の住所らしい並び（県 → 市 → 町 → 番地）に組み立てる。 */
function buildAddress(address) {
  if (!address || typeof address !== "object") return "";
  const parts = [
    address.province ?? address.state,
    address.city ?? address.town ?? address.village,
    address.suburb ?? address.quarter,
    address.neighbourhood,
    address.house_number,
  ];
  return parts.filter((part) => typeof part === "string" && part.length > 0).join("");
}

async function loadExisting() {
  try {
    const raw = await readFile(OUTPUT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      failed: Array.isArray(parsed.failed) ? parsed.failed : [],
    };
  } catch {
    return { items: [], failed: [] };
  }
}

async function save(items, failed, finished) {
  const body = {
    source: {
      service: "Nominatim (OpenStreetMap)",
      endpoint: ENDPOINT,
      policy: "https://operations.osmfoundation.org/policies/nominatim/",
      note: "施設名だけで検索しているため、同名の別施設を引いている可能性がある。displayName で目視確認すること。",
    },
    fetchedAt: new Date().toISOString(),
    finished,
    count: items.length,
    failedCount: failed.length,
    items,
    failed,
  };
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

async function main() {
  const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  const names = catalog.items.map((item) => item.name);

  const existing = await loadExisting();
  const done = new Map(existing.items.map((item) => [item.name, item]));
  const failed = new Set(existing.failed);

  console.log(`カタログ ${names.length}件 / 取得済み ${done.size}件 / 前回失敗 ${failed.size}件`);

  let processed = 0;
  for (const name of names) {
    if (done.has(name)) continue;
    processed += 1;

    const hit = await lookup(name);
    if (hit) {
      done.set(name, { name, ...hit });
      failed.delete(name);
    } else {
      failed.add(name);
    }

    if (processed % 10 === 0) {
      await save([...done.values()], [...failed], false);
      console.log(`  ${done.size}件取得 / ${failed.size}件失敗 （残り ${names.length - done.size - failed.size}件）`);
    }
    await sleep(INTERVAL_MS);
  }

  await save([...done.values()], [...failed], true);
  console.log(`完了: ${done.size}件の座標を取得、${failed.size}件は引けず。`);
  console.log(`保存先: ${OUTPUT_PATH}`);
}

await main();
