import { sha256OfString } from "./hash";
import type { Evidence, Trip, TripManifest } from "./types";
import { APP_VERSION } from "./store";

/** Manifesto de integridade da viagem: lista de hashes + hash do trajeto. */
export async function buildTripManifest(
  trip: Trip,
  evidences: Evidence[],
): Promise<TripManifest> {
  const entries = evidences
    .filter((e) => e.tripId === trip.id)
    .sort((a, b) => a.capturedAt - b.capturedAt)
    .map((e) => ({
      evidenceId: e.id,
      sha256: e.sha256,
      category: e.category,
      capturedAt: e.capturedAt,
      lat: e.lat,
      lon: e.lon,
      fileName: e.fileName,
      sizeBytes: e.sizeBytes,
    }));

  const trackHash = await sha256OfString(
    JSON.stringify(trip.points.map((p) => [p.t, p.lat, p.lon, p.speed, p.altitude])),
  );

  const base = {
    tripId: trip.id,
    startedAt: trip.startedAt,
    endedAt: trip.endedAt,
    distanceKm: Number(trip.distanceKm.toFixed(4)),
    checklist: trip.checklist,
    entries,
    trackHash,
    appVersion: APP_VERSION,
  };
  const manifestHash = await sha256OfString(JSON.stringify(base));

  return {
    tripId: trip.id,
    generatedAt: Date.now(),
    appVersion: APP_VERSION,
    entries,
    trackHash,
    manifestHash,
  };
}