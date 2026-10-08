// @vitest-environment jsdom
import { act, render, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  sync: vi.fn(),
  db: {
    activeTripId: null,
    trips: [
      {
        points: Array.from({ length: 60_000 }, (_, i) => ({
          t: i * 1000,
          lat: 0,
          lon: i / 1_000_000,
          speed: 1,
          accuracy: 5,
          altitude: null,
        })),
      },
    ],
    fuelings: [],
    evidences: [],
    stations: [],
  },
}));
vi.mock("@/lib/dp/cloudSync", () => ({ syncRecords: mocks.sync }));
vi.mock("@/lib/dp/store", () => ({
  readDb: () => mocks.db,
  useDb: () => mocks.db,
  addFueling: vi.fn(),
  update: vi.fn(),
  uid: vi.fn(),
}));
import { CloudAutoSync } from "./CloudAutoSync";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});
it("sends GPS above the old snapshot limit through the incremental sync transport", async () => {
  expect(new TextEncoder().encode(JSON.stringify(mocks.db)).length).toBeGreaterThan(4_000_000);
  vi.useFakeTimers();
  localStorage.setItem("driveproof:auto-sync:accountA", "on");
  mocks.sync.mockResolvedValue({ conflicts: [], status: "Sincronizado na nuvem" });
  render(<CloudAutoSync userId="accountA" />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2500);
  });
  expect(mocks.sync).toHaveBeenCalledWith("accountA");
});
