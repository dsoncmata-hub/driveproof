// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLocationConsent } from "./privacy";
import { useTripEngine } from "./useTripEngine";
import { createTrip, activateLocalAccount, emptyDb, finishTrip, readDb, writeDb } from "./store";
const mocks = vi.hoisted(() => ({ native: false, watch: vi.fn() }));
vi.mock("./native", () => ({ isNative: () => mocks.native, nativeWatch: mocks.watch }));
let position: PositionCallback;
const clearWatch = vi.fn();
beforeEach(async () => {
  mocks.native = false;
  mocks.watch.mockReset();
  localStorage.clear();
  await activateLocalAccount(null);
  await writeDb(emptyDb());
  setLocationConsent(true);
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: (callback: PositionCallback) => {
        position = callback;
        return 1;
      },
      clearWatch,
    },
  });
});
const sample = (timestamp: number, latitude = 0): GeolocationPosition => ({
  timestamp,
  coords: {
    latitude,
    longitude: 0,
    accuracy: 5,
    speed: 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    toJSON: () => ({}),
  },
  toJSON: () => ({}),
});
describe("GPS lifecycle", async () => {
  it("persists immediately after starting, before React commits the trip ID", async () => {
    const { result, unmount } = renderHook(() => useTripEngine(null));
    const trip = await createTrip();
    await act(async () => {
      result.current.start();
      position(sample(trip.startedAt + 1000));
      await result.current.flush();
    });
    expect(readDb().trips[0]?.points).toHaveLength(1);
    unmount();
  });
  it("does not carry points into the next trip", async () => {
    const first = await createTrip();
    const { result, unmount } = renderHook(() => useTripEngine(first.id));
    await act(async () => {
      result.current.start();
      position(sample(first.startedAt + 1000));
      await result.current.flush();
    });
    await finishTrip(first.id);
    const second = await createTrip();
    await act(async () => {
      position(sample(second.startedAt + 2000, 0.001));
      await result.current.flush();
    });
    expect(readDb().trips.find((t) => t.id === first.id)?.points).toHaveLength(1);
    expect(readDb().trips.find((t) => t.id === second.id)?.points).toHaveLength(1);
    unmount();
  });
  it("rejects duplicated timestamps and inaccurate readings", async () => {
    const trip = await createTrip();
    const { result, unmount } = renderHook(() => useTripEngine(trip.id));
    await act(async () => {
      result.current.start();
      position(sample(trip.startedAt + 1000));
      position(sample(trip.startedAt + 1000));
      position({
        ...sample(trip.startedAt + 2000),
        coords: { ...sample(0).coords, accuracy: 200 },
      });
      await result.current.flush();
    });
    expect(readDb().trips[0]?.points).toHaveLength(1);
    unmount();
  });
});

describe("native location lifecycle", () => {
  it("cancels a watcher that finishes starting after stop", async () => {
    mocks.native = true;
    let resolve!: (stop: () => Promise<void>) => void;
    mocks.watch.mockReturnValue(
      new Promise<() => Promise<void>>((r) => {
        resolve = r;
      }),
    );
    const stop = vi.fn(async () => {}),
      trip = await createTrip();
    const { result, unmount } = renderHook(() => useTripEngine(trip.id));
    await act(async () => {
      result.current.start();
      await result.current.stop();
      resolve(stop);
    });
    expect(stop).toHaveBeenCalledOnce();
    unmount();
  });
  it("persists native samples and removes the watcher on stop", async () => {
    mocks.native = true;
    const stop = vi.fn(async () => {}),
      trip = await createTrip();
    mocks.watch.mockResolvedValue(stop);
    const { result, unmount } = renderHook(() => useTripEngine(trip.id));
    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      mocks.watch.mock.calls[0]![0]({
        t: trip.startedAt + 1000,
        lat: 0,
        lon: 0,
        speed: 10,
        altitude: null,
        accuracy: 5,
      });
      await result.current.stop();
    });
    expect(readDb().trips[0]?.points).toHaveLength(1);
    expect(stop).toHaveBeenCalledOnce();
    unmount();
  });
});
