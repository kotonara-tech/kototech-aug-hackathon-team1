/**
 * ルート計算の結果を、画面にそのまま出せる形へ変換する。
 *
 * 計算エンジンは「出発から何分後」しか持たない。画面には時計表示や
 * 「徒歩10分」といった言葉が要るので、その変換をここでまとめて行う。
 */

import type { RoutePlan } from "./route-engine.ts";
import type { SamplePlace } from "./places.ts";

export type RouteStopView = SamplePlace & {
  /** 直前の地点からの移動時間（分）。 */
  travelMinutes: number;
  /** 「徒歩10分」のような表示。 */
  travelLabel: string;
  arrivalMinutes: number;
  departureMinutes: number;
  /** 開始時刻が分かっている場合の到着時刻。例「11:40」 */
  arrivalClock?: string;
  departureClock?: string;
  /** 簡易地図に置く位置（％）。おおよその位置であり、正確な地図ではない。 */
  x: number;
  y: number;
};

export type RouteView = {
  id: string;
  title: string;
  description: string;
  totalCost: number;
  travelMinutes: number;
  returnMinutes: number;
  /** 「2時間45分」のような表示。 */
  durationLabel: string;
  /** 「徒歩 25分」のような表示。 */
  walkLabel: string;
  /** 開始時刻が分かっている場合の帰着時刻。 */
  returnClock?: string;
  color: string;
  image: string;
  stops: RouteStopView[];
};

const ROUTE_COLORS = ["#d85d43", "#315a46", "#b68a2e"];

/** 簡易地図が表す範囲。奈良市中心部をおおまかに覆う。 */
const MAP_BOUNDS = { minLat: 34.665, maxLat: 34.697, minLng: 135.815, maxLng: 135.85 };
/** 端に寄りすぎて見えなくならないよう、この％の内側へ収める。 */
const MAP_PADDING = 8;

/** 分を「2時間45分」「45分」の形にする。 */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}分`;
  if (rest === 0) return `${hours}時間`;
  return `${hours}時間${rest}分`;
}

/** 「11:30」に分を足して「11:40」にする。読めない時刻は null。 */
export function addClock(clock: string, minutes: number): string | null {
  const match = (clock ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  const total = (hours * 60 + mins + minutes) % (24 * 60);
  const normalized = (total + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(normalized / 60)).padStart(2, "0");
  const mm = String(normalized % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function clampToMap(value: number): number {
  return Math.min(100 - MAP_PADDING, Math.max(MAP_PADDING, value));
}

function mapPosition(place: { lat: number; lng: number }): { x: number; y: number } {
  const { minLat, maxLat, minLng, maxLng } = MAP_BOUNDS;
  const x = ((place.lng - minLng) / (maxLng - minLng)) * 100;
  const y = ((maxLat - place.lat) / (maxLat - minLat)) * 100;
  return { x: Math.round(clampToMap(x)), y: Math.round(clampToMap(y)) };
}

function buildTitle(names: string[]): string {
  if (names.length === 1) return `${names[0]}をゆっくり`;
  if (names.length === 2) return `${names[0]}と${names[1]}`;
  return `${names[0]}・${names[1]}ほか${names.length}か所`;
}

function buildDescription(plan: RoutePlan): string {
  const genres = [...new Set(plan.places.flatMap((place) => place.genres))].slice(0, 3);
  const theme = genres.length > 0 ? `${genres.join("・")}をめぐる` : "";
  return `${theme}${plan.places.length}か所・${formatMinutes(plan.returnMinutes)}・徒歩${plan.travelMinutes}分`;
}

/**
 * 計算結果を画面表示用へ変換する。
 * startClock を渡すと、到着・帰着を時計表示でも持つ。
 */
export function toRouteViews(plans: RoutePlan[], options: { startClock?: string }): RouteView[] {
  const startClock = options.startClock;

  return plans.map((plan, index) => {
    const stops: RouteStopView[] = plan.legs.map((leg) => {
      const place = leg.place as SamplePlace;
      const position = mapPosition(place);
      const arrivalClock = startClock ? addClock(startClock, leg.arrivalMinutes) : null;
      const departureClock = startClock ? addClock(startClock, leg.departureMinutes) : null;

      return {
        ...place,
        travelMinutes: leg.travelMinutes,
        travelLabel: `徒歩${leg.travelMinutes}分`,
        arrivalMinutes: leg.arrivalMinutes,
        departureMinutes: leg.departureMinutes,
        ...(arrivalClock ? { arrivalClock } : {}),
        ...(departureClock ? { departureClock } : {}),
        x: position.x,
        y: position.y,
      };
    });

    const returnClock = startClock ? addClock(startClock, plan.returnMinutes) : null;

    return {
      id: plan.id,
      title: buildTitle(plan.places.map((place) => place.name)),
      description: buildDescription(plan),
      totalCost: plan.totalCost,
      travelMinutes: plan.travelMinutes,
      returnMinutes: plan.returnMinutes,
      durationLabel: formatMinutes(plan.returnMinutes),
      walkLabel: `徒歩 ${plan.travelMinutes}分`,
      ...(returnClock ? { returnClock } : {}),
      color: ROUTE_COLORS[index % ROUTE_COLORS.length],
      image: stops[0]?.image ?? "",
      stops,
    };
  });
}
