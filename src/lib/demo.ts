// Deterministic, clearly-simulated validation for the off-campus demo.
import { checkLocation, type Fix } from "./geo";

export type Verdict = {
  locationPassed: boolean;
  photoPassed: boolean;
  photoChecked: boolean;
  confidence: number;
  reason: string;
  retryTip: string;
};

export type DemoSample = "correct" | "wrong" | "own";

export function demoVerify(
  sample: DemoSample,
  fix: Fix,
  stop: { lat: number; lng: number; radius_m: number },
  now: number,
): Verdict {
  const loc = checkLocation(fix, stop, now);
  if (!loc.ok)
    return { locationPassed: false, photoPassed: false, photoChecked: false, confidence: 0, reason: loc.message, retryTip: "Simulated: tap “Walk here” to move the demo GPS onto the spot." };
  if (sample === "wrong")
    return { locationPassed: true, photoPassed: false, photoChecked: true, confidence: 0.08, reason: "Simulated: this looks like an indoor desk, not the landmark.", retryTip: "Frame the landmark itself, outdoors, wide enough to recognize." };
  return { locationPassed: true, photoPassed: true, photoChecked: true, confidence: 0.9, reason: "Simulated match — demo checks never use the real AI service.", retryTip: "" };
}

/** Pure progression rule: only the current step can advance, and only when both checks pass. */
export function advance(currentStep: number, captureStep: number, v: Pick<Verdict, "locationPassed" | "photoPassed">) {
  if (captureStep !== currentStep) return currentStep;
  if (!v.locationPassed || !v.photoPassed) return currentStep;
  return currentStep + 1;
}
