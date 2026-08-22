/**
 * 画面の入力（すべて文字列）を、ルート計算エンジンが受け取れる条件へ変換する。
 *
 * 画面側は「2時間30分」「3,000円」のような人が書いた文字を扱うが、
 * エンジン側は分と円の数値しか受け取らない。その橋渡しをここで行う。
 * 外部APIを使わない純粋な変換なので、テストから直接呼べる。
 */

import type { RouteRequest, Waypoint } from "./route-engine.ts";

/** 座標が分かっている地点。ここに無い地名は既定の座標で代用する。 */
const KNOWN_WAYPOINTS: Waypoint[] = [
  { name: "近鉄奈良駅", lat: 34.6844, lng: 135.8298 },
  { name: "JR奈良駅", lat: 34.6803, lng: 135.8189 },
  { name: "東大寺", lat: 34.6889, lng: 135.8398 },
  { name: "奈良公園", lat: 34.6851, lng: 135.843 },
  { name: "春日大社", lat: 34.6815, lng: 135.8484 },
  { name: "ならまち", lat: 34.6772, lng: 135.83 },
  { name: "きたまち", lat: 34.6918, lng: 135.8326 },
];

/** 地点名が分からないときに使う基準点。 */
export const DEFAULT_WAYPOINT: Waypoint = KNOWN_WAYPOINTS[0];

/** これ未満の空き時間では、どの施設にも寄れないため提案しない。 */
const MINIMUM_AVAILABLE_MINUTES = 30;

/** 画面のフォームから受け取る入力。すべて文字列で届く。 */
export type RouteFormInput = {
  mode: string;
  freeStart?: string;
  freeEnd?: string;
  duration?: string;
  budget?: string;
  start?: string;
  returnTo?: string;
  notes?: string;
};

export type BuildRouteRequestResult =
  | { ok: true; request: RouteRequest; startClock?: string }
  | { ok: false; error: string };

/** 「3,000円」「￥1200」などから金額を取り出す。読めなければ0円。 */
export function parseBudget(text: string): number {
  const digits = (text ?? "").replace(/[^0-9]/g, "");
  if (digits === "") return 0;
  return Number(digits);
}

/** 「2時間30分」「90分」「120」から分を取り出す。読めなければ null。 */
export function parseDurationText(text: string): number | null {
  const value = (text ?? "").trim();
  if (value === "") return null;

  const hourMinute = value.match(/(\d+)\s*時間\s*(\d+)\s*分?/);
  if (hourMinute) return Number(hourMinute[1]) * 60 + Number(hourMinute[2]);

  const hourOnly = value.match(/(\d+)\s*時間/);
  if (hourOnly) return Number(hourOnly[1]) * 60;

  const minuteOnly = value.match(/(\d+)\s*分/);
  if (minuteOnly) return Number(minuteOnly[1]);

  const numberOnly = value.match(/^\s*(\d+)\s*$/);
  if (numberOnly) return Number(numberOnly[1]);

  return null;
}

function parseClock(text: string): number | null {
  const match = (text ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 「11:30」から「14:15」までの分数。逆転や形式違いは null。 */
export function minutesBetween(start: string, end: string): number | null {
  const from = parseClock(start);
  const to = parseClock(end);
  if (from === null || to === null) return null;
  if (to <= from) return null;
  return to - from;
}

/**
 * 座標を知っている地点名かどうか。
 * 知っている地点は、外部サービスへ問い合わせずに済ませるための判定に使う。
 */
export function isKnownWaypoint(name: string): boolean {
  const value = (name ?? "").trim();
  if (value === "") return true;
  return KNOWN_WAYPOINTS.some((waypoint) => waypoint.name === value);
}

/** 地点名から座標を引く。知らない地名でも、名前は入力どおり残す。 */
export function resolveWaypoint(name: string): Waypoint {
  const value = (name ?? "").trim();
  if (value === "") return DEFAULT_WAYPOINT;
  const known = KNOWN_WAYPOINTS.find((waypoint) => waypoint.name === value);
  if (known) return known;
  return { name: value, lat: DEFAULT_WAYPOINT.lat, lng: DEFAULT_WAYPOINT.lng };
}

/**
 * 画面の入力から、エンジンへ渡す条件を組み立てる。
 * 組み立てられない場合は、画面にそのまま出せる日本語の理由を返す。
 */
export function buildRouteRequest(input: RouteFormInput): BuildRouteRequestResult {
  const isPlanned = input.mode === "planned";

  let availableMinutes: number | null;
  let startClock: string | undefined;

  if (isPlanned) {
    availableMinutes = minutesBetween(input.freeStart ?? "", input.freeEnd ?? "");
    if (availableMinutes === null) {
      return { ok: false, error: "空き時間の開始と終了を、終了が後になるように入力してください。" };
    }
    startClock = (input.freeStart ?? "").trim();
  } else {
    availableMinutes = parseDurationText(input.duration ?? "");
    if (availableMinutes === null) {
      return { ok: false, error: "使える時間を「2時間30分」や「90分」のように入力してください。" };
    }
  }

  if (availableMinutes < MINIMUM_AVAILABLE_MINUTES) {
    return { ok: false, error: `使える時間が短すぎます。${MINIMUM_AVAILABLE_MINUTES}分以上で試してください。` };
  }

  const start = resolveWaypoint(input.start ?? "");
  const goalName = (input.returnTo ?? "").trim();
  const goal = goalName === "" ? start : resolveWaypoint(goalName);

  const request: RouteRequest = {
    availableMinutes,
    budget: parseBudget(input.budget ?? ""),
    start,
    goal,
    notes: (input.notes ?? "").trim(),
  };

  return startClock ? { ok: true, request, startClock } : { ok: true, request };
}
