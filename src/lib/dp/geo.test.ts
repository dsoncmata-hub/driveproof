import { describe, expect, it } from "vitest";
import { segmentDistanceKm, totalDistanceKm, tripMetrics, validTrackPoint } from "./geo";
import type { TrackPoint } from "./types";
const p = (t: number, lat = 0, speed: number | null = 10): TrackPoint => ({
  t,
  lat,
  lon: 0,
  speed,
  accuracy: 5,
  altitude: null,
});
describe("GPS measurements", () => {
  it("rejects invalid positions, accuracy and speed", () => {
    expect(validTrackPoint(p(0, 91))).toBe(false);
    expect(validTrackPoint({ ...p(0), accuracy: 101 })).toBe(false);
    expect(validTrackPoint({ ...p(0), lat: NaN })).toBe(false);
    expect(validTrackPoint(p(0, 0, 100))).toBe(false);
  });
  it("does not count impossible jumps or nonmonotonic timestamps", () => {
    expect(segmentDistanceKm(p(0), p(1000, 1))).toBe(0);
    expect(segmentDistanceKm(p(1000), p(1000, 0.001))).toBe(0);
  });
  it("accepts a physically plausible segment longer than 1 km", () => {
    expect(segmentDistanceKm(p(0), p(60000, 0.02))).toBeGreaterThan(2);
  });
  it("does not bridge suspension gaps", () => {
    expect(segmentDistanceKm(p(0), p(61000, 0.01))).toBe(0);
  });
  it("does not count stationary drift", () => {
    expect(totalDistanceKm([p(0, 0, 0), p(5000, 0.0001, 0)])).toBe(0);
    expect(totalDistanceKm([p(0, 0, null), p(5000, 0.00001, null)])).toBe(0);
  });
  it("counts moving time only from measured segments", () => {
    const metrics = tripMetrics([p(0), p(10000, 0.001), p(120000, 0.1)], 0, 120000);
    expect(metrics.movingSeconds).toBe(10);
    expect(metrics.distanceKm).toBeCloseTo(0.1112, 3);
    expect(metrics.maxSpeedKmh).toBe(36);
  });
});
