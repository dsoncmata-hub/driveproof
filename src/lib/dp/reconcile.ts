import type { DbShape } from "./store";
import { canonical, parseSnapshot } from "./snapshot";

export type Choice = "local" | "cloud";
export type Conflict = { key: string; label: string; local: unknown; cloud: unknown };
export type MergePlan = { snapshot: DbShape; conflicts: Conflict[] };
const LISTS = ["trips", "fuelings", "evidences", "stations"] as const;

/** Three-way merge: changes against an acknowledged base, otherwise additive only. */
export function planMerge(
  localValue: unknown,
  cloudValue: unknown,
  baseValue: unknown = null,
  choices: Record<string, Choice> = {},
): MergePlan {
  const local = parseSnapshot(localValue),
    cloud = parseSnapshot(cloudValue);
  const base = baseValue ? parseSnapshot(baseValue) : null;
  if (local.activeTripId || cloud.activeTripId)
    throw Error("Finalize a viagem antes de sincronizar.");
  const conflicts: Conflict[] = [];
  const select = (key: string, label: string, l: unknown, r: unknown, b: unknown) => {
    if (canonical(l) === canonical(r)) return l;
    if (base && canonical(l) === canonical(b)) return r;
    if (base && canonical(r) === canonical(b)) return l;
    if (!base && l === undefined) return r;
    if (!base && r === undefined) return l;
    if (choices[key]) return choices[key] === "local" ? l : r;
    conflicts.push({ key, label, local: l, cloud: r });
    return l;
  };
  const next: DbShape = { ...local, demoSeeded: local.demoSeeded || cloud.demoSeeded };
  for (const key of LISTS) {
    const l = new Map(local[key].map((x) => [x.id, x]));
    const r = new Map(cloud[key].map((x) => [x.id, x]));
    const b = new Map(base?.[key].map((x) => [x.id, x]) ?? []);
    const merged = [];
    for (const id of new Set([...l.keys(), ...r.keys(), ...b.keys()])) {
      const item = select(key + ":" + id, key + " · " + id, l.get(id), r.get(id), b.get(id));
      if (item !== undefined) merged.push(item);
    }
    (next as unknown as Record<string, unknown>)[key] = merged;
  }
  next.vehicle = select(
    "vehicle",
    "Veículo",
    local.vehicle,
    cloud.vehicle,
    base?.vehicle,
  ) as DbShape["vehicle"];
  next.notifPausedUntil = select(
    "notifications",
    "Notificações",
    local.notifPausedUntil,
    cloud.notifPausedUntil,
    base?.notifPausedUntil,
  ) as number | null;
  // Unresolved parent/child edits must not produce orphaned evidence.
  if (!conflicts.length) parseSnapshot(next);
  return { snapshot: next, conflicts };
}
