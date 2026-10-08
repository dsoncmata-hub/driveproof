// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  activateLocalAccount,
  appendTripPoints,
  createTrip,
  emptyDb,
  readDb,
  writeDb,
} from "./store";
import { deleteLocalScope, loadRecords, recordsDatabase } from "./localRecords";
import { getBlob, putBlob } from "./blobs";
import { tripMetrics } from "./geo";
import type { TrackPoint } from "./types";

describe("account vaults and incremental durability", () => {
  it("imports legacy GPS atomically, keeps the source and resumes after reopen", async () => {
    localStorage.clear();
    await activateLocalAccount(null);
    const trip = await createTrip();
    const points = Array.from({ length: 1201 }, (_, i) => ({
      t: trip.startedAt + i * 1000,
      lat: i / 100000,
      lon: 0,
      speed: 2,
      altitude: null,
      accuracy: 5,
    }));
    const legacy = { ...emptyDb(), trips: [{ ...trip, points }], activeTripId: trip.id };
    await deleteLocalScope("guest");
    localStorage.setItem("driveproof:v1", JSON.stringify(legacy));
    await activateLocalAccount("accountA");
    expect(readDb().trips[0]!.points).toEqual(points);
    expect(JSON.parse(localStorage.getItem("driveproof:v1")!)).toEqual(legacy);
    await activateLocalAccount(null);
    expect(readDb().trips).toEqual([]);
    await activateLocalAccount("accountA");
    expect(readDb().trips[0]!.points).toEqual(points);
  });
  it("keeps two accounts' metadata and originals separate, including the same evidence ID", async () => {
    localStorage.clear();
    await activateLocalAccount("accountA");
    await writeDb({ ...emptyDb(), vehicle: { ...emptyDb().vehicle, name: "A vehicle" } });
    await putBlob("sharedId", new Blob(["A"], { type: "image/jpeg" }));
    await activateLocalAccount("accountB");
    expect(readDb().vehicle.name).toBe("Meu veículo");
    expect(await getBlob("sharedId")).toBeNull();
    await putBlob("sharedId", new Blob(["B"], { type: "image/jpeg" }));
    await activateLocalAccount("accountA");
    expect(readDb().vehicle.name).toBe("A vehicle");
    expect(await getBlob("sharedId")).toBeTruthy();
    await activateLocalAccount(null);
    expect(await getBlob("sharedId")).toBeNull();
  });
  it("stores GPS larger than the old 4 MB ceiling without copying it to localStorage", async () => {
    localStorage.clear();
    await activateLocalAccount(null);
    const trip = await createTrip();
    const points = Array.from({ length: 60000 }, (_, i) => ({
      t: trip.startedAt + i * 1000,
      lat: 0,
      lon: i / 1000000,
      speed: 1,
      altitude: null,
      accuracy: 5,
    }));
    const next = { ...emptyDb(), trips: [{ ...trip, points }], activeTripId: trip.id };
    expect(JSON.stringify(next).length).toBeGreaterThan(4_000_000);
    await writeDb(next);
    expect(localStorage.getItem("driveproof:v1")).toBeNull();
    await activateLocalAccount(null);
    expect(readDb().trips[0]!.points).toHaveLength(60000);
  });
  it("rewrites only the changed GPS block and yields the same metrics as a complete scan", async () => {
    localStorage.clear();
    await activateLocalAccount(null);
    const trip = await createTrip();
    const points: TrackPoint[] = Array.from({ length: 1000 }, (_, i) => ({
      t: trip.startedAt + i * 1000,
      lat: i / 100000,
      lon: 0,
      speed: 2,
      altitude: i,
      accuracy: 5,
    }));
    await appendTripPoints(trip.id, points.slice(0, 999));
    const spy = vi.spyOn(IDBObjectStore.prototype, "put");
    await appendTripPoints(trip.id, points.slice(999));
    expect(spy.mock.calls.filter(([, key]) => String(key).includes(trip.id))).toHaveLength(1);
    const actual = readDb().trips[0]!,
      expected = tripMetrics(points, trip.startedAt, points.at(-1)!.t);
    expect(actual.distanceKm).toBeCloseTo(expected.distanceKm, 8);
    expect(actual.movingSeconds).toBe(expected.movingSeconds);
    expect(actual.elevationGainM).toBe(expected.elevationGainM);
    spy.mockRestore();
    expect((await loadRecords("guest"))?.db.trips[0]!.points).toHaveLength(1000);
    expect(await recordsDatabase()).toBeTruthy();
  });
});
