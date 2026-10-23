import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateFirstStopPoint, haversineM, TAYLOR_HALL } from "./geo";

type Ctx = { supabase: any; userId: string };
async function requireOrganizer(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "organizer" });
  if (!data) throw new Error("FORBIDDEN");
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export const claimOrganizer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("claim_first_organizer");
    if (error) throw new Error(error.message);
    return { organizer: !!data };
  });

export const amIOrganizer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "organizer" });
    return { organizer: !!data };
  });

export const organizerOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireOrganizer(context as Ctx);
    const [{ data: stops }, { data: refs }, { data: reviews }] = await Promise.all([
      db.from("stops").select("*").order("step"),
      db.from("reference_photos").select("*").order("created_at"),
      db.from("captures").select("id,stop_id,created_at,reason,storage_path,distance_m,accuracy_m").eq("status", "pending_review").order("created_at"),
    ]);
    const sign = async (bucket: string, p: string | null) => (p ? (await db.storage.from(bucket).createSignedUrl(p, 600)).data?.signedUrl ?? null : null);
    return {
      stops: (stops ?? []).map((s) => ({ ...s, distanceFromTaylorM: haversineM(TAYLOR_HALL, s) })),
      refs: await Promise.all((refs ?? []).map(async (r) => ({ id: r.id, stopId: r.stop_id, url: await sign("references", r.storage_path) }))),
      reviews: await Promise.all((reviews ?? []).map(async (r) => ({ id: r.id, stopId: r.stop_id, createdAt: r.created_at, reason: r.reason, distanceM: r.distance_m, accuracyM: r.accuracy_m, url: await sign("captures", r.storage_path) }))),
    };
  });

export const setStopPoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ stopId: z.enum(["elc", "carnegie"]), lat: z.number().min(40.9).max(41.0), lng: z.number().min(-76.95).max(-76.85), radius: z.number().min(15).max(60), source: z.enum(["gps", "manual"]), accuracy: z.number().nullable() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await requireOrganizer(context as Ctx);
    const { data: stop } = await db.from("stops").select("step").eq("id", data.stopId).single();
    if (stop?.step === 1) {
      const v = validateFirstStopPoint(data);
      if (!v.ok) throw new Error(`Refused: this point is ${v.distanceM.toFixed(1)} m from Taylor Hall; the first gem must be within 152.4 m (500 ft).`);
    }
    const provenance = data.source === "gps"
      ? `Organizer on-site GPS calibration (±${Math.round(data.accuracy ?? 0)} m reported accuracy) on ${new Date().toISOString().slice(0, 10)}.`
      : `Organizer-entered manual coordinates on ${new Date().toISOString().slice(0, 10)}.`;
    const { error } = await db.from("stops").update({ lat: data.lat, lng: data.lng, radius_m: data.radius, calibrated: true, provenance, calibrated_at: new Date().toISOString(), calibrated_by: context.userId }).eq("id", data.stopId);
    if (error) throw new Error(error.message);
    return { ok: true, distanceFromTaylorM: haversineM(TAYLOR_HALL, data) };
  });

export const uploadReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ stopId: z.enum(["elc", "carnegie"]), image: z.string().max(5_000_000) }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await requireOrganizer(context as Ctx);
    const m = data.image.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw new Error("Upload a JPEG.");
    const bin = Uint8Array.from(atob(m[1]!), (c) => c.charCodeAt(0));
    if (bin[0] !== 0xff || bin[1] !== 0xd8 || bin.length > 3 * 1024 * 1024) throw new Error("Invalid image.");
    const { count } = await db.from("reference_photos").select("id", { count: "exact", head: true }).eq("stop_id", data.stopId);
    if ((count ?? 0) >= 3) throw new Error("Maximum 3 reference photos per stop. Delete one first.");
    const path = `${data.stopId}/${crypto.randomUUID()}.jpg`;
    const up = await db.storage.from("references").upload(path, bin, { contentType: "image/jpeg" });
    if (up.error) throw new Error(up.error.message);
    await db.from("reference_photos").insert({ stop_id: data.stopId, storage_path: path, created_by: context.userId });
    return { ok: true };
  });

export const deleteReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await requireOrganizer(context as Ctx);
    const { data: r } = await db.from("reference_photos").select("*").eq("id", data.id).single();
    if (r) {
      await db.storage.from("references").remove([r.storage_path]);
      await db.from("reference_photos").delete().eq("id", r.id);
    }
    return { ok: true };
  });

export const decideReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ captureId: z.string().uuid(), approve: z.boolean(), reason: z.string().trim().min(3).max(300) }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await requireOrganizer(context as Ctx);
    const { data: c } = await db.from("captures").select("*").eq("id", data.captureId).single();
    if (!c || c.status !== "pending_review") throw new Error("This review is no longer pending.");
    await db.from("captures").update({ review_reason: `${data.approve ? "Approved" : "Not approved"} by organizer: ${data.reason}`, reviewed_by: context.userId, reviewed_at: new Date().toISOString(), status: data.approve ? "pending_review" : "review_rejected", photo_passed: data.approve }).eq("id", c.id);
    if (data.approve) {
      const { data: ok } = await db.rpc("accept_capture", { p_capture: c.id });
      if (!ok) {
        await db.from("captures").update({ status: "review_rejected", review_reason: "Player had already moved past this stop." }).eq("id", c.id);
        return { ok: false };
      }
    }
    return { ok: true };
  });
