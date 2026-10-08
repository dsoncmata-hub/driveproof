import type { Page } from "@playwright/test";
export async function storedRecords(page: Page, scope = "guest") {
  return page.evaluate(async (scope) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("carvrum-records", 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const stored = await new Promise<any>((resolve, reject) => {
      const req = db.transaction("snapshots").objectStore("snapshots").get(scope);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return (
      stored?.db ?? { trips: [], fuelings: [], evidences: [], stations: [], activeTripId: null }
    );
  }, scope);
}
