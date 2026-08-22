/**
 * ルート提案の窓口。
 *
 * 画面から入力内容を受け取り、OpenStreetMap から実際の徒歩時間を取り、
 * ルート計算エンジンを呼んで結果を返す。
 *
 * 計算をサーバー側に置いておくことで、外部サービスへの問い合わせ回数を
 * ここで抑えられる。1回の生成につき、外部への通信は次の最大3回に収める。
 *
 * - 出発地の地名検索（知らない地名のときだけ）
 * - ゴールの地名検索（知らない地名のときだけ）
 * - 徒歩時間の総当たり表（必ず1回。区間ごとには呼ばない）
 *
 * 外部サービスが落ちていても画面を止めないため、取れなければ直線距離からの
 * 概算へ切り替え、どちらを使ったかを travelSource で返す。
 */

import { selectCandidates } from "../../lib/place-filter";
import { ROUTE_PLACES } from "../../lib/route-places";
import { estimateTravelMinutes, planRoutes, type Waypoint } from "../../lib/route-engine";
import { buildRouteRequest, isKnownWaypoint, type RouteFormInput } from "../../lib/route-request";
import { toRouteViews } from "../../lib/route-view";
import { buildTravelLookup, geocode, travelMatrixMinutes, type Point } from "../../lib/osm";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** 知らない地名のときだけ、OpenStreetMap で座標を引き直す。 */
async function upgradeWaypoint(waypoint: Waypoint, rawName: string): Promise<Waypoint> {
  if (isKnownWaypoint(rawName)) return waypoint;
  const found = await geocode(rawName);
  if (!found) return waypoint;
  return { name: waypoint.name, lat: found.lat, lng: found.lng };
}

function samePoint(a: Point, b: Point): boolean {
  return a.lat === b.lat && a.lng === b.lng;
}

export async function POST(request: Request): Promise<Response> {
  let input: RouteFormInput;
  try {
    input = (await request.json()) as RouteFormInput;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。もう一度お試しください。" }, 400);
  }

  if (!input || typeof input !== "object") {
    return json({ error: "入力内容を読み取れませんでした。もう一度お試しください。" }, 400);
  }

  // 入力が誤っているうちは、外部サービスへ問い合わせない
  const built = buildRouteRequest(input);
  if (!built.ok) {
    return json({ error: built.error }, 400);
  }

  const start = await upgradeWaypoint(built.request.start, input.start ?? "");
  const goalIsSameAsStart = built.request.goal === built.request.start;
  const goal = goalIsSameAsStart ? start : await upgradeWaypoint(built.request.goal, input.returnTo ?? "");
  const routeRequest = { ...built.request, start, goal };

  // 候補が多いままだと、組み合わせの総当たりも徒歩時間表も現実的な大きさに収まらない。
  // 予算・時間・出発地からの近さ・希望との一致で先に絞り込む。
  const candidates = selectCandidates(ROUTE_PLACES, {
    start,
    goal,
    notes: routeRequest.notes,
    budget: routeRequest.budget,
    availableMinutes: routeRequest.availableMinutes,
    safetyBufferMinutes: routeRequest.safetyBufferMinutes,
  });

  // 徒歩時間は総当たり表で1回だけ取る。取れなければ直線距離の概算へ戻す。
  const points: Point[] = [start];
  if (!samePoint(goal, start)) points.push(goal);
  for (const place of candidates) points.push({ lat: place.lat, lng: place.lng });

  const matrix = await travelMatrixMinutes(points);
  const lookup = buildTravelLookup(points, matrix);
  const travelMinutes = (from: Point, to: Point) => lookup(from, to) ?? estimateTravelMinutes(from, to);

  const plans = planRoutes(candidates, routeRequest, { travelMinutes });
  const routes = toRouteViews(plans, built.startClock ? { startClock: built.startClock } : {});
  const travelSource = matrix ? "osm" : "estimate";

  if (routes.length === 0) {
    return json({
      routes: [],
      budget: routeRequest.budget,
      travelSource,
      message:
        "この時間と予算で、ゴール地点へ余裕を残して戻れるルートが見つかりませんでした。時間を延ばすか、予算を上げてお試しください。",
    });
  }

  return json({ routes, budget: routeRequest.budget, travelSource });
}

export async function GET(): Promise<Response> {
  return json({ error: "このURLはPOSTのみ受け付けます。" }, 405);
}
