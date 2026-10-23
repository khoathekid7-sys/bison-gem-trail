import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X, RefreshCw } from "lucide-react";
import sampleElc from "@/assets/sample-elc.jpg";
import sampleCarnegie from "@/assets/sample-carnegie.jpg";
import sampleWrong from "@/assets/sample-wrong.jpg";
import type { DemoSample } from "@/lib/demo";

export function CameraSheet({ demo, stopId, onClose, onImage }: { demo: boolean; stopId: string; onClose: () => void; onImage: (b: Blob, s?: DemoSample) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<"starting" | "live" | "denied" | "unsupported">("starting");
  const [flash, setFlash] = useState(false);

  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };

  const begin = async () => {
    stop();
    if (!navigator.mediaDevices?.getUserMedia) { setStatus("unsupported"); return; }
    setStatus("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      setStatus("live");
    } catch (e) {
      setStatus((e as DOMException).name === "NotAllowedError" ? "denied" : "unsupported");
    }
  };

  useEffect(() => {
    closeRef.current?.focus();
    void begin();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => { stop(); window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => { stop(); onClose(); };

  const shoot = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    setFlash(true);
    c.toBlob((b) => { if (b) { stop(); onImage(b); } }, "image/jpeg", 0.92);
  };

  const useSample = async (kind: "correct" | "wrong") => {
    const src = kind === "wrong" ? sampleWrong : stopId === "elc" ? sampleElc : sampleCarnegie;
    const b = await (await fetch(src)).blob();
    stop();
    onImage(b, kind);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-navy text-secondary-foreground" role="dialog" aria-modal="true" aria-label="Camera">
      <div className="pt-safe flex items-center justify-between px-4 pb-2">
        <button ref={closeRef} onClick={close} className="grid h-11 w-11 place-items-center rounded-full bg-card/15" aria-label="Close camera"><X /></button>
        <p className="font-display text-lg">Frame the landmark</p>
        <button onClick={begin} className="grid h-11 w-11 place-items-center rounded-full bg-card/15" aria-label="Restart camera"><RefreshCw className="h-5 w-5" /></button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={video} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" aria-label="Camera viewfinder" />
        {flash && <div className="animate-shutter absolute inset-0 bg-card" />}
        {status !== "live" && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div className="max-w-xs space-y-3">
              {status === "starting" && <p>Starting camera…</p>}
              {status === "denied" && <><p className="font-display text-xl">Camera access is off</p><p className="text-sm opacity-85">Allow camera for this site in your browser settings, then tap Retry — or choose a photo below.</p><button onClick={begin} className="h-11 rounded-full bg-card px-5 font-bold text-navy">Retry</button></>}
              {status === "unsupported" && <p className="text-sm opacity-85">Live camera isn’t available here. Use “Take or choose photo” below.</p>}
            </div>
          </div>
        )}
      </div>
      <div className="pb-safe space-y-3 px-4 pt-4">
        {demo && (
          <div className="flex gap-2" aria-label="Demo sample photos">
            <button onClick={() => useSample("correct")} className="h-11 flex-1 rounded-full bg-demo px-3 text-sm font-bold text-demo-foreground">Sample: right spot</button>
            <button onClick={() => useSample("wrong")} className="h-11 flex-1 rounded-full bg-card/15 px-3 text-sm font-bold">Sample: wrong photo</button>
          </div>
        )}
        <div className="flex items-center justify-between">
          <button onClick={() => fileRef.current?.click()} className="flex h-12 items-center gap-2 rounded-full bg-card/15 px-4 text-sm font-bold"><ImagePlus className="h-5 w-5" />Take or choose photo</button>
          <button onClick={shoot} disabled={status !== "live"} aria-label="Take photo" className="grid h-20 w-20 place-items-center rounded-full border-4 border-card bg-capture shadow-float transition active:scale-90 disabled:opacity-40">
            <Camera className="h-8 w-8" />
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Photo file" onChange={(e) => { const f = e.target.files?.[0]; if (f) { stop(); onImage(f); } e.target.value = ""; }} />
      </div>
    </div>
  );
}
