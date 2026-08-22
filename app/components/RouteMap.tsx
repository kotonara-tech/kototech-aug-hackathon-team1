"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, Polyline } from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  NARA_STATION,
  buildMapPoints,
  buildWalkLine,
  computeBounds,
  pointAtProgress,
  triangleWave,
  headingFromDelta,
  type StopInput,
  type LatLng,
} from "../lib/map-view";

/** OpenStreetMap のタイル利用ポリシー上、帰属表示は必須。 */
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>';
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type RouteMapSpot = { name: string; lat: number; lng: number };

type RouteMapProps<T extends RouteMapSpot> = {
  routeId: string;
  routeColor: string;
  walkSummary: string;
  stops: { spot: T }[];
  onSelectSpot: (spot: T) => void;
};

export default function RouteMap<T extends RouteMapSpot>({
  routeId,
  routeColor,
  walkSummary,
  stops,
  onSelectSpot,
}: RouteMapProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<{ markers: Marker[]; line: Polyline | null }>({ markers: [], line: null });
  const deerMarkerRef = useRef<Marker | null>(null);
  const deerLineRef = useRef<LatLng[]>([]);
  const deerRafRef = useRef<number | null>(null);
  const deerStartRef = useRef<number | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // 地図本体の初期化
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, { scrollWheelZoom: false });
      L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map);
      map.setView([NARA_STATION.lat, NARA_STATION.lng], 15);
      mapRef.current = map;
      setMapReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // ルート切り替え時のマーカー・ライン再描画
  useEffect(() => {
    let cancelled = false;
    if (!mapReady) return;

    (async () => {
      const L = await import("leaflet");
      const map = mapRef.current;
      if (cancelled || !map) return;

      for (const marker of layersRef.current.markers) marker.remove();
      layersRef.current.markers = [];
      layersRef.current.line?.remove();
      layersRef.current.line = null;

      const stopInputs: StopInput[] = stops.map((stop, index) => ({
        id: String(index),
        name: stop.spot.name,
        lat: stop.spot.lat,
        lng: stop.spot.lng,
      }));
      const points = buildMapPoints(stopInputs, NARA_STATION);
      const line = buildWalkLine(NARA_STATION, stopInputs, NARA_STATION);

      // 鹿アニメーション用に折れ線を保存。ルート切り替え時に鹿が新しい線を歩き直す。
      deerLineRef.current = line;
      // 鹿の開始時刻をリセットして新ルートの始点から歩き直す
      deerStartRef.current = null;

      if (line.length >= 2) {
        layersRef.current.line = L.polyline(
          line.map((point) => [point.lat, point.lng]),
          { color: routeColor, weight: 4, dashArray: "4 8", lineCap: "round" },
        ).addTo(map);
      }

      for (const point of points) {
        const isOrigin = point.kind === "origin";

        // ピンとラベルが重ならないHTMLとスタイルを直接注入
        const html = isOrigin
          ? `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
               <div style="background:#1c1917;color:#fff;border-radius:50%;width:50px;height:50px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:10px;font-weight:bold;line-height:1.1;box-shadow:0 4px 6px -1px rgba(0,0,0,0.3);border:2px solid #fff;">
                 START<br/>&amp; GOAL
               </div>
             </div>`
          : `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;width:160px;margin-left:-80px;">
               <div style="background:#dc2626;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;box-shadow:0 4px 6px -1px rgba(0,0,0,0.3);border:2px solid #fff;">
                 ${point.order}
               </div>
               <div style="margin-top:4px;background:rgba(255,255,255,0.95);color:#1c1917;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:bold;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,0.15);border:1px solid rgba(0,0,0,0.08);pointer-events:auto;">
                 ${escapeHtml(point.label)}
               </div>
             </div>`;

        const icon = L.divIcon({
          className: "custom-map-pin",
          html: html,
          iconSize: isOrigin ? [50, 50] : [32, 55],
          iconAnchor: isOrigin ? [25, 25] : [16, 16],
        });

        const marker = L.marker([point.lat, point.lng], {
          icon,
          keyboard: true,
          zIndexOffset: isOrigin ? 100 : 500, // ピンの基本重なり順
        }).addTo(map);

        if (!isOrigin) {
          const spot = stops[Number(point.id)]?.spot;
          if (spot) {
            marker.on("click", () => {
              marker.setZIndexOffset(1000); // クリックしたピンを一番手前に持ってくる
              onSelectSpot(spot);
            });
          }
        }

        layersRef.current.markers.push(marker);
      }

      const bounds = computeBounds(points);
      if (bounds) {
        map.fitBounds(
          [
            [bounds.southWest.lat, bounds.southWest.lng],
            [bounds.northEast.lat, bounds.northEast.lng],
          ],
          { padding: [50, 50] },
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routeId, routeColor, stops, onSelectSpot, mapReady]);

  // 鹿マーカーが折れ線を往復するアニメーション
  useEffect(() => {
    if (!mapReady) return;

    const PERIOD_MS = 12000; // 往復1サイクル12秒

    function buildDeerHtml(facingWest: boolean): string {
      const flip = facingWest ? "transform:scaleX(-1);" : "";
      return `<div class="deer-map-marker" style="${flip}pointer-events:none;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="36" height="36" aria-hidden="true">
          <line x1="16" y1="6" x2="11" y2="1" stroke="#7a5c3a" stroke-width="2" stroke-linecap="round"/>
          <line x1="11" y1="1" x2="8" y2="4" stroke="#7a5c3a" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="16" y1="6" x2="21" y2="2" stroke="#7a5c3a" stroke-width="2" stroke-linecap="round"/>
          <line x1="21" y1="2" x2="24" y2="5" stroke="#7a5c3a" stroke-width="1.5" stroke-linecap="round"/>
          <ellipse cx="16" cy="11" rx="6" ry="5" fill="#b07a45"/>
          <ellipse cx="9" cy="9" rx="3" ry="2" fill="#b07a45" transform="rotate(-20 9 9)"/>
          <ellipse cx="9" cy="13" rx="1.5" ry="1.2" fill="#8a5c30"/>
          <circle cx="13" cy="9" r="1.2" fill="#3a2510"/>
          <ellipse cx="27" cy="26" rx="11" ry="8" fill="#b07a45"/>
          <ellipse cx="36" cy="28" rx="6" ry="5" fill="#c4935a"/>
          <polygon points="14,16 19,14 21,22 16,24" fill="#b07a45"/>
          <line x1="18" y1="32" x2="16" y2="44" stroke="#8a5c30" stroke-width="3" stroke-linecap="round"/>
          <line x1="34" y1="32" x2="36" y2="44" stroke="#8a5c30" stroke-width="3" stroke-linecap="round"/>
          <line x1="20" y1="32" x2="18" y2="44" stroke="#7a5025" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="32" y1="32" x2="34" y2="44" stroke="#7a5025" stroke-width="2.5" stroke-linecap="round"/>
          <ellipse cx="40" cy="24" rx="2.5" ry="1.5" fill="#f0e8d8"/>
        </svg>
      </div>`;
    }

    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      const map = mapRef.current;
      if (cancelled || !map) return;

      // prefers-reduced-motion チェック
      const prefersReduced = typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const line = deerLineRef.current;
      if (line.length < 2) return;

      // 鹿マーカー（インタラクティブ無効）
      const icon = L.divIcon({
        className: "deer-map-marker",
        html: buildDeerHtml(false),
        iconSize: [36, 36],
        iconAnchor: [18, 44],
      });

      const startPos = line[0];
      const marker = L.marker([startPos.lat, startPos.lng], {
        icon,
        interactive: false,
        keyboard: false,
        zIndexOffset: -100,
      }).addTo(map);
      deerMarkerRef.current = marker;

      if (prefersReduced) return; // アニメーション停止

      function tick(timestamp: number) {
        if (cancelled) return;

        if (deerStartRef.current === null) deerStartRef.current = timestamp;
        const elapsed = timestamp - deerStartRef.current;
        const t = triangleWave(elapsed, PERIOD_MS);

        const currentLine = deerLineRef.current;
        if (currentLine.length >= 2) {
          const progress = pointAtProgress(currentLine, t);
          if (progress) {
            const facingWest = headingFromDelta(progress.headingLng) === "west";
            marker.setLatLng([progress.point.lat, progress.point.lng]);
            marker.setIcon(
              L.divIcon({
                className: "deer-map-marker",
                html: buildDeerHtml(facingWest),
                iconSize: [36, 36],
                iconAnchor: [18, 44],
              }),
            );
          }
        }

        deerRafRef.current = requestAnimationFrame(tick);
      }

      deerRafRef.current = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      if (deerRafRef.current !== null) {
        cancelAnimationFrame(deerRafRef.current);
        deerRafRef.current = null;
      }
      deerStartRef.current = null;
      deerMarkerRef.current?.remove();
      deerMarkerRef.current = null;
    };
  }, [mapReady, routeId]);

  return (
    <div className="route-map" style={{ "--route-color": routeColor } as React.CSSProperties}>
      <div
        ref={containerRef}
        className="route-map-canvas"
        role="group"
        aria-label={`ROUTE ${routeId} の地図。立ち寄り先の一覧は下のタイムラインからも選べます。`}
      />
      <div className="map-legend">
        <span>徒歩ルート（直線の目安）</span>
        <strong>{walkSummary}</strong>
      </div>
      <p className="route-map-note">
        出発・帰着地点は近鉄奈良駅のプロトタイプ固定値（ジオコーディング未接続）。ラインは道なりではなく直線の目安表示です。
      </p>
    </div>
  );
}