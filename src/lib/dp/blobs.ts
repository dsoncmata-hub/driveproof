/**
 * Armazenamento das imagens originais em IndexedDB.
 * O arquivo original nunca é reescrito: só há gravação na criação e
 * remoção explícita junto com a evidência.
 */

import { canReadLegacy, localScope } from "./accountScope";
const DB_NAME = "driveproof";
const STORE = "evidence-blobs";

let dbPromise: Promise<IDBDatabase> | null = null;
const blobListeners = new Set<(id: string) => void>();
const urlCache = new Map<string, string>();
if (typeof window !== "undefined")
  window.addEventListener("carvrum:scope-change", () => {
    for (const url of urlCache.values()) URL.revokeObjectURL(url);
    urlCache.clear();
  });
export function subscribeBlobs(listener: (id: string) => void) {
  blobListeners.add(listener);
  return () => {
    blobListeners.delete(listener);
  };
}
function changed(id: string) {
  const key = localScope() + ":" + id;
  const url = urlCache.get(key);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(key);
  blobListeners.forEach((listener) => listener(id));
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB indisponível"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
      req.onblocked = () => {
        dbPromise = null;
        reject(new Error("Armazenamento bloqueado por outra aba."));
      };
    });
  }
  return dbPromise;
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  const scope = localScope();
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, scope + ":" + id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Gravação de foto interrompida."));
  });
  changed(id);
}

export async function bindGuestBlobs(userId: string, ids: string[]) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? Error("Importação de fotos interrompida."));
  });
  for (const id of ids) {
    const request = tx.objectStore(STORE).get("guest:" + id);
    request.onsuccess = () => {
      if (request.result) {
        const original = request.result;
        const existing = tx.objectStore(STORE).get(userId + ":" + id);
        existing.onsuccess = () => {
          if (!existing.result) tx.objectStore(STORE).put(original, userId + ":" + id);
        };
      }
    };
  }
  await done;
}

export async function getBlob(id: string): Promise<Blob | null> {
  const scope = localScope(),
    legacyAllowed = canReadLegacy();
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(scope + ":" + id);
    req.onsuccess = () => {
      if (scope !== localScope()) {
        resolve(null);
        return;
      }
      if (req.result || !legacyAllowed) resolve(req.result ?? null);
      else {
        const old = tx.objectStore(STORE).get(id);
        old.onsuccess = () => resolve(scope === localScope() ? (old.result ?? null) : null);
        old.onerror = () => reject(old.error);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteBlob(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(localScope() + ":" + id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Remoção de foto interrompida."));
  });
  changed(id);
}

export async function getBlobUrl(id: string): Promise<string | null> {
  const scope = localScope(),
    key = scope + ":" + id;
  const cached = urlCache.get(key);
  if (cached) return cached;
  const blob = await getBlob(id);
  if (!blob || scope !== localScope()) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

/** Quarantine and replacement commit together; no invalid bytes are silently destroyed. */
export async function replaceBlobWithArchive(id: string, expected: Blob, replacement: Blob) {
  const scope = localScope(),
    db = await openDb(),
    tx = db.transaction(STORE, "readwrite");
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? Error("Reparo de foto interrompido."));
  });
  const store = tx.objectStore(STORE);
  const req = store.get(scope + ":" + id);
  req.onsuccess = () => {
    if (scope !== localScope()) {
      tx.abort();
      return;
    }
    const current = req.result as Blob | undefined;
    // Actual content is rechecked before opening this transaction. Preserve whichever bytes are current.
    store.put(current ?? expected, scope + ":quarantine:" + id + ":" + Date.now());
    store.put(replacement, scope + ":" + id);
  };
  await done;
  changed(id);
}

export async function deleteAccountBlobs(scope: string, legacyIds: string[] = []) {
  const db = await openDb(),
    tx = db.transaction(STORE, "readwrite");
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? Error("Limpeza local interrompida."));
  });
  tx.objectStore(STORE).delete(IDBKeyRange.bound(scope + ":", scope + ":\uffff"));
  for (const id of legacyIds) tx.objectStore(STORE).delete(id);
  await done;
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}

export async function quarantinedBlobs(id: string): Promise<{ key: string; blob: Blob }[]> {
  const scope = localScope(),
    db = await openDb(),
    prefix = scope + ":quarantine:" + id + ":";
  return new Promise((resolve, reject) => {
    const result: { key: string; blob: Blob }[] = [],
      tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).openCursor(IDBKeyRange.bound(prefix, prefix + "\uffff"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        result.push({ key: String(cursor.key), blob: cursor.value });
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve(scope === localScope() ? result : []);
    tx.onerror = () => reject(tx.error);
  });
}
