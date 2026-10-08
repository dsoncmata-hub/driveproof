// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTripEngine } from "./useTripEngine";
import { createTrip, emptyDb, finishTrip, readDb, writeDb } from "./store";
let position: PositionCallback;
const clearWatch = vi.fn();
beforeEach(() => {
  localStorage.clear();
  writeDb(emptyDb());
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
describe("GPS lifecycle", () => {
  it("persists immediately after starting, before React commits the trip ID", () => {
    const { result, unmount } = renderHook(() => useTripEngine(null));
    const trip = createTrip();
    act(() => {
      result.current.start();
      position(sample(trip.startedAt + 1000));
    });
    expect(readDb().trips[0]?.points).toHaveLength(1);
    unmount();
  });
  it("does not carry points into the next trip", () => {
    const first = createTrip();
    const { result, unmount } = renderHook(() => useTripEngine(first.id));
    act(() => {
      result.current.start();
      position(sample(first.startedAt + 1000));
    });
    finishTrip(first.id);
    const second = createTrip();
    act(() => {
      position(sample(second.startedAt + 2000, 0.001));
    });
    expect(readDb().trips.find((t) => t.id === first.id)?.points).toHaveLength(1);
    expect(readDb().trips.find((t) => t.id === second.id)?.points).toHaveLength(1);
    unmount();
  });
  it("rejects duplicated timestamps and inaccurate readings", () => {
    const trip = createTrip();
    const { result, unmount } = renderHook(() => useTripEngine(trip.id));
    act(() => {
      result.current.start();
      position(sample(trip.startedAt + 1000));
      position(sample(trip.startedAt + 1000));
      position({
        ...sample(trip.startedAt + 2000),
        coords: { ...sample(0).coords, accuracy: 200 },
      });
    });
    expect(readDb().trips[0]?.points).toHaveLength(1);
    unmount();
  });
});
