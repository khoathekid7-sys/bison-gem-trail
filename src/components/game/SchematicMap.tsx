// Labeled campus schematic: SSR-safe placeholder and fallback when map tiles fail.
import type { MapStop } from "./types";
import type { Fix } from "@/lib/geo";

const BOUNDS = { minLat: 40.9552, maxLat: 40.9582, minLng: -76.8865, maxLng: -76.8800 };
const proj = (lat: number, lng: number) => ({
  x: ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 1000,
  y: (1 - (lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 1000,
});

export function SchematicMap({ stops, fix, note }: { stops: MapStop[]; fix: Fix | null; note?: string }) {
  const taylor = proj(40.95716, -76.8831);
  return (
    <div className="absolute inset-0 bg-mint" role="img" aria-label="Simplified campus schematic showing the gem locations">
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        <rect width="1000" height="1000" fill="var(--mint)" />
        <path d="M0 520 C 250 480, 500 560, 1000 500" stroke="var(--cream)" strokeWidth="28" fill="none" />
        <path d="M480 0 C 460 300, 540 700, 500 1000" stroke="var(--cream)" strokeWidth="22" fill="none" />
        <path d="M150 1000 L 700 0" stroke="var(--cream)" strokeWidth="14" fill="none" />
        <rect x={taylor.x - 45} y={taylor.y - 30} width="90" height="60" rx="8" fill="var(--navy)" opacity="0.85" />
        <text x={taylor.x} y={taylor.y + 52} textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--navy)">Taylor Hall</text>
        {stops.map((s) => {
          const p = proj(s.lat, s.lng);
          return (
            <g key={s.id}>
              <rect x={p.x - 55} y={p.y - 35} width="110" height="70" rx="10" fill="var(--navy)" opacity="0.8" />
              <circle cx={p.x} cy={p.y} r="40" fill="none" stroke="var(--cyan)" strokeWidth="6" opacity={s.state === "active" ? 1 : 0.3} />
              <text x={p.x} y={p.y + 64} textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--navy)">
                {s.state === "locked" ? "???" : s.label}
              </text>
            </g>
          );
        })}
        {fix && (() => {
          const p = proj(fix.lat, fix.lng);
          return <circle cx={p.x} cy={p.y} r="18" fill="var(--primary)" stroke="var(--card)" strokeWidth="6" />;
        })()}
      </svg>
      {note && (
        <p className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-card/90 px-3 py-1 text-xs font-bold text-muted-foreground shadow-float">
          {note}
        </p>
      )}
    </div>
  );
}
