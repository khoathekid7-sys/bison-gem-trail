// Tiny IndexedDB key/value store for photos (accepted + drafts). Browser-only.
const DB = "bison-quest";
const STORE = "photos";

export type StoredPhoto = {
  key: string; // `${mode}:${kind}:${stopId}`
  blob: Blob;
  stopId: string;
  takenAt: number;
  caption?: string;
};

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "key" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
    t.onabort = () => rej(t.error);
  });
}

export const photoKey = (mode: string, kind: "accepted" | "draft", stopId: string) => `${mode}:${kind}:${stopId}`;

export async function putPhoto(p: StoredPhoto) {
  try {
    await tx("readwrite", (s) => s.put(p));
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === "QuotaExceededError") throw new Error("Your device storage is full. Free some space, then try again — your photo is still on screen.");
    throw e;
  }
}
export const getPhoto = (key: string) => tx<StoredPhoto | undefined>("readonly", (s) => s.get(key));
export const deletePhoto = (key: string) => tx("readwrite", (s) => s.delete(key));
export async function deleteByPrefix(prefix: string) {
  const keys = (await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys())) as string[];
  for (const k of keys) if (k.startsWith(prefix)) await deletePhoto(k);
}
