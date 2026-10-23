import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { STOPS, stopByStep, type StopContent } from "@/lib/content";
import { checkLocation, haversineM, DEFAULT_RADIUS_M, type Fix } from "@/lib/geo";
import { demoVerify, advance, type DemoSample, type Verdict } from "@/lib/demo";
import { getHuntState, startSession, verifyCapture, requestReview, type VerifyResponse } from "@/lib/hunt.functions";
import { blobToDataUrl, compressImage } from "@/lib/image";
import { deleteByPrefix, deletePhoto, getPhoto, photoKey, putPhoto, type StoredPhoto } from "@/lib/idb";

export type Mode = "live" | "demo";
export type Phase = "idle" | "camera" | "preview" | "verifying" | "result" | "discovery";
export type GpsStatus = "idle" | "requesting" | "ok" | "denied" | "unavailable";
type ServerState = Awaited<ReturnType<typeof getHuntState>>;
export type GameStop = StopContent & { lat: number; lng: number; radius: number; calibrated: boolean };

const LS_MODE = "bq.mode", LS_TOKEN = "bq.token", LS_DEMO = "bq.demo", LS_HINTS = "bq.hints";
const DEMO_START: Fix = { lat: 40.95735, lng: -76.88345, accuracy: 6, timestamp: 0 }; // near Taylor Hall (simulated)

const newId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`).replace(/[^a-zA-Z0-9-]/g, "");

export function useGame() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [server, setServer] = useState<ServerState | null>(null);
  const [demoStep, setDemoStep] = useState(1);
  const [fix, setFix] = useState<Fix | null>(null);
  const [gps, setGps] = useState<GpsStatus>("idle");
  const [now, setNow] = useState(() => Date.now());
  const [phase, setPhase] = useState<Phase>("idle");
  const [draft, setDraft] = useState<{ album: Blob; upload: Blob; url: string; sample: DemoSample } | null>(null);
  const [verdict, setVerdict] = useState<(Verdict & Partial<VerifyResponse>) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hints, setHints] = useState<Record<string, number>>({});
  const [online, setOnline] = useState(true);
  const [photos, setPhotos] = useState<Record<string, StoredPhoto>>({});
  const [lastWon, setLastWon] = useState<StopContent | null>(null);
  const attemptRef = useRef<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const busy = useRef(false);

  const fStart = useServerFn(startSession);
  const fState = useServerFn(getHuntState);
  const fVerify = useServerFn(verifyCapture);
  const fReview = useServerFn(requestReview);

  // ---------- restore ----------
  useEffect(() => {
    const m = localStorage.getItem(LS_MODE) as Mode | null;
    setMode(m);
    setDemoStep(Number(JSON.parse(localStorage.getItem(LS_DEMO) ?? "{}").step ?? 1));
    setHints(JSON.parse(localStorage.getItem(LS_HINTS) ?? "{}"));
    setOnline(navigator.onLine);
    setHydrated(true);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(t); };
  }, []);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem(LS_TOKEN);
    if (!token) return null;
    try {
      const s = await fState({ data: { token } });
      setServer(s);
      return s;
    } catch (e) {
      if (String((e as Error).message).includes("SESSION_NOT_FOUND")) localStorage.removeItem(LS_TOKEN);
      return null;
    }
  }, [fState]);

  useEffect(() => { if (hydrated && mode === "live") void refresh(); }, [hydrated, mode, refresh]);

  const currentStep = mode === "demo" ? demoStep : server?.currentStep ?? 1;

  const stops: GameStop[] = useMemo(
    () =>
      STOPS.map((c) => {
        const s = mode === "live" ? server?.stops.find((x) => x.id === c.id) : undefined;
        return { ...c, lat: s?.lat ?? c.official.lat, lng: s?.lng ?? c.official.lng, radius: s?.radius_m ?? DEFAULT_RADIUS_M, calibrated: s?.calibrated ?? false };
      }),
    [mode, server],
  );
  const active = stops.find((s) => s.step === currentStep) ?? null;
  const completed = currentStep > STOPS.length;

  // ---------- photos ----------
  const loadPhotos = useCallback(async () => {
    if (!mode) return;
    const out: Record<string, StoredPhoto> = {};
    for (const s of STOPS) {
      try { const p = await getPhoto(photoKey(mode, "accepted", s.id)); if (p) out[s.id] = p; } catch { /* idb unavailable */ }
    }
    setPhotos(out);
  }, [mode]);
  useEffect(() => { void loadPhotos(); }, [loadPhotos, currentStep]);

  // restore saved draft for current stop
  useEffect(() => {
    if (!mode || !active || draft) return;
    getPhoto(photoKey(mode, "draft", active.id)).then((p) => {
      if (p) setDraft({ album: p.blob, upload: p.blob, url: URL.createObjectURL(p.blob), sample: "own" });
    }).catch(() => {});
  }, [mode, active, draft]);

  // ---------- GPS ----------
  const startGps = useCallback(() => {
    if (!("geolocation" in navigator)) { setGps("unavailable"); return; }
    setGps("requesting");
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => { setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp }); setGps("ok"); },
      (e) => setGps(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }, []);
  useEffect(() => () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current); }, []);
  useEffect(() => { if (hydrated && mode === "live" && gps === "idle") startGps(); }, [hydrated, mode, gps, startGps]);

  // demo GPS
  const demoMove = useCallback((where: "start" | "stop" | "error") => {
    const t = Date.now();
    if (where === "start") setFix({ ...DEMO_START, timestamp: t });
    else if (where === "error") setFix({ lat: (active?.lat ?? DEMO_START.lat) + 0.0002, lng: active?.lng ?? DEMO_START.lng, accuracy: 85, timestamp: t - 45000 });
    else if (active) setFix({ lat: active.lat + 0.00008, lng: active.lng, accuracy: 6, timestamp: t });
    setGps("ok");
  }, [active]);
  // keep demo fix "fresh" unless the error case is chosen
  useEffect(() => {
    if (mode !== "demo" || !fix || fix.accuracy > 40) return;
    if (now - fix.timestamp > 5000) setFix({ ...fix, timestamp: now });
  }, [mode, now, fix]);

  // ---------- mode ----------
  const start = useCallback(async (m: Mode) => {
    setError(null);
    if (m === "live") {
      if (!localStorage.getItem(LS_TOKEN)) {
        try { const { token } = await fStart(); localStorage.setItem(LS_TOKEN, token); }
        catch { setError("Couldn't reach the game server. Check your connection and try again."); return; }
      }
      localStorage.setItem(LS_MODE, "live");
      setMode("live");
      setFix(null);
      startGps();
      await refresh();
    } else {
      localStorage.setItem(LS_MODE, "demo");
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
      setMode("demo");
      setFix({ ...DEMO_START, timestamp: Date.now() });
      setGps("ok");
    }
    setDraft(null);
    setPhase("idle");
  }, [fStart, refresh, startGps]);

  const exitToWelcome = useCallback(() => { localStorage.removeItem(LS_MODE); setMode(null); setPhase("idle"); setDraft(null); }, []);

  // ---------- derived location status ----------
  const loc = active && fix ? checkLocation(fix, { lat: active.lat, lng: active.lng, radius_m: active.radius }, now) : null;
  const distanceM = active && fix ? haversineM(fix, active) : null;
  const fixAgeS = fix ? Math.max(0, Math.round((now - fix.timestamp) / 1000)) : null;

  // ---------- capture ----------
  const acceptImage = useCallback(async (blob: Blob, sample: DemoSample = "own") => {
    if (!mode || !active) return;
    setError(null);
    try {
      const album = await compressImage(blob, 2048, 0.88);
      const upload = await compressImage(blob, 1280, 0.8);
      if (draft) URL.revokeObjectURL(draft.url);
      setDraft({ album, upload, url: URL.createObjectURL(album), sample });
      attemptRef.current = null;
      setVerdict(null);
      setPhase("preview");
      await putPhoto({ key: photoKey(mode, "draft", active.id), blob: album, stopId: active.id, takenAt: Date.now() }).catch((e) => setError((e as Error).message));
    } catch (e) {
      setError((e as Error).message);
      setPhase("idle");
    }
  }, [mode, active, draft]);

  const discardDraft = useCallback(async () => {
    if (draft) URL.revokeObjectURL(draft.url);
    setDraft(null);
    setVerdict(null);
    attemptRef.current = null;
    if (mode && active) await deletePhoto(photoKey(mode, "draft", active.id)).catch(() => {});
  }, [draft, mode, active]);

  const onAccepted = useCallback(async (stop: StopContent) => {
    if (!mode || !draft) return;
    await putPhoto({ key: photoKey(mode, "accepted", stop.id), blob: draft.album, stopId: stop.id, takenAt: Date.now(), caption: `${stop.gemName} · ${stop.place}` })
      .catch((e) => setError(`Gem earned, but the photo couldn't be saved on this device: ${(e as Error).message}`));
    await deletePhoto(photoKey(mode, "draft", stop.id)).catch(() => {});
    setLastWon(stop);
    navigator.vibrate?.([30, 40, 80]);
    void loadPhotos();
  }, [mode, draft, loadPhotos]);

  const submit = useCallback(async () => {
    if (!mode || !active || !draft || busy.current) return;
    if (!fix) { setError("We need a location fix first. Allow location, or refresh GPS."); return; }
    busy.current = true;
    setError(null);
    setPhase("verifying");
    try {
      if (mode === "demo") {
        await new Promise((r) => setTimeout(r, 900));
        const v = demoVerify(draft.sample, fix, { lat: active.lat, lng: active.lng, radius_m: active.radius }, Date.now());
        setVerdict(v);
        const next = advance(demoStep, active.step, v);
        if (next !== demoStep) {
          await onAccepted(active);
          setDemoStep(next);
          localStorage.setItem(LS_DEMO, JSON.stringify({ step: next }));
        }
      } else {
        if (!navigator.onLine) throw new Error("OFFLINE");
        const token = localStorage.getItem(LS_TOKEN)!;
        attemptRef.current ??= newId();
        const image = await blobToDataUrl(draft.upload);
        const res = await Promise.race([
          fVerify({ data: { token, stopId: active.id as "elc" | "carnegie", attemptId: attemptRef.current, image, fix } }),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), 60000)),
        ]);
        setVerdict(res);
        if (!res.serviceError) attemptRef.current = null; // next submit is a new attempt
        if (res.locationPassed && res.photoPassed) await onAccepted(active);
        await refresh();
      }
      setPhase("result");
    } catch (e) {
      const msg = (e as Error).message;
      setError(
        msg === "OFFLINE" ? "You're offline. Live photo checking needs internet — your photo is saved, retry when you have signal."
        : msg === "TIMEOUT" ? "The check is taking too long. Your photo is saved — tap Retry."
        : msg.length < 160 ? msg : "Something went wrong. Your photo is saved — tap Retry.",
      );
      setPhase("preview");
    } finally {
      busy.current = false;
    }
  }, [mode, active, draft, fix, demoStep, fVerify, onAccepted, refresh]);

  const askReview = useCallback(async (captureId: string) => {
    const token = localStorage.getItem(LS_TOKEN);
    if (!token) return;
    try { await fReview({ data: { token, captureId } }); await refresh(); setError(null); return true; }
    catch (e) { setError((e as Error).message); return false; }
  }, [fReview, refresh]);

  const continueAfterResult = useCallback(() => {
    if (verdict?.locationPassed && verdict?.photoPassed) {
      if (draft) URL.revokeObjectURL(draft.url);
      setDraft(null);
      setPhase("discovery");
    } else setPhase("preview");
  }, [verdict, draft]);

  const revealHint = useCallback(() => {
    if (!active) return;
    const n = Math.min((hints[active.id] ?? 0) + 1, active.hints.length);
    const h = { ...hints, [active.id]: n };
    setHints(h);
    localStorage.setItem(LS_HINTS, JSON.stringify(h));
  }, [active, hints]);

  const reset = useCallback(async (deletePhotos: boolean) => {
    if (!mode) return;
    if (deletePhotos) await deleteByPrefix(`${mode}:`).catch(() => {});
    else await deleteByPrefix(`${mode}:draft:`).catch(() => {});
    if (mode === "demo") { localStorage.removeItem(LS_DEMO); setDemoStep(1); demoMove("start"); }
    else { localStorage.removeItem(LS_TOKEN); setServer(null); await start("live"); }
    setHints({}); localStorage.removeItem(LS_HINTS);
    setDraft(null); setPhase("idle"); setVerdict(null);
    void loadPhotos();
  }, [mode, demoMove, start, loadPhotos]);

  return {
    hydrated, mode, start, exitToWelcome, stops, active, currentStep, completed, server,
    fix, gps, startGps, demoMove, loc, distanceM, fixAgeS, online,
    phase, setPhase, draft, acceptImage, discardDraft, submit, verdict, continueAfterResult, askReview,
    error, setError, hints, revealHint, photos, lastWon, reset, stopByStep,
  };
}
export type Game = ReturnType<typeof useGame>;
