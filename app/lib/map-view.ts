/**
 * 地図表示のための純粋関数群。
 *
 * Leaflet や DOM には依存しない。ピン・境界・中心座標・徒歩ラインの計算だけを行い、
 * `app/components/RouteMap.tsx` から呼び出す。テストは tests/map-view.test.ts。
 */

export type LatLng = { lat: number; lng: number };

/**
 * 近鉄奈良駅の固定座標。
 *
 * プロトタイプの固定値（ジオコーディング未接続）。
 * 入力フォームの出発地・帰着地は自由文字列で、住所や地名を座標へ変換する仕組みが
 * まだ無いため、現状は常にこの定数を START / GOAL の座標として使う。
 * 実際の出発地点が近鉄奈良駅と異なっていても、地図上ではこの位置に表示される。
 */
export const NARA_STATION: LatLng = { lat: 34.6829, lng: 135.8291 };

/** 立ち寄り先の入力。ルートの stops から座標が取れるものだけを渡す。 */
export type StopInput = LatLng & { id: string; name: string };

/** 地図に打つ1点。 */
export type MapPoint = LatLng & {
  id: string;
  label: string;
  kind: "origin" | "stop";
  /** kind が "stop" のときの番号（1始まり）。 */
  order?: number;
};

/** 緯度経度が数値として有効か（NaN・範囲外を弾く）。 */
export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * 立ち寄り先と起点（START & GOAL）から、地図に打つ点の配列をつくる。
 * 起点は1点だけ（出発と帰着が同じ場所であるプロトタイプの前提）。
 */
export function buildMapPoints(stops: StopInput[], origin: LatLng = NARA_STATION): MapPoint[] {
  const points: MapPoint[] = [];

  if (isValidLatLng(origin.lat, origin.lng)) {
    points.push({ id: "origin", lat: origin.lat, lng: origin.lng, label: "START & GOAL", kind: "origin" });
  }

  let order = 0;
  for (const stop of stops) {
    if (!isValidLatLng(stop.lat, stop.lng)) continue;
    order += 1;
    points.push({ id: stop.id, lat: stop.lat, lng: stop.lng, label: stop.name, kind: "stop", order });
  }

  return points;
}

export type Bounds = { southWest: LatLng; northEast: LatLng };

/** 点が1つしかないときに境界が潰れないようにする最低限の余白（度）。 */
const MIN_BOUNDS_SPAN_DEGREES = 0.006;

/** 点の配列から境界（南西・北東）を出す。点が1つのときも潰れない境界を返す。 */
export function computeBounds(points: LatLng[]): Bounds | null {
  const valid = points.filter((p) => isValidLatLng(p.lat, p.lng));
  if (valid.length === 0) return null;

  let minLat = valid[0].lat;
  let maxLat = valid[0].lat;
  let minLng = valid[0].lng;
  let maxLng = valid[0].lng;

  for (const point of valid) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  }

  if (maxLat - minLat < MIN_BOUNDS_SPAN_DEGREES) {
    const midLat = (maxLat + minLat) / 2;
    minLat = midLat - MIN_BOUNDS_SPAN_DEGREES / 2;
    maxLat = midLat + MIN_BOUNDS_SPAN_DEGREES / 2;
  }
  if (maxLng - minLng < MIN_BOUNDS_SPAN_DEGREES) {
    const midLng = (maxLng + minLng) / 2;
    minLng = midLng - MIN_BOUNDS_SPAN_DEGREES / 2;
    maxLng = midLng + MIN_BOUNDS_SPAN_DEGREES / 2;
  }

  return { southWest: { lat: minLat, lng: minLng }, northEast: { lat: maxLat, lng: maxLng } };
}

/** 点の配列から中心座標（単純平均）を出す。有効な点が1つもなければ null。 */
export function computeCenter(points: LatLng[]): LatLng | null {
  const valid = points.filter((p) => isValidLatLng(p.lat, p.lng));
  if (valid.length === 0) return null;

  const sum = valid.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / valid.length, lng: sum.lng / valid.length };
}

/**
 * START → 各立ち寄り先 → GOAL を結ぶ座標列をつくる。
 *
 * これは直線の目安表示用であり、実際の道なりの経路ではない。
 * 不正な座標の立ち寄り先はスキップする。
 */
export function buildWalkLine(start: LatLng, stops: StopInput[], goal: LatLng): LatLng[] {
  const line: LatLng[] = [];

  if (isValidLatLng(start.lat, start.lng)) line.push({ lat: start.lat, lng: start.lng });
  for (const stop of stops) {
    if (isValidLatLng(stop.lat, stop.lng)) line.push({ lat: stop.lat, lng: stop.lng });
  }
  if (isValidLatLng(goal.lat, goal.lng)) line.push({ lat: goal.lat, lng: goal.lng });

  return line;
}

/** 折れ線上のある位置。地図の上を歩く鹿マーカーの座標・向きに使う。 */
export type LineProgress = {
  point: LatLng;
  /**
   * 現在いる区間の始点→終点の経度差。
   * 正なら東へ、負なら西へ進んでいる（`headingFromDelta` で判定する）。
   * 区間の長さが0のときや折れ線が1点のときは 0。
   */
  headingLng: number;
};

/** 2点間の距離（度単位のユークリッド距離）。地図表示用の目安計算であり、実距離ではない。 */
function degreeDistance(a: LatLng, b: LatLng): number {
  const dLat = b.lat - a.lat;
  const dLng = b.lng - a.lng;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * 折れ線（`line`）上の進捗 `t`（0〜1）に対応する座標を返す。
 *
 * 区間の点数ではなく**距離**で按分するため、短い区間でも長い区間でも一定の速さで進む。
 * `t` は 0〜1 にクランプする。折れ線が空なら `null`、1点しかなければ常にその点を返す。
 */
export function pointAtProgress(line: LatLng[], t: number): LineProgress | null {
  if (line.length === 0) return null;
  if (line.length === 1) return { point: { ...line[0] }, headingLng: 0 };

  const clamped = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;

  const segmentLengths: number[] = [];
  let total = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const len = degreeDistance(line[i], line[i + 1]);
    segmentLengths.push(len);
    total += len;
  }

  if (total === 0) {
    return { point: { ...line[0] }, headingLng: 0 };
  }

  const targetDistance = clamped * total;
  let traveled = 0;

  for (let i = 0; i < segmentLengths.length; i++) {
    const segLen = segmentLengths[i];
    const segEnd = traveled + segLen;
    const isLastSegment = i === segmentLengths.length - 1;

    if (targetDistance <= segEnd || isLastSegment) {
      const from = line[i];
      const to = line[i + 1];
      // 長さ0の区間は0除算を避け、そのまま終点を返す。
      const segT = segLen === 0 ? 1 : Math.min(1, Math.max(0, (targetDistance - traveled) / segLen));
      return {
        point: {
          lat: from.lat + (to.lat - from.lat) * segT,
          lng: from.lng + (to.lng - from.lng) * segT,
        },
        headingLng: to.lng - from.lng,
      };
    }

    traveled = segEnd;
  }

  const last = line[line.length - 1];
  return { point: { ...last }, headingLng: 0 };
}

/** 進行方向。鹿マーカーを左右反転させるかの判定に使う。 */
export type Heading = "east" | "west" | "none";

/** 経度差から進行方向を判定する。正なら東、負なら西、0ならnone。 */
export function headingFromDelta(deltaLng: number): Heading {
  if (deltaLng > 0) return "east";
  if (deltaLng < 0) return "west";
  return "none";
}

/**
 * 経過時間から、0→1→0 と往復する進捗値（三角波）をつくる。
 *
 * 地図上の鹿が折れ線の上を往復して歩くアニメーション、およびローディング演出の
 * 時間制御に使う。`periodMs` が0以下、または数値でなければ常に0を返す。
 */
export function triangleWave(elapsedMs: number, periodMs: number): number {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(periodMs) || periodMs <= 0) return 0;
  const phase = (((elapsedMs % periodMs) + periodMs) % periodMs) / periodMs;
  return phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
}
