import { useSyncExternalStore } from "react";
import type { Evidence, Fueling, Station, Trip, Vehicle } from "./types";
import { defaultChecklist } from "./defaults";
import { loadRecords, recordsRevision, saveRecords, type StoredRecords } from "./localRecords";
import { changeScope, localScope, LEGACY_OWNER_KEY } from "./accountScope";
import { parseSnapshot } from "./snapshot";
import { validTrackPoint, segmentDistanceKm, speedKmh } from "./geo";
import type { TrackPoint } from "./types";
import { bindGuestBlobs } from "./blobs";

export const APP_VERSION = "0.3.0-mvp";
const KEY = "driveproof:v1";

export type DbShape = {
  version: number;
  trips: Trip[];
  fuelings: Fueling[];
  evidences: Evidence[];
  vehicle: Vehicle;
  activeTripId: string | null;
  demoSeeded: boolean;
  stations: Station[];
  /** null = ativas; -1 = pausadas até reativar; epoch ms = pausadas até */
  notifPausedUntil: number | null;
};

export const emptyDb = (): DbShape => ({
  version: 1,
  trips: [],
  fuelings: [],
  evidences: [],
  vehicle: {
    name: "Meu veículo",
    plate: "",
    recommendedFrontPsi: null,
    recommendedRearPsi: null,
    tankLiters: null,
  },
  activeTripId: null,
  demoSeeded: false,
  stations: [],
  notifPausedUntil: null,
});

let cache: DbShape | null = null;
let durable: StoredRecords | null = null;
let queue: Promise<unknown> = Promise.resolve();
let ready = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
let localChannel: BroadcastChannel | null = null;
const broadcast = () => localChannel?.postMessage(localScope());
function listenForOtherTabs() {
  if (localChannel || typeof BroadcastChannel === "undefined") return;
  localChannel = new BroadcastChannel("carvrum:local");
  localChannel.onmessage = (event) => {
    const scope = event.data;
    if (!ready || scope !== localScope()) return;
    void serialized(async () => {
      if (!ready || scope !== localScope()) return;
      const next = await loadRecords(scope);
      if (next && next.revision > (durable?.revision ?? 0) && scope === localScope()) {
        durable = next;
        cache = next.db;
        notify();
      }
    });
  };
}
const isBrowser = () => typeof window !== "undefined";
const reportFailure = (error: unknown) => {
  if (isBrowser())
    window.dispatchEvent(
      new CustomEvent("carvrum:storage-error", {
        detail:
          error instanceof Error ? error.message : "Não foi possível gravar. Tente novamente.",
      }),
    );
};
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task);
  queue = result.catch(reportFailure);
  return result;
}

/** Originals and legacy keys stay intact; only the verified owner can import them. */
export async function activateLocalAccount(userId: string | null) {
  await queue;
  listenForOtherTabs();
  const scope = userId ?? "guest";
  ready = false;
  cache = null;
  changeScope(scope);
  let stored = await loadRecords(scope);
  let owner = localStorage.getItem(LEGACY_OWNER_KEY);
  if (!owner) {
    const owners = Object.keys(localStorage)
      .filter((k) => k.startsWith("driveproof:auto-sync:revision:"))
      .map((k) => k.slice("driveproof:auto-sync:revision:".length));
    if (owners.length > 1)
      throw Error(
        "Há registros de múltiplas contas no formato antigo. É necessária recuperação assistida.",
      );
    owner = owners[0] ?? null;
    if (owner) localStorage.setItem(LEGACY_OWNER_KEY, owner);
  }
  if (userId && !owner) {
    // Claim unowned records only once, after authentication. Commit the copy before binding it.
    const guest = await loadRecords("guest");
    const raw = localStorage.getItem(KEY);
    const legacy =
      guest?.db ?? (raw ? parseSnapshot({ ...emptyDb(), ...JSON.parse(raw) }) : emptyDb());
    if (!stored) stored = await saveRecords(scope, legacy, null);
    await bindGuestBlobs(
      userId,
      legacy.evidences.map((e) => e.id),
    );
    localStorage.setItem(LEGACY_OWNER_KEY, userId);
    owner = userId;
  }
  if (!stored && ((scope === "guest" && !owner) || owner === scope)) {
    const raw = localStorage.getItem(KEY);
    if (raw)
      stored = await saveRecords(scope, parseSnapshot({ ...emptyDb(), ...JSON.parse(raw) }), null);
  }
  // A claimed guest copy must not reappear after logout.
  if (scope === "guest" && owner) {
    const raw = await loadRecords("guest-private-empty");
    stored = raw;
    changeScope("guest-private-empty");
  }
  durable = stored;
  cache = stored?.db ?? emptyDb();
  ready = true;
  notify();
}

export function readDb(): DbShape {
  if (!isBrowser()) return serverSnapshot;
  if (!ready || !cache) throw Error("Aguarde a abertura segura dos registros locais.");
  return cache;
}

export function writeDb(next: DbShape): Promise<void> {
  const scope = localScope();
  return serialized(async () => {
    if (!ready || scope !== localScope()) throw Error("A conta mudou antes da gravação.");
    const commit = () => saveRecords(scope, next, durable);
    durable = navigator.locks
      ? await navigator.locks.request("carvrum:local:" + scope, commit)
      : await commit();
    cache = next;
    notify();
    broadcast();
  });
}

export function update(mutator: (db: DbShape) => DbShape): Promise<void> {
  const scope = localScope();
  return serialized(async () => {
    if (!ready || scope !== localScope()) throw Error("A conta mudou antes da gravação.");
    const commit = async () => {
      const latest =
        (await recordsRevision(scope)) === (durable?.revision ?? 0)
          ? durable
          : await loadRecords(scope);
      const next = mutator(latest?.db ?? readDb());
      durable = await saveRecords(scope, next, latest);
      cache = next;
      notify();
    };
    if (navigator.locks) await navigator.locks.request("carvrum:local:" + scope, commit);
    else await commit();
    broadcast();
  });
}
export const flushLocalWrites = () => queue;
export const storageReady = () => ready;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const serverSnapshot = emptyDb();

export function useDb(): DbShape {
  return useSyncExternalStore(subscribe, readDb, () => serverSnapshot);
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/* ----------------------------- operações ----------------------------- */

export async function createTrip(partial?: Partial<Trip>): Promise<Trip> {
  const db = readDb();
  const trip: Trip = {
    id: uid("trip"),
    label: `Viagem ${db.trips.length + 1}`,
    startedAt: Date.now(),
    endedAt: null,
    points: [],
    distanceKm: 0,
    maxSpeedKmh: 0,
    avgSpeedKmh: 0,
    movingSeconds: 0,
    elevationGainM: null,
    odometerStart: null,
    odometerEnd: null,
    indicatedKmPerL: null,
    litersUsedEstimate: null,
    checklist: defaultChecklist(db.vehicle),
    finished: false,
    syncState: "local",
    ...partial,
  };
  await update((d) => {
    if (d.activeTripId) throw Error("Já existe uma viagem em andamento.");
    return { ...d, trips: [trip, ...d.trips], activeTripId: trip.id };
  });
  return trip;
}

export function patchTrip(id: string, patch: Partial<Trip>) {
  return update((d) => ({
    ...d,
    trips: d.trips.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  }));
}

export function appendTripPoints(id: string, samples: TrackPoint[]) {
  return update((db) => {
    const trip = db.trips.find((t) => t.id === id);
    if (!trip || trip.finished) return db;
    const added: TrackPoint[] = [];
    let last = trip.points.at(-1),
      distanceKm = trip.distanceKm,
      maxSpeedKmh = trip.maxSpeedKmh;
    let movingMs = trip.telemetryState?.movingMs ?? trip.movingSeconds * 1000;
    let lastAltitude =
      trip.telemetryState?.lastAltitude ??
      [...trip.points].reverse().find((p) => p.altitude !== null)?.altitude ??
      null;
    let altitudeSamples =
      trip.telemetryState?.altitudeSamples ?? trip.points.filter((p) => p.altitude !== null).length;
    let altitudeGain = trip.telemetryState?.altitudeGain ?? trip.elevationGainM ?? 0;
    for (const point of samples) {
      if (
        !validTrackPoint(point) ||
        point.t < trip.startedAt ||
        point.t <= (last?.t ?? 0) ||
        (trip.endedAt && point.t > trip.endedAt)
      )
        continue;
      const km = last ? segmentDistanceKm(last, point) : 0;
      distanceKm += km;
      if (last && km > 0) movingMs += point.t - last.t;
      maxSpeedKmh = Math.max(maxSpeedKmh, speedKmh(point));
      if (point.altitude !== null) {
        if (lastAltitude !== null && point.altitude - lastAltitude > 0.5)
          altitudeGain += point.altitude - lastAltitude;
        lastAltitude = point.altitude;
        altitudeSamples++;
      }
      added.push(point);
      last = point;
    }
    if (!added.length) return db;
    const next = {
      ...trip,
      points: [...trip.points, ...added],
      distanceKm,
      maxSpeedKmh,
      movingSeconds: Math.round(movingMs / 1000),
      elevationGainM: altitudeSamples < 2 ? null : Math.round(altitudeGain),
      avgSpeedKmh:
        distanceKm /
        Math.max((Math.max(Date.now(), last!.t) - trip.startedAt) / 3_600_000, 1 / 3600),
      telemetryState: { movingMs, lastAltitude, altitudeSamples, altitudeGain },
    };
    return { ...db, trips: db.trips.map((t) => (t.id === id ? next : t)) };
  });
}

export function finishTrip(id: string) {
  return update((d) => ({
    ...d,
    activeTripId: d.activeTripId === id ? null : d.activeTripId,
    trips: d.trips.map((t) =>
      t.id === id ? { ...t, finished: true, endedAt: t.endedAt ?? Date.now() } : t,
    ),
  }));
}

export function deleteTrip(id: string) {
  return update((d) => ({
    ...d,
    trips: d.trips.filter((t) => t.id !== id),
    evidences: d.evidences.filter((e) => e.tripId !== id),
    fuelings: d.fuelings.map((f) => (f.tripId === id ? { ...f, tripId: null } : f)),
    activeTripId: d.activeTripId === id ? null : d.activeTripId,
  }));
}

export function addEvidence(ev: Evidence) {
  return update((d) => ({ ...d, evidences: [ev, ...d.evidences] }));
}

export function addFueling(f: Fueling) {
  return update((d) => ({ ...d, fuelings: [f, ...d.fuelings].sort((a, b) => b.at - a.at) }));
}

export function deleteFueling(id: string) {
  return update((d) => ({
    ...d,
    fuelings: d.fuelings.filter((f) => f.id !== id),
    evidences: d.evidences.filter((e) => e.fuelingId !== id),
  }));
}

export function setVehicle(v: Vehicle) {
  return update((d) => ({ ...d, vehicle: v }));
}

export function resetAll() {
  return writeDb(emptyDb());
}

export function addStation(s: Station) {
  return update((d) => ({ ...d, stations: [s, ...d.stations.filter((x) => x.id !== s.id)] }));
}

export function toggleFavoriteStation(id: string) {
  return update((d) => ({
    ...d,
    stations: d.stations.map((s) => (s.id === id ? { ...s, favorite: !s.favorite } : s)),
  }));
}

export function setNotifPause(until: number | null) {
  return update((d) => ({ ...d, notifPausedUntil: until }));
}

export function notificationsActive(db: DbShape, now = Date.now()): boolean {
  const u = db.notifPausedUntil;
  if (u == null) return true;
  if (u === -1) return false;
  return now >= u;
}
