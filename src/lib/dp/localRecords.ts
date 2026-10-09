import type { DbShape } from "./store";

export const POINTS_PER_BLOCK = 500;
const DATABASE = "carvrum-records";
let opening: Promise<IDBDatabase> | undefined;
export type StoredRecords = { db: DbShape; revision: number; counts: Record<string, number> };

export function recordsDatabase() {
  if (!opening)
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        for (const store of ["snapshots", "tracks", "sync", "reviews", "track-cache"])
          if (!request.result.objectStoreNames.contains(store))
            request.result.createObjectStore(store);
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          opening = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => {
        opening = undefined;
        reject(request.error);
      };
      request.onblocked = () => {
        opening = undefined;
        reject(Error("Feche outras abas do CARVRUM para abrir o armazenamento."));
      };
    });
  return opening;
}

export const requestValue = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
export const transactionDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(tx.error ?? Error("Gravação interrompida; tente novamente."));
  });
const prefix = (scope: string, tripId: string) => scope + ":" + tripId + ":";

export async function loadRecords(scope: string): Promise<StoredRecords | null> {
  const idb = await recordsDatabase();
  const tx = idb.transaction(["snapshots", "tracks"], "readonly"),
    done = transactionDone(tx);
  const stored = await requestValue<StoredRecords | undefined>(
    tx.objectStore("snapshots").get(scope),
  );
  if (!stored) {
    await done;
    return null;
  }
  const requests = stored.db.trips.map(async (trip) => {
    const p = prefix(scope, trip.id);
    const blocks = await requestValue(
      tx.objectStore("tracks").getAll(IDBKeyRange.bound(p, p + "\uffff")),
    );
    const points = blocks.sort((a, b) => a.index - b.index).flatMap((block) => block.points);
    if (points.length !== stored.counts[trip.id])
      throw Error("Trajeto local incompleto. Os registros foram preservados.");
    return { ...trip, points };
  });
  const trips = await Promise.all(requests);
  await done;
  return { ...stored, db: { ...stored.db, trips } };
}

export async function recordsRevision(scope: string): Promise<number> {
  const idb = await recordsDatabase();
  const stored = await requestValue<StoredRecords | undefined>(
    idb.transaction("snapshots").objectStore("snapshots").get(scope),
  );
  return stored?.revision ?? 0;
}

/** A metadata revision and all changed track blocks commit in one transaction. */
export async function saveRecords(scope: string, next: DbShape, prior: StoredRecords | null) {
  const idb = await recordsDatabase();
  const tx = idb.transaction(["snapshots", "tracks"], "readwrite"),
    done = transactionDone(tx);
  // Attach immediately: a rejected transaction must never become unhandled.
  void done.catch(() => {});
  try {
    const current = await requestValue<StoredRecords | undefined>(
      tx.objectStore("snapshots").get(scope),
    );
    if ((current?.revision ?? 0) !== (prior?.revision ?? 0)) {
      tx.abort();
      await done.catch(() => {});
      throw Error("Os registros mudaram em outra aba. Atualize a tela antes de continuar.");
    }
    const tracks = tx.objectStore("tracks"),
      counts: Record<string, number> = {};
    for (const trip of next.trips) {
      const before = prior?.db.trips.find((t) => t.id === trip.id)?.points ?? [];
      counts[trip.id] = trip.points.length;
      if (before === trip.points) continue;
      let shared = 0;
      while (
        shared < before.length &&
        shared < trip.points.length &&
        before[shared] === trip.points[shared]
      )
        shared++;
      const firstChanged = Math.floor(shared / POINTS_PER_BLOCK);
      for (
        let index = firstChanged;
        index < Math.ceil(trip.points.length / POINTS_PER_BLOCK);
        index++
      ) {
        tracks.put(
          {
            index,
            points: trip.points.slice(index * POINTS_PER_BLOCK, (index + 1) * POINTS_PER_BLOCK),
          },
          prefix(scope, trip.id) + index.toString().padStart(10, "0"),
        );
      }
      for (
        let index = Math.ceil(trip.points.length / POINTS_PER_BLOCK);
        index < Math.ceil(before.length / POINTS_PER_BLOCK);
        index++
      )
        tracks.delete(prefix(scope, trip.id) + index.toString().padStart(10, "0"));
    }
    for (const old of prior?.db.trips ?? [])
      if (!next.trips.some((t) => t.id === old.id)) {
        const p = prefix(scope, old.id);
        tracks.delete(IDBKeyRange.bound(p, p + "\uffff"));
      }
    const revision = (current?.revision ?? 0) + 1;
    tx.objectStore("snapshots").put(
      { db: { ...next, trips: next.trips.map((t) => ({ ...t, points: [] })) }, counts, revision },
      scope,
    );
    await done;
    return { db: next, counts, revision };
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* already completed */
    }
    await done.catch(() => {});
    throw error;
  }
}

export async function auxiliaryGet<T>(
  store: "sync" | "reviews" | "track-cache",
  key: string,
): Promise<T | null> {
  const idb = await recordsDatabase();
  return (await requestValue(idb.transaction(store).objectStore(store).get(key))) ?? null;
}
export async function auxiliaryPut(
  store: "sync" | "reviews" | "track-cache",
  key: string,
  value: unknown,
) {
  const idb = await recordsDatabase(),
    tx = idb.transaction(store, "readwrite"),
    done = transactionDone(tx);
  tx.objectStore(store).put(value, key);
  await done;
}

export async function auxiliaryList<T>(
  store: "reviews",
  scope: string,
): Promise<{ key: string; value: T }[]> {
  const idb = await recordsDatabase(),
    tx = idb.transaction(store),
    objectStore = tx.objectStore(store);
  const range = IDBKeyRange.bound(scope + ":", scope + ":\uffff");
  const keys = requestValue(objectStore.getAllKeys(range)),
    values = requestValue(objectStore.getAll(range));
  const [ids, rows] = await Promise.all([keys, values]);
  return rows.map((value, i) => ({ key: String(ids[i]), value }));
}

export async function deleteLocalScope(scope: string) {
  const idb = await recordsDatabase(),
    names = ["snapshots", "tracks", "sync", "reviews", "track-cache"];
  const tx = idb.transaction(names, "readwrite"),
    done = transactionDone(tx);
  tx.objectStore("snapshots").delete(scope);
  for (const name of names.slice(1))
    tx.objectStore(name).delete(IDBKeyRange.bound(scope + ":", scope + ":\uffff"));
  await done;
}
