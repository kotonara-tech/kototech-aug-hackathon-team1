/**
 * 奈良市内の「名前つき施設」を Overpass API で一括取得し、公式カタログの施設名と突き合わせる。
 *
 *   node scripts/match-overpass.mjs
 *
 * Nominatim（scripts/geocode-spots.mjs）は検索エンジン経由なので、小さな店の名前では
 * ほとんど当たらない。こちらは OpenStreetMap の生データを取ってきて名前を直接照合するため、
 * 当たる確率が高い。外部への通信は**1回だけ**である。
 *
 * 出力: app/data/spot-locations-overpass.json
 *
 * 注意:
 * - 名前が一致しても別の施設である可能性は残る。displayName と matchType を残してあるので確認できる。
 * - OpenStreetMap に登録されていない施設は、当然ここでも見つからない。
 *
 * 出典・規約: https://wiki.openstreetmap.org/wiki/Overpass_API
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CATALOG_PATH = resolve(ROOT, "app/data/ashiato-spots.json");
const OUTPUT_PATH = resolve(ROOT, "app/data/spot-locations-overpass.json");
/** Overpass の生データ置き場。Git には入れない（.gitignore 参照）。 */
const CACHE_PATH = resolve(ROOT, "app/data/.osm-poi-cache.json");

const ENDPOINT = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "nara-yorimichi/0.1 (hackathon prototype; local use)";
const TIMEOUT_MS = 240000;

/** 奈良市の名前つき施設を、寄り道の対象になりうる種類にしぼって取る。 */
const QUERY = `
[out:json][timeout:180];
area["name"="奈良市"]["admin_level"="7"]->.nara;
(
  nwr(area.nara)["name"]["amenity"];
  nwr(area.nara)["name"]["shop"];
  nwr(area.nara)["name"]["tourism"];
  nwr(area.nara)["name"]["craft"];
  nwr(area.nara)["name"]["historic"];
  nwr(area.nara)["name"]["leisure"];
  nwr(area.nara)["name"]["office"];
);
out center tags;
`;

/**
 * 施設名を突き合わせ用に正規化する。
 * 全角と半角、大文字と小文字、空白と中黒の違いで取りこぼさないようにする。
 *
 * かっこの中は読みがな（例「canata conata（カナタコナタ）」）であることが多いので、
 * 中身ごと落とす。残すと同じ店名の別表記と一致しなくなる。
 */
function normalize(name) {
  return String(name)
    .normalize("NFKC")
    .replace(/[(（][^)）]*[)）]/g, "")
    .toLowerCase()
    .replace(/[\s・･,，.。'"’”「」『』（）()【】\-ー―‐~〜/／|｜]/g, "");
}

/**
 * 部分一致で認める最短の長さ。
 * 3文字まで許すと「ant」（美容室）が「cafe&restaurant NO PLAN」に一致してしまう。
 */
const MIN_PARTIAL_LENGTH = 5;

/** 保存済みの取得結果を読む。無ければ null。 */
async function loadCache() {
  try {
    const raw = await readFile(CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.elements) ? parsed : null;
  } catch {
    return null;
  }
}

async function fetchPois() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(QUERY)}`,
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error(`Overpass の応答が ${response.status} でした`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(`Overpass への問い合わせに失敗: ${error.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** OSM の要素から、緯度経度と住所らしい文字列を取り出す。 */
function toLocation(element) {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const tags = element.tags ?? {};
  const address = [
    tags["addr:province"] ?? tags["addr:state"],
    tags["addr:city"],
    tags["addr:suburb"] ?? tags["addr:quarter"],
    tags["addr:neighbourhood"],
    tags["addr:block_number"],
    tags["addr:housenumber"],
  ]
    .filter((part) => typeof part === "string" && part.length > 0)
    .join("");

  return {
    lat,
    lng,
    address,
    osmType: element.type,
    osmId: element.id,
    tagName: tags.name,
    category: tags.amenity ?? tags.shop ?? tags.tourism ?? tags.craft ?? tags.historic ?? tags.leisure ?? tags.office ?? "",
  };
}

async function main() {
  const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  const names = catalog.items.map((item) => item.name);

  // 照合条件を直して試すたびに Overpass を叩かないよう、生データは手元に取っておく。
  // --refresh を付けたときだけ取り直す。
  const refresh = process.argv.includes("--refresh");
  let body = refresh ? null : await loadCache();
  if (body) {
    console.log(`保存済みの取得結果を使います（${body.elements.length}件）。取り直すには --refresh を付けてください。`);
  } else {
    console.log("Overpass に問い合わせています（1回だけ・最大4分）…");
    body = await fetchPois();
    if (!body || !Array.isArray(body.elements)) {
      console.error("取得できませんでした。時間をおいて再実行してください。");
      process.exitCode = 1;
      return;
    }
    await writeFile(CACHE_PATH, JSON.stringify(body), "utf8");
    console.log(`奈良市内の名前つき施設 ${body.elements.length}件を取得しました。`);
  }

  // 正規化した名前 → 施設。同じ名前が複数あるときは最初の1件を使う。
  const byName = new Map();
  const pois = [];
  for (const element of body.elements) {
    const location = toLocation(element);
    if (!location || typeof location.tagName !== "string") continue;
    pois.push(location);
    const key = normalize(location.tagName);
    if (key.length > 0 && !byName.has(key)) byName.set(key, location);
  }

  const items = [];
  const failed = [];
  for (const name of names) {
    const key = normalize(name);
    if (key.length === 0) {
      failed.push(name);
      continue;
    }

    const exact = byName.get(key);
    if (exact) {
      items.push(buildItem(name, exact, "exact"));
      continue;
    }

    // 「Kakigori ほうせき箱」と「ほうせき箱」のように、片方がもう片方を含む場合。
    // 短い名前が紛れ込むと誤って一致するので、含まれる側も5文字以上に限る。
    if (key.length >= MIN_PARTIAL_LENGTH) {
      const partial = pois.find((poi) => {
        const poiKey = normalize(poi.tagName);
        if (poiKey.length < MIN_PARTIAL_LENGTH) return false;
        return poiKey.includes(key) || key.includes(poiKey);
      });
      if (partial) {
        items.push(buildItem(name, partial, "partial"));
        continue;
      }
    }

    failed.push(name);
  }

  const output = {
    source: {
      service: "Overpass API (OpenStreetMap)",
      endpoint: ENDPOINT,
      wiki: "https://wiki.openstreetmap.org/wiki/Overpass_API",
      note: "施設名の一致で突き合わせている。matchType が partial のものは特に、別施設の可能性を目視で確認すること。",
    },
    fetchedAt: new Date().toISOString(),
    poiCount: pois.length,
    count: items.length,
    failedCount: failed.length,
    items,
    failed,
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  const exactCount = items.filter((item) => item.matchType === "exact").length;
  console.log(`一致 ${items.length}件（完全一致 ${exactCount}件 / 部分一致 ${items.length - exactCount}件）、見つからず ${failed.length}件`);
  console.log(`保存先: ${OUTPUT_PATH}`);
}

function buildItem(name, location, matchType) {
  return {
    name,
    lat: location.lat,
    lng: location.lng,
    address: location.address,
    displayName: location.tagName,
    source: "OpenStreetMap Overpass API",
    matchType,
    osmType: location.osmType,
    osmId: location.osmId,
    category: location.category,
  };
}

await main();
