"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, Polyline } from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  NARA_STATION,
  buildMapPoints,
  buildWalkLine,
  computeBounds,
  type StopInput,
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