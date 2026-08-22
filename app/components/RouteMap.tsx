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

/**
 * OpenStreetMap のタイルを Leaflet で表示する地図。
 *
 * react-leaflet は使わず、useEffect の中で Leaflet を動的 import して直接操作する
 * （SSR時に window に触れることを避けるため）。
 * ピンの座標は選択中ルートの立ち寄り先（spot.lat / spot.lng）と、
 * プロトタイプの固定値である近鉄奈良駅（NARA_STATION）を使う。
 * START → 各立ち寄り先 → GOAL の線は直線の目安表示であり、実際の道なりの経路ではない。
 */
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

  // 地図本体の初期化・後片付け（マウント中に1回だけ）
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

  // ルート切り替えのたびに、ピン・線・表示範囲を張り替える(地図の初期化が終わってから)
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

      // Spot 側には id が無いため、ここでは配列の添字を id として使う。
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
          { color: routeColor, weight: 4, dashArray: "2 10", lineCap: "round" },
        ).addTo(map);
      }

      for (const point of points) {
        const isOrigin = point.kind === "origin";
        const icon = L.divIcon({
          className: "route-map-pin-wrap",
          html: isOrigin
            ? `<span class="route-map-pin route-map-pin-origin">START<br />&amp; GOAL</span>`
            : `<span class="route-map-pin route-map-pin-stop"><i>${point.order}</i><b>${escapeHtml(point.label)}</b></span>`,
          iconSize: isOrigin ? [58, 58] : [44, 44],
          iconAnchor: isOrigin ? [29, 29] : [22, 22],
        });
        const marker = L.marker([point.lat, point.lng], {
          icon,
          keyboard: true,
          alt: isOrigin ? "出発・帰着地点" : `${point.label}の詳細`,
        }).addTo(map);

        if (!isOrigin) {
          const spot = stops[Number(point.id)]?.spot;
          if (spot) marker.on("click", () => onSelectSpot(spot));
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
          { padding: [40, 40] },
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
