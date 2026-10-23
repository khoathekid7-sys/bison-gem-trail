import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Camera, Check, MapPin, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { amIOrganizer, claimOrganizer, decideReview, deleteReference, organizerOverview, setStopPoint, uploadReference } from "@/lib/organizer.functions";
import { feet, validateFirstStopPoint } from "@/lib/geo";
import { blobToDataUrl, compressImage } from "@/lib/image";

export const Route = createFileRoute("/organizer")({
  head: () => ({ meta: [{ title: "Organizer · Bison Quest" }, { name: "description", content: "Bison Quest organizer setup and reviews" }] }),
  component: Organizer,
});

type Overview = Awaited<ReturnType<typeof organizerOverview>>;
type Stop = Overview["stops"][number];
const field = "min-h-11 w-full rounded-xl border border-border bg-card px-3 text-foreground";
const primary = "min-h-11 rounded-full bg-primary px-5 font-bold text-primary-foreground disabled:opacity-50";

function Organizer() {
  const [user, setUser] = useState<string | null>(null);
  const [organizer, setOrganizer] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const fStatus = useServerFn(amIOrganizer);
  const fClaim = useServerFn(claimOrganizer);
  const fOverview = useServerFn(organizerOverview);
  const fSetPoint = useServerFn(setStopPoint);
  const fUpload = useServerFn(uploadReference);
  const fDelete = useServerFn(deleteReference);
  const fReview = useServerFn(decideReview);

  async function refresh() {
    setError(null);
    try { setOverview(await fOverview()); }
    catch (e) { setError((e as Error).message || "Could not load organizer data."); }
  }

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      setUser(data.user?.email ?? null);
      if (data.user) {
        try {
          const status = await fStatus();
          if (!alive) return;
          setOrganizer(status.organizer);
          if (status.organizer) setOverview(await fOverview());
        } catch (e) { if (alive) setError((e as Error).message); }
      } else { setOrganizer(false); setOverview(null); }
      if (alive) setLoading(false);
    };
    void check();
    const { data: listener } = supabase.auth.onAuthStateChange(() => { void check(); });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [fStatus, fOverview]);

  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true); setError(null); setMessage(null);
    try { await action(); setMessage(success); }
    catch (e) { setError((e as Error).message || "Something went wrong. Try again."); }
    finally { setBusy(false); }
  }

  async function signIn(create: boolean) {
    await run(async () => {
      const result = create ? await supabase.auth.signUp({ email: email.trim(), password }) : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (create && !result.data.session) setMessage("Check your email to confirm the account, then sign in.");
      else setUser(result.data.user?.email ?? null);
    }, create ? "Account created. Check your email if confirmation is required." : "Signed in.");
  }

  async function claim() {
    await run(async () => {
      const result = await fClaim();
      if (!result.organizer) throw new Error("Another organizer has already claimed this game. Ask them for access.");
      setOrganizer(true);
      setOverview(await fOverview());
    }, "Organizer access claimed.");
  }

  async function savePoint(stop: Stop, point: { lat: number; lng: number; radius: number; source: "gps" | "manual"; accuracy: number | null }) {
    await run(async () => {
      if (stop.step === 1 && !validateFirstStopPoint(point).ok) throw new Error("The ELC point must be within 500 ft of Taylor Hall.");
      await fSetPoint({ data: { stopId: stop.id as "elc" | "carnegie", ...point } });
      await refresh();
    }, `${stop.name} capture point saved.`);
  }

  async function addReference(stopId: string, file: File) {
    await run(async () => {
      const jpeg = await compressImage(file, 1280, 0.8);
      await fUpload({ data: { stopId: stopId as "elc" | "carnegie", image: await blobToDataUrl(jpeg) } });
      await refresh();
    }, "Reference photo uploaded.");
  }

  return (
    <main className="min-h-dvh bg-mint px-4 pb-safe pt-safe text-foreground">
      <div className="mx-auto max-w-4xl py-5">
        <a href="/" className="mb-4 inline-flex min-h-11 items-center gap-2 font-bold text-primary"><ArrowLeft className="h-5 w-5" />Back to game</a>
        <header className="mb-5 rounded-3xl bg-card p-5 shadow-float">
          <p className="text-xs font-extrabold uppercase tracking-wider text-primary">Bison Quest</p>
          <h1 className="font-display text-3xl">Organizer setup</h1>
          <p className="mt-2 text-sm text-muted-foreground">Calibrate the real capture spots, add landmark reference photos, and decide manual reviews. These controls require an organizer account.</p>
        </header>

        {error && <p role="alert" className="mb-4 rounded-2xl bg-destructive/10 p-3 font-bold text-destructive">{error}</p>}
        {message && <p role="status" className="mb-4 rounded-2xl bg-secondary p-3 font-bold text-secondary-foreground">{message}</p>}
        {loading ? <p role="status" className="rounded-2xl bg-card p-5">Checking sign-in…</p> : !user ? (
          <section className="max-w-lg rounded-3xl bg-card p-5 shadow-float" aria-label="Organizer sign-in">
            <h2 className="font-display text-xl">Sign in or create an account</h2>
            <p className="mb-4 text-sm text-muted-foreground">The first signed-in person to claim organizer access owns setup. If you are the owner, claim it promptly after publishing.</p>
            <form onSubmit={(e) => { e.preventDefault(); void signIn(false); }} className="space-y-3">
              <label className="block text-sm font-bold">Email<input className={`mt-1 ${field}`} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label className="block text-sm font-bold">Password<input className={`mt-1 ${field}`} type="password" autoComplete="current-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
              <div className="flex flex-wrap gap-2"><button className={primary} disabled={busy}>Sign in</button><button type="button" onClick={() => void signIn(true)} className="min-h-11 rounded-full bg-muted px-5 font-bold" disabled={busy}>Create account</button></div>
            </form>
          </section>
        ) : !organizer ? (
          <section className="max-w-lg rounded-3xl bg-card p-5 shadow-float">
            <h2 className="font-display text-xl">Claim organizer access</h2>
            <p className="my-3 text-sm">Signed in as <strong>{user}</strong>. The first account to claim becomes the organizer. Claims are checked on the server.</p>
            <div className="flex flex-wrap gap-2"><button onClick={() => void claim()} className={primary} disabled={busy}>Claim this game</button><button onClick={() => void supabase.auth.signOut()} className="min-h-11 rounded-full bg-muted px-5 font-bold">Sign out</button></div>
          </section>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-card p-3 text-sm"><p>Signed in as <strong>{user}</strong></p><div className="flex gap-2"><button onClick={() => void refresh()} className="flex min-h-11 items-center gap-1 px-3 font-bold"><RefreshCw className="h-4 w-4" />Refresh</button><button onClick={() => void supabase.auth.signOut()} className="min-h-11 px-3 font-bold">Sign out</button></div></div>
            {!overview ? <p role="status" className="rounded-2xl bg-card p-5">Loading organizer data…</p> : <>
              <div className="grid gap-5 md:grid-cols-2">{overview.stops.map((stop) => <StopCard key={stop.id} stop={stop} refs={overview.refs.filter((r) => r.stopId === stop.id)} busy={busy} save={(point) => savePoint(stop, point)} upload={(file) => addReference(stop.id, file)} remove={(id) => run(async () => { await fDelete({ data: { id } }); await refresh(); }, "Reference photo deleted.")} />)}</div>
              <section className="rounded-3xl bg-card p-5 shadow-float"><h2 className="font-display text-xl">Manual reviews</h2><p className="mb-4 text-sm text-muted-foreground">Only on-site photos sent after a checker outage appear here. Record a reason for every decision.</p>
                {overview.reviews.length === 0 ? <p className="rounded-2xl bg-muted p-4 text-sm">No reviews waiting.</p> : <div className="grid gap-4 md:grid-cols-2">{overview.reviews.map((review) => <ReviewCard key={review.id} review={review} busy={busy} decide={(approve, reason) => run(async () => { const result = await fReview({ data: { captureId: review.id, approve, reason } }); if (!result.ok) throw new Error("This player has already moved past the stop."); await refresh(); }, approve ? "Photo approved and gem awarded." : "Photo rejected.")} />)}</div>}
              </section>
            </>}
          </div>
        )}
      </div>
    </main>
  );
}

function StopCard({ stop, refs, busy, save, upload, remove }: { stop: Stop; refs: Overview["refs"]; busy: boolean; save: (point: { lat: number; lng: number; radius: number; source: "gps" | "manual"; accuracy: number | null }) => Promise<void>; upload: (file: File) => Promise<void>; remove: (id: string) => Promise<void> }) {
  const [lat, setLat] = useState(String(stop.lat));
  const [lng, setLng] = useState(String(stop.lng));
  const [radius, setRadius] = useState(String(stop.radius_m));
  const [gpsFix, setGpsFix] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const point = { lat: Number(lat), lng: Number(lng) };
  const distance = Number.isFinite(point.lat) && Number.isFinite(point.lng) ? validateFirstStopPoint(point) : null;

  function locate() {
    setGpsError(null);
    if (!navigator.geolocation) { setGpsError("Location is unavailable in this browser."); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      setGpsFix(fix); setLat(String(fix.lat)); setLng(String(fix.lng));
      if (fix.accuracy > 40) setGpsError(`GPS accuracy is ±${Math.round(fix.accuracy)} m. Move into open sky and try again before saving.`);
    }, (e) => setGpsError(e.message || "Location permission was denied."), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }

  return <section className="rounded-3xl bg-card p-5 shadow-float">
    <p className="text-xs font-extrabold uppercase tracking-wider text-primary">Gem {stop.step}</p><h2 className="font-display text-xl">{stop.name}</h2>
    <p className="mt-1 text-sm font-bold">{stop.calibrated ? "Capture point set" : "Field calibration needed"}</p>
    <p className="mb-4 text-xs text-muted-foreground">{stop.provenance}</p>
    <div className="grid grid-cols-2 gap-2"><label className="text-sm font-bold">Latitude<input className={`mt-1 ${field}`} inputMode="decimal" value={lat} onChange={(e) => { setLat(e.target.value); setGpsFix(null); }} /></label><label className="text-sm font-bold">Longitude<input className={`mt-1 ${field}`} inputMode="decimal" value={lng} onChange={(e) => { setLng(e.target.value); setGpsFix(null); }} /></label></div>
    <label className="mt-2 block text-sm font-bold">Arrival radius (meters, 15–60)<input className={`mt-1 ${field}`} type="number" min={15} max={60} value={radius} onChange={(e) => setRadius(e.target.value)} /></label>
    {stop.step === 1 && <p className={`mt-2 text-sm font-bold ${distance?.ok ? "text-success" : "text-destructive"}`}>{distance ? `${feet(distance.distanceM)} ft from Taylor Hall · ${distance.ok ? "within 500 ft" : "too far"}` : "Enter valid coordinates"}</p>}
    {gpsFix && <p className="mt-2 text-xs">Current GPS accuracy: ±{Math.round(gpsFix.accuracy)} m</p>}{gpsError && <p role="alert" className="mt-2 text-xs font-bold text-destructive">{gpsError}</p>}
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={locate} className="flex min-h-11 items-center gap-1 rounded-full bg-muted px-4 font-bold"><MapPin className="h-4 w-4" />Use my GPS</button><button type="button" onClick={() => void save({ ...point, radius: Number(radius), source: gpsFix ? "gps" : "manual", accuracy: gpsFix?.accuracy ?? null })} className={primary} disabled={busy || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Number(radius) < 15 || Number(radius) > 60 || (stop.step === 1 && !distance?.ok) || !!(gpsFix && gpsFix.accuracy > 40)}>Save point</button></div>
    <div className="mt-5 border-t pt-4"><h3 className="font-display text-lg">Reference photos ({refs.length}/3)</h3><p className="mb-2 text-xs text-muted-foreground">Use clear on-site images of the landmark. Photos are private and sent to the checker with player submissions.</p>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-muted px-4 font-bold"><Upload className="h-4 w-4" />Upload reference<input type="file" accept="image/*" className="sr-only" disabled={busy || refs.length >= 3} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} /></label>
      <div className="mt-3 grid grid-cols-3 gap-2">{refs.map((ref) => <div key={ref.id} className="relative">{ref.url && <img src={ref.url} alt={`${stop.name} reference`} className="aspect-square w-full rounded-xl object-cover" />}<button type="button" onClick={() => void remove(ref.id)} disabled={busy} aria-label="Delete reference photo" className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-full bg-card shadow"><Trash2 className="h-4 w-4" /></button></div>)}</div>
    </div>
  </section>;
}

function ReviewCard({ review, busy, decide }: { review: Overview["reviews"][number]; busy: boolean; decide: (approve: boolean, reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  return <article className="rounded-2xl border p-3"><p className="font-bold">{review.stopId === "elc" ? "ELC uphill patio" : "Carnegie Building"}</p><p className="text-xs text-muted-foreground">{new Date(review.createdAt).toLocaleString()} · {review.distanceM == null ? "Distance unavailable" : `${feet(review.distanceM)} ft away`} · GPS ±{Math.round(review.accuracyM ?? 0)} m</p>
    {review.url ? <img src={review.url} alt="Player photo awaiting review" className="my-3 max-h-72 w-full rounded-xl object-contain" /> : <p className="my-3 text-sm">Photo unavailable. Refresh before deciding.</p>}
    <p className="mb-2 text-sm">Checker result: {review.reason}</p><label className="block text-sm font-bold">Reason for decision<textarea className={`mt-1 min-h-20 py-2 ${field}`} maxLength={300} minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What in the photo supports your decision?" /></label>
    <div className="mt-2 flex gap-2"><button onClick={() => void decide(true, reason.trim())} disabled={busy || reason.trim().length < 3 || !review.url} className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full bg-capture px-2 font-bold text-primary-foreground disabled:opacity-50"><Check className="h-4 w-4" />Approve</button><button onClick={() => void decide(false, reason.trim())} disabled={busy || reason.trim().length < 3} className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full bg-destructive px-2 font-bold text-destructive-foreground disabled:opacity-50"><X className="h-4 w-4" />Reject</button></div>
  </article>;
}
