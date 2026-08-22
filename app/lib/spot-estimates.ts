/**
 * 施設の料金と滞在時間の「目安」を決める。
 *
 * 公式カタログ（app/data/ashiato-spots.json）には料金も滞在時間も入っていない。
 * ルートを組み立てるにはどちらも必要なので、カテゴリとジャンルから試算する。
 *
 * ここで作る値は**試算であり、実際の価格でも最新の価格でもない**。
 * 画面では必ず試算であることを示すこと（sourceNote と ESTIMATE_NOTE を使う）。
 */

export type SpotEstimate = {
  /** 画面に出す施設の種類。 */
  type: string;
  /** 1人あたりの目安料金（円）。 */
  cost: number;
  /** 目安の滞在時間（分）。 */
  stayMinutes: number;
};

export type EstimateInput = {
  sections: string[];
  genres: string[];
};

/** 料金・滞在時間が試算であることを示す文言。画面と出典表示に使う。 */
export const ESTIMATE_NOTE = "料金と滞在時間はカテゴリからの試算（目安）であり、実際の価格ではありません";

/**
 * 寄り道先にしないカテゴリ。
 *
 * 泊まる場所（宿泊）と、接骨院・レンタカー・美容室など（サービス）は、
 * 空き時間に立ち寄って楽しむ場所ではない。カタログ375件の一覧からは外さず、
 * ルートの候補にだけ入れないようにする。
 *
 * 「宿泊」と「グルメ・カフェ」の両方に載っている宿のように、
 * ほかのカテゴリも持つ施設は候補に残す。
 */
const NON_ROUTE_SECTIONS = new Set(["宿泊", "サービス"]);

/** ルートの立ち寄り先にできるカテゴリを持っているか。 */
export function isRouteCandidate(input: EstimateInput): boolean {
  const sections = Array.isArray(input?.sections) ? input.sections : [];
  if (sections.length === 0) return true;
  return sections.some((section) => !NON_ROUTE_SECTIONS.has(section));
}

/** カテゴリ（PDFの掲載区分）ごとの目安。 */
const SECTION_DEFAULTS: Record<string, { cost: number; stayMinutes: number }> = {
  "グルメ・カフェ": { cost: 1200, stayMinutes: 45 },
  "お土産・ショッピング": { cost: 1000, stayMinutes: 25 },
  "文化体験・体験": { cost: 1500, stayMinutes: 60 },
  宿泊: { cost: 0, stayMinutes: 20 },
  サービス: { cost: 800, stayMinutes: 30 },
};

/** カテゴリが分からないときの目安。 */
const FALLBACK: { type: string; cost: number; stayMinutes: number } = {
  type: "その他",
  cost: 800,
  stayMinutes: 30,
};

/**
 * ジャンルごとの上書き。カテゴリだけでは、ラーメンと寿司が同じ料金になってしまう。
 * 施設のジャンル配列を先頭から見て、最初に一致したものを使う。
 */
const GENRE_OVERRIDES: Record<string, { cost: number; stayMinutes: number }> = {
  ラーメン: { cost: 900, stayMinutes: 30 },
  そば: { cost: 1100, stayMinutes: 35 },
  うどん: { cost: 900, stayMinutes: 30 },
  カレー: { cost: 1200, stayMinutes: 40 },
  寿司: { cost: 2500, stayMinutes: 60 },
  焼肉: { cost: 3000, stayMinutes: 70 },
  居酒屋: { cost: 2500, stayMinutes: 60 },
  バー: { cost: 2000, stayMinutes: 60 },
  フレンチ: { cost: 3500, stayMinutes: 90 },
  イタリアン: { cost: 2500, stayMinutes: 70 },
  中華: { cost: 1500, stayMinutes: 50 },
  カフェ: { cost: 800, stayMinutes: 40 },
  パン: { cost: 600, stayMinutes: 20 },
  スイーツ: { cost: 700, stayMinutes: 30 },
  甘いもの: { cost: 700, stayMinutes: 30 },
  和菓子: { cost: 700, stayMinutes: 25 },
  和食: { cost: 1500, stayMinutes: 50 },
  体験: { cost: 2000, stayMinutes: 75 },
  工芸品: { cost: 1500, stayMinutes: 30 },
  雑貨: { cost: 1000, stayMinutes: 25 },
  酒: { cost: 1200, stayMinutes: 30 },
  ホテル: { cost: 0, stayMinutes: 20 },
  旅館: { cost: 0, stayMinutes: 20 },
};

/**
 * カテゴリとジャンルから、料金と滞在時間の目安を決める。
 * どちらも分からなくても、必ず値を返す。
 */
export function estimateSpot(input: EstimateInput): SpotEstimate {
  const sections = Array.isArray(input?.sections) ? input.sections : [];
  const genres = Array.isArray(input?.genres) ? input.genres : [];

  const section = sections.find((name) => typeof name === "string" && name.length > 0);
  const type = section ?? FALLBACK.type;

  const genreHit = genres.map((genre) => GENRE_OVERRIDES[genre]).find((hit) => hit !== undefined);
  if (genreHit) return { type, cost: genreHit.cost, stayMinutes: genreHit.stayMinutes };

  const sectionHit = section ? SECTION_DEFAULTS[section] : undefined;
  if (sectionHit) return { type, cost: sectionHit.cost, stayMinutes: sectionHit.stayMinutes };

  return { type, cost: FALLBACK.cost, stayMinutes: FALLBACK.stayMinutes };
}
