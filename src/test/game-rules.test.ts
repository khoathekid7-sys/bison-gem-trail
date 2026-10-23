import { describe, expect, it } from "vitest";
import { advance, demoVerify } from "@/lib/demo";
import { checkLocation, haversineM, TAYLOR_HALL, validateFirstStopPoint } from "@/lib/geo";
import { crc32, makeZip } from "@/lib/zip";
import { photoDecision, type VisionResult } from "@/lib/vision.server";

const ELC = { lat: 40.956486, lng: -76.884524, radius_m: 45 };
const CARNEGIE = { lat: 40.95618, lng: -76.88178, radius_m: 45 };
const now = Date.parse("2026-10-23T12:00:00Z");
const fix = { lat: ELC.lat, lng: ELC.lng, accuracy: 6, timestamp: now };

describe("campus rules", () => {
  it("keeps the published ELC pin within 500 ft, while Carnegie is outside", () => {
    expect(validateFirstStopPoint(ELC).ok).toBe(true);
    expect(validateFirstStopPoint(CARNEGIE).ok).toBe(false);
    expect(haversineM(TAYLOR_HALL, ELC)).toBeGreaterThan(130);
    expect(haversineM(TAYLOR_HALL, CARNEGIE)).toBeGreaterThan(152.4);
  });

  it("rejects stale, poor-accuracy, future, and distant fixes without enlarging the radius", () => {
    expect(checkLocation(fix, ELC, now).ok).toBe(true);
    expect(checkLocation({ ...fix, timestamp: now - 30_001 }, ELC, now)).toMatchObject({ ok: false, code: "stale" });
    expect(checkLocation({ ...fix, accuracy: 40.1 }, ELC, now)).toMatchObject({ ok: false, code: "inaccurate" });
    expect(checkLocation({ ...fix, timestamp: now + 30_001 }, ELC, now)).toMatchObject({ ok: false, code: "future" });
    expect(checkLocation({ ...fix, lat: ELC.lat + 0.001 }, ELC, now)).toMatchObject({ ok: false, code: "far" });
  });

  it("unlocks only the current gem after both checks pass, once", () => {
    const passed = { locationPassed: true, photoPassed: true };
    expect(advance(1, 1, passed)).toBe(2);
    expect(advance(2, 1, passed)).toBe(2);
    expect(advance(1, 2, passed)).toBe(1);
    expect(advance(1, 1, { ...passed, photoPassed: false })).toBe(1);
    expect(advance(1, 1, { ...passed, locationPassed: false })).toBe(1);
  });

  it("keeps the demo check deterministic and labels bad photos and GPS separately", () => {
    expect(demoVerify("correct", fix, ELC, now)).toMatchObject({ locationPassed: true, photoPassed: true });
    expect(demoVerify("wrong", fix, ELC, now)).toMatchObject({ locationPassed: true, photoPassed: false, photoChecked: true });
    expect(demoVerify("correct", { ...fix, accuracy: 85 }, ELC, now)).toMatchObject({ locationPassed: false, photoPassed: false, photoChecked: false });
  });
});

describe("album ZIP", () => {
  it("stores each filename and byte sequence with a valid central directory", () => {
    const image = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const zip = makeZip([{ name: "elc.jpg", data: image }, { name: "carnegie.jpg", data: image }]);
    const view = new DataView(zip.buffer);
    const end = zip.length - 22;
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    expect(view.getUint32(14, true)).toBe(crc32(image));
    const names = new TextDecoder().decode(zip);
    expect(names).toContain("elc.jpg");
    expect(names).toContain("carnegie.jpg");
  });
});

describe("photo policy", () => {
  const match: VisionResult = { matches_landmark: true, confidence: 0.9, is_screen_or_print: false, too_blurry_or_dark: false, insufficient_context: false, reason: "Matches", retry_tip: "" };
  it("requires a strong match and rejects replay, blur, or missing context", () => {
    expect(photoDecision(match, true).passed).toBe(true);
    expect(photoDecision({ ...match, confidence: 0.75 }, false).passed).toBe(false);
    expect(photoDecision({ ...match, is_screen_or_print: true }, true).passed).toBe(false);
    expect(photoDecision({ ...match, too_blurry_or_dark: true }, true).passed).toBe(false);
    expect(photoDecision({ ...match, insufficient_context: true }, true).passed).toBe(false);
  });
});
