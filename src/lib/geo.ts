// Pure geographic + gameplay rules shared by client, server and tests.

export const TAYLOR_HALL = { lat: 40.95716, lng: -76.8831 } as const; // official building pin
export const FIRST_STOP_MAX_FROM_TAYLOR_M = 152.4; // 500 ft
export const MAX_FIX_AGE_MS = 30_000;
export const MAX_FIX_ACCURACY_M = 40;
export const DEFAULT_RADIUS_M = 45;
export const M_TO_FT = 3.28084;

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const feet = (m: number) => Math.round(m * M_TO_FT);

export function validateFirstStopPoint(p: { lat: number; lng: number }) {
  const distanceM = haversineM(TAYLOR_HALL, p);
  return { ok: distanceM <= FIRST_STOP_MAX_FROM_TAYLOR_M, distanceM };
}

export type Fix = { lat: number; lng: number; accuracy: number; timestamp: number };

export type LocationCheck =
  | { ok: true; distanceM: number }
  | { ok: false; code: "stale" | "inaccurate" | "far" | "future"; distanceM: number; message: string };

/** Evaluate a GPS fix against a stop. Never enlarges the radius to fit. */
export function checkLocation(
  fix: Fix,
  stop: { lat: number; lng: number; radius_m: number },
  now: number,
): LocationCheck {
  const distanceM = haversineM(fix, stop);
  const age = now - fix.timestamp;
  if (age < -MAX_FIX_AGE_MS)
    return { ok: false, code: "future", distanceM, message: "Your device clock looks off. Refresh your location and try again." };
  if (age > MAX_FIX_AGE_MS)
    return { ok: false, code: "stale", distanceM, message: "Your location is more than 30 seconds old. Refresh GPS and try again." };
  if (fix.accuracy > MAX_FIX_ACCURACY_M)
    return { ok: false, code: "inaccurate", distanceM, message: `GPS is only accurate to ±${Math.round(fix.accuracy)} m. Step into open sky and wait for a sharper fix (±40 m or better).` };
  if (distanceM > stop.radius_m)
    return { ok: false, code: "far", distanceM, message: `You're about ${feet(distanceM)} ft from the spot. Get within ${feet(stop.radius_m)} ft.` };
  return { ok: true, distanceM };
}
