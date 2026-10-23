// Client image helpers: orientation-aware decode, bounded JPEG compression.
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", ""];

export async function compressImage(src: Blob, maxSide: number, quality: number): Promise<Blob> {
  if (src.size > MAX_INPUT_BYTES) throw new Error("That image is over 25 MB. Try a regular camera photo.");
  if (!OK_TYPES.includes(src.type)) throw new Error("Please choose a JPEG, PNG or WebP photo.");
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(src, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This photo format can't be read in your browser. Try taking it with the in-app camera.");
  }
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not process photo."))), "image/jpeg", quality),
  );
}

export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
