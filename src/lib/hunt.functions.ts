import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { checkLocation } from "./geo";

// Anonymous player session: random bearer token held by the browser, only its SHA-256 is stored.
async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
async function sessionFor(token: string) {
  const db = await admin();
  const { data } = await db.from("hunt_sessions").select("*").eq("token_hash", await sha256(token)).maybeSingle();
  if (!data) throw new Error("SESSION_NOT_FOUND");
  return { db, session: data };
}

const tokenSchema = z.string().min(32).max(128);
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export const startSession = createServerFn({ method: "POST" }).handler(async () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const db = await admin();
  const { error } = await db.from("hunt_sessions").insert({ token_hash: await sha256(token) });
  if (error) throw new Error("Could not start a session. Please retry.");
  return { token };
});

export const getHuntState = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ token: tokenSchema }).parse(i))
  .handler(async ({ data }) => {
    const { db, session } = await sessionFor(data.token);
    const [{ data: stops }, { data: caps }, { data: refs }] = await Promise.all([
      db.from("stops").select("id,step,name,lat,lng,radius_m,calibrated").order("step"),
      db.from("captures").select("id,stop_id,status,created_at,reason,review_reason,storage_path,location_passed").eq("session_id", session.id).in("status", ["accepted", "pending_review", "review_rejected", "error"]).order("created_at"),
      db.from("reference_photos").select("stop_id"),
    ]);
    const captures = await Promise.all(
      (caps ?? []).map(async (c) => {
        let url: string | null = null;
        if (c.storage_path && c.status !== "error") {
          const s = await db.storage.from("captures").createSignedUrl(c.storage_path, 600);
          url = s.data?.signedUrl ?? null;
        }
        return { id: c.id, stopId: c.stop_id, status: c.status, createdAt: c.created_at, reason: c.review_reason ?? c.reason, url, reviewable: c.status === "error" && c.location_passed && !!c.storage_path };
      }),
    );
    const refCounts: Record<string, number> = {};
    for (const r of refs ?? []) refCounts[r.stop_id] = (refCounts[r.stop_id] ?? 0) + 1;
    return { currentStep: session.current_step, completedAt: session.completed_at, stops: stops ?? [], captures, refCounts };
  });

export type VerifyResponse = {
  locationPassed: boolean;
  photoPassed: boolean;
  photoChecked: boolean;
  confidence: number;
  reason: string;
  retryTip: string;
  serviceError?: boolean;
  captureId?: string;
  currentStep: number;
  referenceBased?: boolean;
};

export const verifyCapture = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        token: tokenSchema,
        stopId: z.enum(["elc", "carnegie"]),
        attemptId: z.string().regex(/^[a-zA-Z0-9-]{8,64}$/),
        image: z.string().max(5_000_000),
        fix: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100000), timestamp: z.number() }),
      })
      .parse(i),
  )
  .handler(async ({ data }): Promise<VerifyResponse> => {
    const { db, session } = await sessionFor(data.token);
    const now = Date.now();

    // Idempotency: a replayed submit returns the stored verdict (except service errors, which re-run).
    const { data: prior } = await db.from("captures").select("*").eq("session_id", session.id).eq("client_capture_id", data.attemptId).maybeSingle();
    if (prior && prior.status !== "error") {
      return { locationPassed: prior.location_passed, photoPassed: prior.photo_passed, photoChecked: prior.location_passed, confidence: prior.confidence ?? 0, reason: prior.reason ?? "", retryTip: prior.retry_tip ?? "", captureId: prior.id, currentStep: session.current_step };
    }

    const { data: stop } = await db.from("stops").select("*").eq("id", data.stopId).single();
    if (!stop) throw new Error("Unknown stop");
    if (stop.step !== session.current_step) {
      return { locationPassed: false, photoPassed: false, photoChecked: false, confidence: 0, reason: stop.step < session.current_step ? "You already collected this gem." : "This gem is still locked — solve the current clue first.", retryTip: "", currentStep: session.current_step };
    }

    // Throttle: >= 4 s between attempts, <= 20 per hour.
    const recent = (session.attempt_times ?? []).map((t: string) => Date.parse(t)).filter((t: number) => now - t < 3600_000);
    if (recent.length && now - Math.max(...recent) < 4000) throw new Error("Slow down a little — wait a few seconds and retry.");
    if (recent.length >= 20) throw new Error("Too many attempts this hour. Take a breather and try again later.");
    await db.from("hunt_sessions").update({ attempt_times: [...recent.map((t: number) => new Date(t).toISOString()), new Date(now).toISOString()] }).eq("id", session.id);

    const loc = checkLocation(data.fix, stop, now);
    const base = { session_id: session.id, stop_id: stop.id, client_capture_id: data.attemptId, distance_m: loc.distanceM, accuracy_m: data.fix.accuracy };
    if (!loc.ok) {
      await db.from("captures").upsert({ ...base, status: "rejected", location_passed: false, photo_passed: false, reason: loc.message, retry_tip: "Refresh GPS, then submit again — your photo is kept." }, { onConflict: "session_id,client_capture_id" });
      return { locationPassed: false, photoPassed: false, photoChecked: false, confidence: 0, reason: loc.message, retryTip: "Refresh GPS, then submit again — your photo is kept.", currentStep: session.current_step };
    }

    // Validate the image: declared MIME, magic bytes, size.
    const m = data.image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m || !ALLOWED_MIME.includes(m[1] as (typeof ALLOWED_MIME)[number])) throw new Error("Unsupported image format.");
    const bin = Uint8Array.from(atob(m[2]!), (c) => c.charCodeAt(0));
    if (bin.length > MAX_IMAGE_BYTES || bin.length < 2000) throw new Error("Image size is out of range.");
    const magicOk = (m[1] === "image/jpeg" && bin[0] === 0xff && bin[1] === 0xd8) || (m[1] === "image/png" && bin[0] === 0x89 && bin[1] === 0x50) || (m[1] === "image/webp" && bin[8] === 0x57 && bin[9] === 0x45);
    if (!magicOk) throw new Error("That file isn't a valid image.");

    const path = `${session.id}/${stop.id}-${data.attemptId}.jpg`;
    const up = await db.storage.from("captures").upload(path, bin, { contentType: m[1]!, upsert: true });
    if (up.error) throw new Error("Upload failed. Please retry.");

    const { data: row } = await db.from("captures").upsert({ ...base, storage_path: path, status: "error", location_passed: true, photo_passed: false, reason: "Checking…" }, { onConflict: "session_id,client_capture_id" }).select("id").single();
    const captureId = row!.id;

    const { checkLandmark, photoDecision, VisionServiceError } = await import("./vision.server");
    const { data: refs } = await db.from("reference_photos").select("storage_path").eq("stop_id", stop.id).limit(3);
    const refUrls: string[] = [];
    for (const r of refs ?? []) {
      const f = await db.storage.from("references").download(r.storage_path);
      if (f.data) {
        const b = new Uint8Array(await f.data.arrayBuffer());
        let s = "";
        for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
        refUrls.push(`data:${f.data.type || "image/jpeg"};base64,${btoa(s)}`);
      }
    }
    const apiKey = process.env["LOVABLE_API_KEY"];
    try {
      if (!apiKey) throw new VisionServiceError("Photo checker is not configured.");
      const v = await checkLandmark({ apiKey, landmark: stop.landmark_description, playerImageDataUrl: data.image, referenceDataUrls: refUrls });
      const d = photoDecision(v, refUrls.length > 0);
      const retryTip = d.passed ? "" : v.retry_tip || "Try a wider, steadier shot of the landmark.";
      await db.from("captures").update({ status: "rejected", photo_passed: d.passed, confidence: d.confidence, reason: v.reason, retry_tip: retryTip }).eq("id", captureId);
      let step = session.current_step;
      if (d.passed) {
        const { data: ok } = await db.rpc("accept_capture", { p_capture: captureId });
        if (ok) step = stop.step + 1;
      }
      return { locationPassed: true, photoPassed: d.passed, photoChecked: true, confidence: d.confidence, reason: v.reason, retryTip, captureId, currentStep: step, referenceBased: refUrls.length > 0 };
    } catch (e) {
      const msg = e instanceof VisionServiceError ? e.message : "The photo checker didn't respond.";
      await db.from("captures").update({ status: "error", reason: msg }).eq("id", captureId);
      return { locationPassed: true, photoPassed: false, photoChecked: false, confidence: 0, reason: msg, retryTip: "Retry when you have signal — your photo is saved. Or ask an organizer to review it.", serviceError: true, captureId, currentStep: session.current_step };
    }
  });

export const requestReview = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ token: tokenSchema, captureId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { db, session } = await sessionFor(data.token);
    const { data: c } = await db.from("captures").select("*").eq("id", data.captureId).eq("session_id", session.id).maybeSingle();
    if (!c) throw new Error("Not found");
    if (c.status !== "error" || !c.location_passed || !c.storage_path) throw new Error("Only photos taken on-site during a checker outage can be sent for review.");
    await db.from("captures").update({ status: "pending_review" }).eq("id", c.id);
    return { ok: true };
  });
