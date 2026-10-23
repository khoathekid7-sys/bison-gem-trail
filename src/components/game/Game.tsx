import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Camera, Compass, Gem, Images, Lightbulb, Navigation, RefreshCw, Download, Share2, RotateCcw, Check, X, MapPin } from "lucide-react";
import bison from "@/assets/bison.png";
import { useGame, type Game as G } from "./useGame";
import { CameraSheet } from "./CameraSheet";
import { SchematicMap } from "./SchematicMap";
import type { MapStop } from "./types";
import { STOPS, TOTAL_XP, stopById } from "@/lib/content";
import { feet } from "@/lib/geo";
import { downloadBlob } from "@/lib/image";
import { makeZip } from "@/lib/zip";

const GameMap = lazy(() => import("./GameMap"));
type Tab = "explore" | "gems" | "album";

export function Game() {
  const g = useGame();
  const [tab, setTab] = useState<Tab>("explore");
  const mapStops: MapStop[] = useMemo(() => g.stops.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, radius: s.radius, label: s.place, gemImg: s.gemImg, state: s.step < g.currentStep ? "done" : s.step === g.currentStep ? "active" : "locked" })), [g.stops, g.currentStep]);
  const xp = STOPS.filter((s) => s.step < g.currentStep).reduce((a, s) => a + s.xp, 0);

  return (
    <main className="fixed inset-0 overflow-hidden bg-mint">
      <div className="absolute inset-0 lg:right-[420px]">
        <ClientOnly fallback={<SchematicMap stops={mapStops} fix={null} />}>
          <Suspense fallback={<SchematicMap stops={mapStops} fix={null} />}>
            <GameMap stops={mapStops} fix={g.fix} focusId={g.active?.id} />
          </Suspense>
        </ClientOnly>
      </div>

      {/* HUD */}
      <header className="pt-safe pointer-events-none absolute inset-x-0 top-0 z-20 px-3 lg:right-[420px]">
        {g.mode === "demo" && <p role="status" className="pointer-events-auto mb-2 rounded-full bg-demo px-4 py-2 text-center text-sm font-extrabold text-demo-foreground shadow-float">Demo — simulated checks</p>}
        <div className="flex items-center justify-between gap-2">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-card/95 py-1 pl-1 pr-4 shadow-float">
            <img src={bison} alt="" width={40} height={40} className="h-10 w-10 rounded-full bg-mint" />
            <div><p className="font-display text-base leading-none">Bison Quest</p><p className="text-xs font-bold text-muted-foreground">{xp} / {TOTAL_XP} XP</p></div>
          </div>
          <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-card/95 px-3 py-2 shadow-float" aria-label={`${Math.min(g.currentStep - 1, 2)} of 2 gems collected`}>
            {STOPS.map((s) => <img key={s.id} src={s.gemImg} alt="" className={`h-7 w-7 ${s.step < g.currentStep ? "" : "opacity-30 grayscale"}`} />)}
            <span className="ml-1 font-display">{Math.min(g.currentStep - 1, 2)}/2</span>
          </div>
        </div>
        {!g.online && <p className="pointer-events-auto mt-2 rounded-full bg-secondary px-4 py-2 text-center text-sm font-bold text-secondary-foreground">Offline — live photo checks need internet. Drafts are saved.</p>}
      </header>

      {/* Panel: bottom sheet on phones, side panel on desktop */}
      <section className="shadow-sheet absolute inset-x-0 bottom-0 z-30 flex max-h-[72dvh] flex-col rounded-t-3xl bg-card lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[420px] lg:rounded-none">
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-border lg:hidden" aria-hidden />
        <div className="flex-1 overflow-y-auto px-4 pb-3 pt-3 lg:pt-6">
          {tab === "explore" && <Explore g={g} />}
          {tab === "gems" && <Gems g={g} />}
          {tab === "album" && <Album g={g} />}
        </div>
        <nav className="pb-safe grid grid-cols-3 border-t px-2 pt-1" aria-label="Main">
          {([["explore", "Explore", Compass], ["gems", "Gems", Gem], ["album", "Album", Images]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined} className={`flex min-h-12 flex-col items-center justify-center rounded-2xl text-xs font-extrabold ${tab === id ? "text-primary" : "text-muted-foreground"}`}>
              <Icon className="h-5 w-5" />{label}
            </button>
          ))}
        </nav>
      </section>

      {g.hydrated && !g.mode && <Welcome g={g} />}
      {g.phase === "camera" && g.active && <CameraSheet demo={g.mode === "demo"} stopId={g.active.id} onClose={() => g.setPhase(g.draft ? "preview" : "idle")} onImage={(b, s) => g.acceptImage(b, s)} />}
      {(g.phase === "preview" || g.phase === "verifying" || g.phase === "result") && g.draft && <Preview g={g} />}
      {g.phase === "discovery" && g.lastWon && <Discovery g={g} onAlbum={() => setTab("album")} />}
    </main>
  );
}

function Welcome({ g }: { g: G }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-navy/55 p-3 backdrop-blur-sm sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="pb-safe w-full max-w-md rounded-3xl bg-card p-6 text-center shadow-float">
        <img src={bison} alt="Bison explorer mascot" width={140} height={140} className="animate-pop mx-auto -mt-20 h-36 w-36" />
        <h1 id="welcome-title" className="font-display text-3xl leading-tight">Two hidden gems.<br />One campus. Your story.</h1>
        <p className="mt-3 text-sm text-muted-foreground">Solve a clue, walk to the spot on Bucknell’s campus, snap a photo. We check your location and photo, then unlock the next gem.</p>
        <div className="mt-5 space-y-2">
          <button autoFocus onClick={() => g.start("live")} className="h-14 w-full rounded-full bg-capture font-display text-xl text-primary-foreground shadow-float active:scale-95">Start exploring</button>
          <button onClick={() => g.start("demo")} className="h-12 w-full rounded-full bg-muted font-bold">Try demo (off campus)</button>
        </div>
        {g.error && <p role="alert" className="mt-3 text-sm font-bold text-destructive">{g.error}</p>}
        <p className="mt-4 text-xs text-muted-foreground">Location is asked when you start; camera only when you capture. Submitted photos are sent to an AI service to check the landmark — no facial recognition. Your album stays private. <a className="underline" href="/organizer">Organizers</a></p>
      </div>
    </div>
  );
}

function Explore({ g }: { g: G }) {
  if (!g.mode) return <p className="text-sm text-muted-foreground">Start exploring to see your first clue.</p>;
  if (g.completed) return (
    <div className="text-center"><h2 className="font-display text-2xl">Quest complete! 🦬</h2><p className="text-sm text-muted-foreground">Both gems collected — {TOTAL_XP} XP. Open your Album to download your story.</p><ResetBtn g={g} /></div>
  );
  const s = g.active!;
  const nHints = g.hints[s.id] ?? 0;
  const canCapture = g.loc?.ok === true;
  const pending = g.server?.captures.find((c) => c.stopId === s.id && c.status === "pending_review");
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <img src={s.gemImg} alt="" className="h-12 w-12" />
        <div><p className="text-xs font-extrabold uppercase tracking-wide text-primary">Gem {s.step} of 2 · {s.xp} XP</p><h2 className="font-display text-xl leading-tight">{s.gemName}</h2></div>
      </div>
      <p className="rounded-2xl bg-muted p-3 text-[15px] font-semibold leading-snug">“{s.clue}”</p>
      {nHints > 0 && <ol className="space-y-1 text-sm">{s.hints.slice(0, nHints).map((h, i) => <li key={i} className="flex gap-2"><Lightbulb className="h-4 w-4 shrink-0 text-primary" />{h}</li>)}</ol>}
      <div className="flex flex-wrap gap-2">
        {nHints < s.hints.length && <button onClick={g.revealHint} className="flex h-11 items-center gap-1 rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground"><Lightbulb className="h-4 w-4" />Hint {nHints + 1}/3</button>}
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=walking`} target="_blank" rel="noreferrer" className="flex h-11 items-center gap-1 rounded-full bg-muted px-4 text-sm font-bold"><Navigation className="h-4 w-4" />Walking directions</a>
      </div>
      <GpsLine g={g} />
      {pending && <p className="rounded-2xl bg-muted p-3 text-sm font-bold">An organizer is reviewing your photo for this stop (pending).</p>}
      <button onClick={() => g.setPhase(g.draft ? "preview" : "camera")} disabled={!canCapture} className="flex h-16 w-full items-center justify-center gap-2 rounded-full bg-capture font-display text-xl text-primary-foreground shadow-float transition active:scale-95 disabled:bg-none disabled:bg-muted disabled:text-muted-foreground">
        <Camera className="h-6 w-6" />{canCapture ? (g.draft ? "Review saved photo" : "Capture") : "Get closer to capture"}
      </button>
      <p className="text-xs text-muted-foreground">Photo goal: {s.photoGoal} {s.challenge}</p>
      {g.mode === "live" && !s.calibrated && <p className="text-xs text-muted-foreground">Note: this spot uses Bucknell’s published building pin; on-site field calibration is still pending.</p>}
      {g.error && g.phase === "idle" && <p role="alert" className="text-sm font-bold text-destructive">{g.error}</p>}
    </div>
  );
}

function GpsLine({ g }: { g: G }) {
  if (g.mode === "demo") return (
    <div className="rounded-2xl border border-dashed border-demo p-3 text-sm">
      <p className="font-bold">Simulated GPS: {g.distanceM != null ? `${feet(g.distanceM)} ft away` : "—"} · ±{Math.round(g.fix?.accuracy ?? 0)} m · {g.fixAgeS}s old</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={() => g.demoMove("stop")} className="h-11 rounded-full bg-demo px-4 font-bold text-demo-foreground"><MapPin className="mr-1 inline h-4 w-4" />Walk here</button>
        <button onClick={() => g.demoMove("error")} className="h-11 rounded-full bg-muted px-4 font-bold">GPS error case</button>
      </div>
      {g.loc && !g.loc.ok && <p className="mt-2 text-xs">{g.loc.message}</p>}
    </div>
  );
  if (g.gps === "denied" || g.gps === "unavailable") return (
    <div role="alert" className="rounded-2xl bg-muted p-3 text-sm"><p className="font-bold">{g.gps === "denied" ? "Location is blocked." : "Can’t get your location."}</p><p>Allow location for this site in browser settings (iPhone: Settings › Safari › Location). The clue and map still work.</p><button onClick={g.startGps} className="mt-2 h-11 rounded-full bg-secondary px-4 font-bold text-secondary-foreground">Retry</button></div>
  );
  return (
    <div className="flex items-center justify-between rounded-2xl bg-muted p-3 text-sm">
      <div aria-live="polite">
        <p className="font-bold">{g.distanceM != null ? `${feet(g.distanceM)} ft away (straight line)` : "Finding you…"}</p>
        <p className="text-xs text-muted-foreground">{g.fix ? `GPS ±${Math.round(g.fix.accuracy)} m · ${g.fixAgeS}s ago` : "Waiting for GPS"}{g.loc && !g.loc.ok ? ` · ${g.loc.message}` : g.loc?.ok ? " · In range!" : ""}</p>
      </div>
      <button onClick={g.startGps} aria-label="Refresh GPS" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-card"><RefreshCw className="h-4 w-4" /></button>
    </div>
  );
}

function Preview({ g }: { g: G }) {
  const v = g.phase === "result" ? g.verdict : null;
  const ok = v?.locationPassed && v?.photoPassed;
  const [reviewSent, setReviewSent] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-navy/90 p-3 backdrop-blur" role="dialog" aria-modal="true" aria-label="Photo check">
      <div className="pt-safe relative mx-auto w-full max-w-md flex-1 overflow-hidden rounded-3xl">
        <img src={g.draft!.url} alt="Your captured photo" className="h-full w-full object-cover" />
        {ok && <Confetti />}
      </div>
      <div className="pb-safe mx-auto mt-3 w-full max-w-md space-y-3 rounded-3xl bg-card p-4">
        {g.phase === "verifying" && <p role="status" className="text-center font-display text-lg">Checking location and photo…</p>}
        {v && (
          <div aria-live="polite" className="space-y-2">
            <Row ok={v.locationPassed} label={v.locationPassed ? "Location checked" : "Location not verified"} />
            <Row ok={v.photoPassed} label={v.photoChecked === false ? "Photo not checked yet" : v.photoPassed ? "Photo matched" : "Photo did not match"} />
            <p className="text-sm">{v.reason}</p>
            {v.retryTip && <p className="text-sm text-muted-foreground">Tip: {v.retryTip}</p>}
            {g.mode === "live" && v.photoChecked && v.referenceBased === false && <p className="text-xs text-muted-foreground">Checked against a written landmark description (no organizer reference photos yet), so matching is approximate.</p>}
          </div>
        )}
        {g.error && <p role="alert" className="text-sm font-bold text-destructive">{g.error}</p>}
        {ok ? (
          <button autoFocus onClick={g.continueAfterResult} className="h-14 w-full rounded-full bg-capture font-display text-xl text-primary-foreground">Continue</button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={async () => { await g.discardDraft(); g.setPhase("camera"); }} disabled={g.phase === "verifying"} className="h-12 rounded-full bg-muted font-bold">Retake</button>
            <button onClick={g.submit} disabled={g.phase === "verifying"} className="h-12 rounded-full bg-capture font-bold text-primary-foreground disabled:opacity-50">{v || g.error ? "Retry check" : "Submit photo"}</button>
            {v?.serviceError && v.captureId && !reviewSent && <button onClick={async () => { if (await g.askReview(v.captureId!)) setReviewSent(true); }} className="col-span-2 h-11 rounded-full border font-bold">Ask an organizer to review</button>}
            {reviewSent && <p className="col-span-2 text-sm">Sent for review — marked pending. No gem is awarded until an organizer approves.</p>}
            <button onClick={() => g.setPhase("idle")} className="col-span-2 h-11 text-sm font-bold text-muted-foreground">Back to map (photo stays saved)</button>
          </div>
        )}
      </div>
    </div>
  );
}
const Row = ({ ok, label }: { ok: boolean; label: string }) => (
  <p className={`flex items-center gap-2 font-bold ${ok ? "text-success" : "text-destructive"}`}>{ok ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}{label}</p>
);

function Confetti() {
  const colors = ["var(--amber)", "var(--cyan)", "var(--sapphire)", "var(--mint)"];
  return <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">{Array.from({ length: 24 }, (_, i) => <span key={i} className="bq-confetti" style={{ background: colors[i % 4], ["--dx" as string]: `${Math.cos(i) * 180}px`, ["--dy" as string]: `${Math.sin(i * 1.7) * 220}px` }} />)}</div>;
}

function Discovery({ g, onAlbum }: { g: G; onAlbum: () => void }) {
  const s = g.lastWon!;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy/70 p-4 backdrop-blur" role="dialog" aria-modal="true" aria-labelledby="disc-title">
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 text-center shadow-float">
        <img src={s.gemImg} alt={`${s.gemName} gem`} className="animate-pop mx-auto h-28 w-28" />
        <p className="text-sm font-extrabold text-primary">+{s.xp} XP · {g.mode === "demo" ? "Demo gem (simulated)" : "Gem collected"}</p>
        <h2 id="disc-title" className="font-display text-2xl">{s.discovery.title}</h2>
        <p className="mt-2 text-sm">{s.discovery.body}</p>
        <a href={s.discovery.source} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-bold underline">Source: {s.discovery.sourceLabel}</a>
        <button autoFocus onClick={() => { g.setPhase("idle"); if (g.completed) onAlbum(); }} className="mt-4 h-14 w-full rounded-full bg-capture font-display text-xl text-primary-foreground">{g.completed ? "See my album" : "Next clue"}</button>
      </div>
    </div>
  );
}

function Gems({ g }: { g: G }) {
  return (
    <div className="space-y-3">
      <h2 className="font-display text-2xl">Gem collection</h2>
      {STOPS.map((s) => {
        const got = s.step < g.currentStep;
        const pending = g.server?.captures.find((c) => c.stopId === s.id && (c.status === "pending_review" || c.status === "review_rejected"));
        return (
          <div key={s.id} className="flex items-center gap-3 rounded-3xl bg-muted p-3">
            <img src={s.gemImg} alt="" className={`h-16 w-16 ${got ? "animate-pop" : "opacity-30 grayscale"}`} />
            <div className="flex-1"><p className="font-display text-lg">{got || s.step === g.currentStep ? s.gemName : "Locked gem"}</p><p className="text-sm text-muted-foreground">{got ? `${s.place} · ${s.xp} XP${g.mode === "demo" ? " · demo" : ""}` : s.step === g.currentStep ? "Current clue" : "Collect the previous gem first"}</p>{pending && <p className="text-xs font-bold">{pending.status === "pending_review" ? "Review pending" : pending.reason}</p>}</div>
          </div>
        );
      })}
    </div>
  );
}

function Album({ g }: { g: G }) {
  const list = STOPS.filter((s) => g.photos[s.id]);
  const share = async (b: Blob, name: string) => {
    const f = new File([b], name, { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], title: "Bison Quest" }); return; } catch { return; } }
    downloadBlob(b, name);
  };
  const zip = async () => {
    const files = await Promise.all(list.map(async (s, i) => ({ name: `bison-quest-${i + 1}-${s.id}.jpg`, data: new Uint8Array(await g.photos[s.id]!.blob.arrayBuffer()) })));
    downloadBlob(new Blob([makeZip(files) as BlobPart], { type: "application/zip" }), "bison-quest-album.zip");
  };
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between"><h2 className="font-display text-2xl">My album</h2><p className="text-sm font-bold">{list.length}/2 · {list.reduce((a, s) => a + s.xp, 0)} XP</p></div>
      {g.completed && <p className="rotate-[-2deg] rounded-2xl border-4 border-dashed border-primary p-2 text-center font-display text-lg text-primary">{g.mode === "demo" ? "DEMO COMPLETE · simulated" : `QUEST COMPLETE · ${TOTAL_XP} XP`}</p>}
      {list.length === 0 && <p className="rounded-2xl bg-muted p-4 text-sm">No photos yet. Your accepted captures appear here — private to this device.</p>}
      {list.map((s) => <AlbumPhoto key={s.id} stop={s} photo={g.photos[s.id]!} share={share} />)}
      {list.length > 0 && <button onClick={zip} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-secondary font-bold text-secondary-foreground"><Download className="h-4 w-4" />Download album (ZIP)</button>}
      {g.mode && <ResetBtn g={g} />}
    </div>
  );
}

function AlbumPhoto({ stop, photo, share }: { stop: (typeof STOPS)[number]; photo: NonNullable<G["photos"][string]>; share: (blob: Blob, name: string) => Promise<void> }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo.blob]);
  const name = `bison-quest-${stop.id}.jpg`;
  return <figure className="overflow-hidden rounded-3xl bg-muted">
    {url && <img src={url} alt={`Your photo at ${stop.place}`} className="w-full" />}
    <figcaption className="flex items-center gap-2 p-3"><img src={stop.gemImg} alt="" className="h-8 w-8" /><div className="flex-1"><p className="font-bold">{stop.gemName}</p><p className="text-xs text-muted-foreground">{stop.place} · {new Date(photo.takenAt).toLocaleString()}</p></div>
      <button onClick={() => downloadBlob(photo.blob, name)} aria-label={`Download ${stop.gemName} photo`} className="grid h-11 w-11 place-items-center rounded-full bg-card"><Download className="h-4 w-4" /></button>
      <button onClick={() => void share(photo.blob, name)} aria-label={`Share ${stop.gemName} photo`} className="grid h-11 w-11 place-items-center rounded-full bg-card"><Share2 className="h-4 w-4" /></button>
    </figcaption>
  </figure>;
}

function ResetBtn({ g }: { g: G }) {
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} className="mt-2 flex h-11 items-center gap-1 text-sm font-bold text-muted-foreground"><RotateCcw className="h-4 w-4" />Reset {g.mode === "demo" ? "demo" : "hunt"}…</button>;
  return (
    <div role="alertdialog" aria-label="Confirm reset" className="mt-2 space-y-2 rounded-2xl border p-3 text-left text-sm">
      <p className="font-bold">Restart the {g.mode === "demo" ? "demo" : "hunt"} from gem 1?</p>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={del} onChange={(e) => setDel(e.target.checked)} className="h-5 w-5" />Also delete my saved photos from this device</label>
      <div className="flex gap-2"><button onClick={() => setOpen(false)} className="h-11 flex-1 rounded-full bg-muted font-bold">Cancel</button><button onClick={() => { void g.reset(del); setOpen(false); }} className="h-11 flex-1 rounded-full bg-destructive font-bold text-destructive-foreground">Reset</button></div>
      <button onClick={g.exitToWelcome} className="h-11 w-full text-xs font-bold text-muted-foreground">Switch between live and demo</button>
    </div>
  );
}

export { stopById };
