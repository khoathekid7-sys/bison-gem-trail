// Browser-only MapLibre map (lazy-loaded). Recolors an OpenFreeMap style into the Bison Quest palette.
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import bison from "@/assets/bison.png";
import type { MapStop } from "./types";
import type { Fix } from "@/lib/geo";
import { SchematicMap } from "./SchematicMap";

maplibregl.setWorkerUrl(workerUrl);

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function circle(lat: number, lng: number, r: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([lng + ((r / 111320) * Math.cos(a)) / Math.cos((lat * Math.PI) / 180), lat + (r / 110540) * Math.sin(a)]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [pts] } };
}

export default function GameMap({ stops, fix, focusId, onSelect }: { stops: MapStop[]; fix: Fix | null; focusId?: string; onSelect?: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const player = useRef<maplibregl.Marker | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!el.current) return;
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container: el.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: [-76.8832, 40.9566],
        zoom: 16.6,
        pitch: 45,
        attributionControl: { compact: true },
      });
    } catch {
      setFailed(true);
      return;
    }
    map.current = m;
    const timeout = setTimeout(() => !m.loaded() && setFailed(true), 12000);
    m.on("error", (e) => {
      if (!m.isStyleLoaded() && (e as { error?: Error }).error) setFailed(true);
    });
    m.on("load", () => {
      clearTimeout(timeout);
      const mint = cssVar("--mint"), cream = cssVar("--cream"), navy = cssVar("--navy"), cyan = cssVar("--cyan");
      for (const layer of m.getStyle().layers ?? []) {
        const id = layer.id;
        try {
          if (layer.type === "background") m.setPaintProperty(id, "background-color", cream);
          else if (layer.type === "fill" && /park|grass|wood|landcover|landuse/.test(id)) m.setPaintProperty(id, "fill-color", mint);
          else if (layer.type === "fill" && /water/.test(id)) m.setPaintProperty(id, "fill-color", cyan);
          else if (layer.type === "fill" && /building/.test(id)) { m.setPaintProperty(id, "fill-color", navy); m.setPaintProperty(id, "fill-opacity", 0.82); }
          else if (layer.type === "line" && /road|highway|path|street|bridge|tunnel/.test(id)) m.setPaintProperty(id, "line-color", "#fffaf0");
        } catch { /* layer may not support property */ }
      }
      m.addSource("rings", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "rings-fill", type: "fill", source: "rings", paint: { "fill-color": cyan, "fill-opacity": 0.18 } });
      m.addLayer({ id: "rings-line", type: "line", source: "rings", paint: { "line-color": cyan, "line-width": 3 } });
      setReady(true);
    });
    return () => {
      clearTimeout(timeout);
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    markers.current.forEach((x) => x.remove());
    markers.current = stops.map((s) => {
      const b = document.createElement("button");
      b.className = "bq-gem";
      b.dataset.state = s.state;
      b.setAttribute("aria-label", s.state === "locked" ? "Locked gem" : `${s.label} gem${s.state === "done" ? " (collected)" : ""}`);
      const img = document.createElement("img");
      img.src = s.gemImg;
      img.alt = "";
      b.appendChild(img);
      b.onclick = () => onSelect?.(s.id);
      return new maplibregl.Marker({ element: b }).setLngLat([s.lng, s.lat]).addTo(m);
    });
    const active = stops.filter((s) => s.state === "active");
    (m.getSource("rings") as maplibregl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: active.map((s) => circle(s.lat, s.lng, s.radius)) });
  }, [stops, ready, onSelect]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (!fix) { player.current?.remove(); player.current = null; return; }
    if (!player.current) {
      const d = document.createElement("div");
      d.className = "bq-player";
      d.setAttribute("aria-label", "Your position");
      d.innerHTML = `<img src="${bison}" alt="" />`;
      player.current = new maplibregl.Marker({ element: d }).setLngLat([fix.lng, fix.lat]).addTo(m);
    } else player.current.setLngLat([fix.lng, fix.lat]);
  }, [fix, ready]);

  useEffect(() => {
    const m = map.current;
    const s = stops.find((x) => x.id === focusId);
    if (!m || !ready || !s) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    m.easeTo({ center: [s.lng, s.lat], zoom: 17, duration: reduce ? 0 : 900 });
  }, [focusId, ready, stops]);

  if (failed) return <SchematicMap stops={stops} fix={fix} note="Map tiles unavailable — showing campus schematic" />;
  return <div ref={el} className="absolute inset-0" aria-label="Campus map" role="region" />;
}
