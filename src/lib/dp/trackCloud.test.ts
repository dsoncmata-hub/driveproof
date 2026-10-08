import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), download: vi.fn(), identity: vi.fn() }));
vi.mock("./supabase", () => ({
  supabase: { storage: { from: () => ({ upload: mocks.upload, download: mocks.download }) } },
}));
vi.mock("./cloudSync", () => ({ checkCloudIdentity: mocks.identity }));
import { prepareRemoteSnapshot, hydrateRemoteSnapshot } from "./trackCloud";
import { deleteLocalScope } from "./localRecords";
import { emptyDb } from "./store";
import { defaultChecklist } from "./defaults";
import type { Trip } from "./types";
const trip: Trip = {
  id: "tripA",
  label: "test",
  startedAt: 1,
  endedAt: 2000000,
  points: Array.from({ length: 1201 }, (_, i) => ({
    t: i * 1000 + 1,
    lat: 0,
    lon: i / 1000000,
    accuracy: 5,
    speed: 1,
    altitude: null,
  })),
  distanceKm: 1,
  avgSpeedKmh: 1,
  maxSpeedKmh: 3.6,
  movingSeconds: 1200,
  elevationGainM: null,
  odometerStart: null,
  odometerEnd: null,
  indicatedKmPerL: null,
  litersUsedEstimate: null,
  checklist: defaultChecklist(),
  finished: true,
  syncState: "local",
};
const original = { ...emptyDb(), trips: [trip] };
beforeEach(() => {
  const files = new Map<string, Blob>();
  mocks.identity.mockResolvedValue(undefined);
  mocks.upload.mockImplementation(async (path: string, data: Blob) => {
    files.set(path, data);
    return { error: null };
  });
  mocks.download.mockImplementation(async (path: string) => ({
    data: files.get(path),
    error: null,
  }));
});
describe("immutable GPS transfer", () => {
  it("transfers a track in bounded blocks and restores the exact ordered readings", async () => {
    const transport = await prepareRemoteSnapshot("accountA", original);
    expect(transport.trips[0]!.points).toEqual([]);
    expect(transport.trips[0]!.trackChunks).toHaveLength(3);
    expect(mocks.upload).toHaveBeenCalledTimes(3);
    await deleteLocalScope("accountA");
    expect(await hydrateRemoteSnapshot("accountA", transport)).toEqual(original);
  });
  it("does not reupload committed blocks on retry", async () => {
    await prepareRemoteSnapshot("accountA", original);
    mocks.upload.mockClear();
    await prepareRemoteSnapshot("accountA", original);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("refuses a corrupt download and leaves no acknowledged replacement", async () => {
    const transport = await prepareRemoteSnapshot("accountA", original);
    await deleteLocalScope("accountA");
    mocks.download.mockResolvedValue({
      data: new Blob(["[]"], { type: "application/json" }),
      error: null,
    });
    await expect(hydrateRemoteSnapshot("accountA", transport)).rejects.toThrow(/Integridade/);
  });
  it("keeps the old full snapshot format readable", async () => {
    expect(await hydrateRemoteSnapshot("accountA", original)).toEqual(original);
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("stops on a failed block upload before a snapshot can reference it", async () => {
    mocks.upload.mockResolvedValueOnce({ error: { message: "offline" } });
    await expect(prepareRemoteSnapshot("accountA", original)).rejects.toEqual({
      message: "offline",
    });
  });
});

it("moves a long trip above 4 MB as small blocks and restores every sample", async () => {
  const points = Array.from({ length: 60_000 }, (_, i) => ({
    t: i * 1000 + 1,
    lat: 0,
    lon: i / 1_000_000,
    speed: 1,
    accuracy: 5,
    altitude: null,
  }));
  const long = { ...emptyDb(), trips: [{ ...trip, id: "longTrip", points, endedAt: 60_000_001 }] };
  expect(new TextEncoder().encode(JSON.stringify(long)).length).toBeGreaterThan(4_000_000);
  const transport = await prepareRemoteSnapshot("longOwner", long);
  expect(new TextEncoder().encode(JSON.stringify(transport)).length).toBeLessThan(20_000);
  expect(transport.trips[0]!.trackChunks).toHaveLength(120);
  await deleteLocalScope("longOwner");
  expect((await hydrateRemoteSnapshot("longOwner", transport)).trips[0]!.points).toEqual(points);
});
