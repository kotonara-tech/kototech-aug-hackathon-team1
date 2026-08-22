/**
 * ルート計算にかける前に、立ち寄り先の候補を絞り込む。
 *
 * ルートエンジンは立ち寄り先の組み合わせを総当たりする。候補が6件なら41通りで済むが、
 * 375件では約880万通りになり、計算が終わらない。さらに OSRM の徒歩時間表も、
 * 一度に渡せる地点数に限りがある。
 *
 * そこで「予算内」「時間内に往復できる」「出発地に近い」「希望に合う」で先に絞る。
 * ここで落とすのは順位付け以前の足切りであり、必須条件（ゴールへ戻れること・予算内）は
 * ルートエンジン側でも改めて検査する。
 */

import {
  distanceKm,
  estimateTravelMinutes,
  matchesNotes,
  tokenizeNotes,
  type EnginePlace,
} from "./route-engine.ts";

type Point = { lat: number; lng: number };

/**
 * 既定で残す候補の数。
 * 24件なら組み合わせは約2,300通りで、総当たりしても一瞬で終わる。
 * OSRM の徒歩時間表に渡す地点数（出発地＋ゴール＋候補）も余裕をもって収まる。
 */
export const DEFAULT_CANDIDATE_LIMIT = 24;

/** ゴール到着に確保する既定の余裕（分）。ルートエンジンと同じ値。 */
const DEFAULT_SAFETY_BUFFER_MINUTES = 10;

export type SelectOptions = {
  start: Point;
  /** 戻る地点。省略したら出発地と同じとみなす。 */
  goal?: Point;
  /** 「ならまち、甘いもの」などの自由入力。 */
  notes?: string;
  /** 1人あたりの予算（円）。 */
  budget?: number;
  /** 使える時間（分）。 */
  availableMinutes?: number;
  /** ゴール到着に確保する余裕（分）。 */
  safetyBufferMinutes?: number;
  /** 残す件数の上限。 */
  limit?: number;
};

/** その施設1件だけに寄って戻る場合の所要時間（分）。直線距離からの概算。 */
function soloRoundTripMinutes(place: EnginePlace, start: Point, goal: Point): number {
  return estimateTravelMinutes(start, place) + place.stayMinutes + estimateTravelMinutes(place, goal);
}

/**
 * ルート計算にかける候補を選ぶ。
 *
 * 並びは「希望に合うものが先、次に出発地から近い順」。
 * 同じ入力なら毎回同じ結果を返す（同点は id で決める）。
 */
export function selectCandidates(places: EnginePlace[], options: SelectOptions): EnginePlace[] {
  if (!Array.isArray(places) || places.length === 0) return [];
  const { start } = options;
  if (!start || !Number.isFinite(start.lat) || !Number.isFinite(start.lng)) return [];

  const goal = options.goal ?? start;
  const limit = options.limit ?? DEFAULT_CANDIDATE_LIMIT;
  const buffer = options.safetyBufferMinutes ?? DEFAULT_SAFETY_BUFFER_MINUTES;
  const tokens = tokenizeNotes(options.notes);

  const scored = places
    .filter((place) => {
      if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return false;
      if (options.budget !== undefined && place.cost > options.budget) return false;
      if (options.availableMinutes !== undefined) {
        const limitMinutes = options.availableMinutes - buffer;
        if (soloRoundTripMinutes(place, start, goal) > limitMinutes) return false;
      }
      return true;
    })
    .map((place) => ({
      place,
      wanted: matchesNotes(place, tokens),
      distance: distanceKm(start, place),
    }));

  scored.sort((a, b) => {
    // 希望に合う施設は、遠くても残す
    if (a.wanted !== b.wanted) return a.wanted ? -1 : 1;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.place.id.localeCompare(b.place.id);
  });

  return scored.slice(0, Math.max(0, limit)).map((entry) => entry.place);
}
