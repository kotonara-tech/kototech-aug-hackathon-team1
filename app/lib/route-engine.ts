/**
 * ルート計算エンジン。
 *
 * 入力（空き時間・予算・出発地・ゴール・好み）から、立ち寄り先の組み合わせを組み立てる。
 * 外部APIもデータベースも使わない純粋な計算なので、テストから直接呼べる。
 *
 * 移動時間はいまのところ直線距離からの概算である。実際の道路・公共交通の所要時間ではない。
 * 将来 Google Routes API へ差し替えるときは estimateTravelMinutes を置き換える。
 */

/** 立ち寄り先の候補。座標・料金・滞在時間が揃っているものだけを渡すこと。 */
export type EnginePlace = {
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  /** 1人あたりの目安料金（円）。無料なら 0。 */
  cost: number;
  /** 目安の滞在時間（分）。 */
  stayMinutes: number;
  genres: string[];
  /** SHIKA no ASHIATO 掲載施設かどうか。 */
  shikaMember: boolean;
};

/** 地点。出発地とゴールに使う。 */
export type Waypoint = {
  name: string;
  lat: number;
  lng: number;
};

export type RouteRequest = {
  /** 使える時間（分）。 */
  availableMinutes: number;
  /** 1人あたりの予算（円）。 */
  budget: number;
  start: Waypoint;
  goal: Waypoint;
  /** 「ならまち、甘いもの」などの自由入力。 */
  notes?: string;
  /** ゴール到着に確保する余裕（分）。既定は10分。 */
  safetyBufferMinutes?: number;
};

/** ルートの中の1区間。時刻はすべて出発時点からの経過分。 */
export type RouteLeg = {
  place: EnginePlace;
  /** 直前の地点からの移動時間（分）。 */
  travelMinutes: number;
  /** 到着（出発からの経過分）。 */
  arrivalMinutes: number;
  /** 出発（到着＋滞在時間）。 */
  departureMinutes: number;
};

export type RoutePlan = {
  id: string;
  places: EnginePlace[];
  legs: RouteLeg[];
  /** 立ち寄り先の合計金額（円）。 */
  totalCost: number;
  /** 移動だけの合計時間（分）。ゴールへ戻る分を含む。 */
  travelMinutes: number;
  /** ゴールへ戻るまでの合計時間（分）。移動＋滞在。 */
  returnMinutes: number;
  /** 並び替えに使う点数。大きいほど上位。 */
  score: number;
};

const EARTH_RADIUS_KM = 6371;
/** 徒歩の速さ。分速80m（時速4.8km）で見積もる。 */
const WALK_METERS_PER_MINUTE = 80;
/** ゴール到着に確保する既定の余裕（分）。 */
const DEFAULT_SAFETY_BUFFER_MINUTES = 10;
/** 1ルートに入れる立ち寄り先の上限。 */
const MAX_STOPS = 3;
/** 提案するルート数。 */
const MAX_PLANS = 3;
/**
 * 同じジャンルの施設が1組並ぶごとに引く点数。
 * 立ち寄り先1件分の価値（8点＋掲載10点）より大きくして、
 * 「カフェばかり3軒」より「カフェ・和菓子・工芸品」が上に来るようにする。
 */
const GENRE_OVERLAP_PENALTY = 20;

const ROUTE_IDS = ["A", "B", "C"];

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** 2地点の直線距離（km）。道のりではない。 */
export function distanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}

/** 距離（km）から徒歩の所要時間（分）。端数は切り上げる。 */
export function walkMinutes(km: number): number {
  return Math.ceil((km * 1000) / WALK_METERS_PER_MINUTE);
}

/**
 * 2地点の移動時間（分）の見積もり方。
 * 既定は直線距離からの概算。実際の徒歩時間が手に入る場合は差し替える。
 */
export type TravelMinutes = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => number;

export type PlanRoutesOptions = {
  travelMinutes?: TravelMinutes;
};

/** 既定の見積もり。直線距離を徒歩の速さで割るだけで、実際の道のりではない。 */
export const estimateTravelMinutes: TravelMinutes = (from, to) => walkMinutes(distanceKm(from, to));

/** 備考を検索語へ分解する。日本語は空白で区切られないので、読点や中黒でも切る。 */
export function tokenizeNotes(notes: string | undefined): string[] {
  if (!notes) return [];
  return notes
    .split(/[\s、。,.・／/|｜]+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
}

/** 施設が、ユーザーの希望（備考）に合うか。 */
export function matchesNotes(place: EnginePlace, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const haystack = [place.name, place.type, ...place.genres].join(" ").toLowerCase();
  return tokens.some((token) => haystack.includes(token));
}

/** 配列のすべての並び順を返す。立ち寄り先は最大3件なので、全通り試しても軽い。 */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) {
      result.push([items[i], ...tail]);
    }
  }
  return result;
}

/** 1件以上 maxSize 件以下の組み合わせをすべて返す。 */
function combinations(places: EnginePlace[], maxSize: number): EnginePlace[][] {
  const result: EnginePlace[][] = [];
  const walk = (startIndex: number, current: EnginePlace[]) => {
    if (current.length > 0) result.push([...current]);
    if (current.length === maxSize) return;
    for (let i = startIndex; i < places.length; i += 1) {
      current.push(places[i]);
      walk(i + 1, current);
      current.pop();
    }
  };
  walk(0, []);
  return result;
}

type Itinerary = {
  places: EnginePlace[];
  legs: RouteLeg[];
  travelMinutes: number;
  returnMinutes: number;
};

/** 与えられた立ち寄り先を、ゴールへ戻るまでが最短になる順に並べた行程を作る。 */
function buildItinerary(places: EnginePlace[], request: RouteRequest, travel: TravelMinutes): Itinerary {
  let best: Itinerary | null = null;

  for (const order of permutations(places)) {
    const legs: RouteLeg[] = [];
    let cursor: { lat: number; lng: number } = request.start;
    let travelMinutes = 0;
    let elapsed = 0;

    for (const place of order) {
      const travelToPlace = travel(cursor, place);
      const arrival = elapsed + travelToPlace;
      const departure = arrival + place.stayMinutes;
      legs.push({ place, travelMinutes: travelToPlace, arrivalMinutes: arrival, departureMinutes: departure });
      travelMinutes += travelToPlace;
      elapsed = departure;
      cursor = place;
    }

    const backToGoal = travel(cursor, request.goal);
    travelMinutes += backToGoal;
    const returnMinutes = elapsed + backToGoal;

    if (!best || returnMinutes < best.returnMinutes) {
      best = { places: order, legs, travelMinutes, returnMinutes };
    }
  }

  // places が空でない限り permutations は必ず1件以上返すので、best は null にならない。
  return best as Itinerary;
}

/**
 * 同じジャンルの施設が並んでいる数を数える。
 * 「カフェ・カフェ・カフェ」のような、変化のないルートを見つけるために使う。
 */
function overlappingGenrePairs(places: EnginePlace[]): number {
  let pairs = 0;
  for (let i = 0; i < places.length; i += 1) {
    for (let j = i + 1; j < places.length; j += 1) {
      const shared = places[i].genres.some((genre) => places[j].genres.includes(genre));
      if (shared) pairs += 1;
    }
  }
  return pairs;
}

function scoreItinerary(itinerary: Itinerary, tokens: string[]): number {
  let score = 0;
  for (const place of itinerary.places) {
    score += 8; // 立ち寄り先が多いほど内容が濃い
    if (place.shikaMember) score += 10; // SHIKA no ASHIATO 掲載を優先する
    if (matchesNotes(place, tokens)) score += 40; // ユーザーの希望を最優先
  }
  score -= itinerary.travelMinutes * 0.5; // 移動ばかりのルートは下げる
  // 同じジャンルが並ぶルートは下げる。ただし候補のジャンルが偏っていても
  // 提案が消えないよう、点数を下げるだけで除外はしない。
  score -= overlappingGenrePairs(itinerary.places) * GENRE_OVERLAP_PENALTY;
  return score;
}

function keyOf(itinerary: Itinerary): string {
  return itinerary.places.map((place) => place.id).join("+");
}

type Candidate = {
  itinerary: Itinerary;
  totalCost: number;
  score: number;
};

/**
 * 条件を満たすルートを、最大3件まで提案する。
 *
 * 必ず守る条件:
 * - 安全余裕を残して、指定されたゴール地点へ戻れること
 * - 立ち寄り先の合計金額が予算以内であること
 *
 * 条件を満たす候補がない場合は空の配列を返す。
 */
export function planRoutes(
  places: EnginePlace[],
  request: RouteRequest,
  options: PlanRoutesOptions = {},
): RoutePlan[] {
  const buffer = request.safetyBufferMinutes ?? DEFAULT_SAFETY_BUFFER_MINUTES;
  const timeLimit = request.availableMinutes - buffer;
  if (places.length === 0 || timeLimit <= 0) return [];

  const travel = options.travelMinutes ?? estimateTravelMinutes;
  const affordable = places.filter((place) => place.cost <= request.budget);
  const tokens = tokenizeNotes(request.notes);

  const candidates: Candidate[] = [];
  for (const group of combinations(affordable, MAX_STOPS)) {
    const totalCost = group.reduce((sum, place) => sum + place.cost, 0);
    if (totalCost > request.budget) continue;
    const itinerary = buildItinerary(group, request, travel);
    if (itinerary.returnMinutes > timeLimit) continue;
    candidates.push({ itinerary, totalCost, score: scoreItinerary(itinerary, tokens) });
  }

  // 点数の高い順。同点のときは組み合わせの文字列で決めて、実行のたびに順序が変わらないようにする。
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return keyOf(a.itinerary).localeCompare(keyOf(b.itinerary));
  });

  // 内容の違う3案にするため、すでに選んだルートに無い施設を1つ以上含むものだけを採用する。
  const chosen: Candidate[] = [];
  const usedPlaceIds = new Set<string>();
  for (const candidate of candidates) {
    if (chosen.length === MAX_PLANS) break;
    const hasNewPlace = candidate.itinerary.places.some((place) => !usedPlaceIds.has(place.id));
    if (chosen.length > 0 && !hasNewPlace) continue;
    chosen.push(candidate);
    for (const place of candidate.itinerary.places) usedPlaceIds.add(place.id);
  }

  return chosen.map((candidate, index) => ({
    id: ROUTE_IDS[index],
    places: candidate.itinerary.places,
    legs: candidate.itinerary.legs,
    totalCost: candidate.totalCost,
    travelMinutes: candidate.itinerary.travelMinutes,
    returnMinutes: candidate.itinerary.returnMinutes,
    score: candidate.score,
  }));
}
