import { useSyncExternalStore } from "react";
import type { Evidence, Fueling, Station, Trip, Vehicle } from "./types";
import { defaultChecklist } from "./defaults";

export const APP_VERSION = "0.2.0-mvp";
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
const listeners = new Set<() => void>();

function isBrowser() {
  return typeof window !== "undefined";
}

export function readDb(): DbShape {
  if (cache) return cache;
  if (!isBrowser()) return emptyDb();
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? { ...emptyDb(), ...(JSON.parse(raw) as DbShape) } : emptyDb();
  } catch {
    throw Error(
      "Não foi possível ler os registros locais. Os dados armazenados foram preservados; não limpe o navegador.",
    );
  }
  return cache;
}

export function writeDb(next: DbShape) {
  if (isBrowser()) {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  }
  cache = next;
  listeners.forEach((l) => l());
}

if (isBrowser()) {
  window.addEventListener("storage", (event) => {
    if (event.key === KEY || event.key === null) {
      cache = null;
      listeners.forEach((listener) => listener());
    }
  });
}

export function update(mutator: (db: DbShape) => DbShape) {
  writeDb(mutator(readDb()));
}

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

export function createTrip(partial?: Partial<Trip>): Trip {
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
  update((d) => ({ ...d, trips: [trip, ...d.trips], activeTripId: trip.id }));
  return trip;
}

export function patchTrip(id: string, patch: Partial<Trip>) {
  update((d) => ({
    ...d,
    trips: d.trips.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  }));
}

export function finishTrip(id: string) {
  update((d) => ({
    ...d,
    activeTripId: d.activeTripId === id ? null : d.activeTripId,
    trips: d.trips.map((t) =>
      t.id === id ? { ...t, finished: true, endedAt: t.endedAt ?? Date.now() } : t,
    ),
  }));
}

export function deleteTrip(id: string) {
  update((d) => ({
    ...d,
    trips: d.trips.filter((t) => t.id !== id),
    evidences: d.evidences.filter((e) => e.tripId !== id),
    fuelings: d.fuelings.map((f) => (f.tripId === id ? { ...f, tripId: null } : f)),
    activeTripId: d.activeTripId === id ? null : d.activeTripId,
  }));
}

export function addEvidence(ev: Evidence) {
  update((d) => ({ ...d, evidences: [ev, ...d.evidences] }));
}

export function addFueling(f: Fueling) {
  update((d) => ({ ...d, fuelings: [f, ...d.fuelings].sort((a, b) => b.at - a.at) }));
}

export function deleteFueling(id: string) {
  update((d) => ({
    ...d,
    fuelings: d.fuelings.filter((f) => f.id !== id),
    evidences: d.evidences.filter((e) => e.fuelingId !== id),
  }));
}

export function setVehicle(v: Vehicle) {
  update((d) => ({ ...d, vehicle: v }));
}

export function resetAll() {
  writeDb(emptyDb());
}

export function addStation(s: Station) {
  update((d) => ({ ...d, stations: [s, ...d.stations.filter((x) => x.id !== s.id)] }));
}

export function toggleFavoriteStation(id: string) {
  update((d) => ({
    ...d,
    stations: d.stations.map((s) => (s.id === id ? { ...s, favorite: !s.favorite } : s)),
  }));
}

export function setNotifPause(until: number | null) {
  update((d) => ({ ...d, notifPausedUntil: until }));
}

export function notificationsActive(db: DbShape, now = Date.now()): boolean {
  const u = db.notifPausedUntil;
  if (u == null) return true;
  if (u === -1) return false;
  return now >= u;
}
