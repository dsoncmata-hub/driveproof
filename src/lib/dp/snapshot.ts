import { z } from "zod";
import type { DbShape } from "./store";

const num = z.number().finite();
const nonnegative = num.min(0);
const nullable = num.nullable();
const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9_-]+$/);
const ref = id.nullable();
const syncState = z.enum(["local", "pending", "synced"]);
const fuel = z.enum(["gasolina", "etanol", "mistura", "diesel", "gnv", "nao_informado"]);
const point = z
  .object({
    t: nonnegative,
    lat: num.min(-90).max(90),
    lon: num.min(-180).max(180),
    speed: nonnegative.nullable(),
    altitude: nullable,
    accuracy: nonnegative.nullable(),
  })
  .passthrough();
const vehicle = z
  .object({
    name: z.string(),
    plate: z.string(),
    recommendedFrontPsi: nullable,
    recommendedRearPsi: nullable,
    tankLiters: nullable,
  })
  .passthrough();
const checklist = z
  .object({
    tirePressurePsi: z.object({
      frontLeft: nullable,
      frontRight: nullable,
      rearLeft: nullable,
      rearRight: nullable,
    }),
    tireMeasuredAt: z.enum(["frio", "quente", "nao_informado"]),
    recommendedFrontPsi: nullable,
    recommendedRearPsi: nullable,
    ambientTempC: nullable,
    occupants: nullable,
    estimatedLoadKg: nullable,
    acOn: z.boolean(),
    acTempC: nullable,
    initialFuelLevelPct: nullable,
    fuelType: fuel,
    coldStart: z.boolean(),
    driveMode: z.enum(["eco", "normal", "sport", "nao_aplicavel"]),
    windows: z.enum(["fechadas", "abertas", "parcial"]),
    roadCondition: z.enum(["seco", "chuva_leve", "chuva_forte", "piso_molhado"]),
    traffic: z.enum(["livre", "moderado", "intenso"]),
    routeType: z.enum(["urbano", "rodoviario", "misto"]),
    notes: z.string(),
  })
  .passthrough();
export const snapshotSchema = z
  .object({
    version: z.literal(1),
    activeTripId: ref,
    demoSeeded: z.boolean(),
    notifPausedUntil: nullable,
    vehicle,
    trips: z.array(
      z
        .object({
          id,
          label: z.string(),
          startedAt: nonnegative,
          endedAt: nonnegative.nullable(),
          points: z.array(point),
          distanceKm: nonnegative,
          maxSpeedKmh: nonnegative,
          avgSpeedKmh: nonnegative,
          movingSeconds: nonnegative,
          elevationGainM: nullable,
          odometerStart: nullable,
          odometerEnd: nullable,
          indicatedKmPerL: nullable,
          litersUsedEstimate: nullable,
          checklist,
          finished: z.boolean(),
          syncState,
        })
        .passthrough(),
    ),
    fuelings: z.array(
      z
        .object({
          id,
          at: nonnegative,
          odometer: nullable,
          liters: nullable,
          pricePerLiter: nullable,
          totalValue: nullable,
          station: z.string(),
          stationId: ref.optional(),
          tankLevelPct: nullable.optional(),
          demo: z.boolean().optional(),
          fullTank: z.boolean(),
          fuelType: fuel,
          tripId: ref,
          note: z.string(),
          syncState,
        })
        .passthrough(),
    ),
    evidences: z.array(
      z
        .object({
          id,
          tripId: ref,
          fuelingId: ref,
          category: z.enum(["painel", "bomba", "pneus", "evento", "outro"]),
          fileName: z.string(),
          mimeType: z.string(),
          sizeBytes: nonnegative,
          capturedAt: nonnegative,
          lat: num.min(-90).max(90).nullable(),
          lon: num.min(-180).max(180).nullable(),
          sha256: z.string().regex(/^[a-f0-9]{64}$/i),
          inAppCapture: z.boolean(),
          note: z.string(),
          syncState,
        })
        .passthrough(),
    ),
    stations: z.array(
      z
        .object({
          id,
          name: z.string(),
          address: z.string(),
          city: z.string(),
          brand: z.string(),
          cnpj: z.string(),
          localId: z.string(),
          favorite: z.boolean(),
          lat: num.min(-90).max(90).nullable(),
          lon: num.min(-180).max(180).nullable(),
          source: z.enum(["manual", "sugestao_gps_confirmada"]),
          createdAt: nonnegative,
          demo: z.boolean().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export function parseSnapshot(value: unknown): DbShape {
  const result = snapshotSchema.safeParse(value);
  if (!result.success) throw Error("Formato dos registros inválido. Nenhum dado foi substituído.");
  const db = result.data as DbShape;
  for (const key of ["trips", "fuelings", "evidences", "stations"] as const) {
    if (new Set(db[key].map((x) => x.id)).size !== db[key].length)
      throw Error("IDs duplicados em " + key);
  }
  const trips = new Set(db.trips.map((x) => x.id));
  const fuelings = new Set(db.fuelings.map((x) => x.id));
  if (db.activeTripId && !db.trips.some((t) => t.id === db.activeTripId && !t.finished))
    throw Error("Viagem ativa inválida.");
  if (
    db.fuelings.some((f) => f.tripId && !trips.has(f.tripId)) ||
    db.evidences.some(
      (e) => (e.tripId && !trips.has(e.tripId)) || (e.fuelingId && !fuelings.has(e.fuelingId)),
    )
  ) {
    throw Error("Há registros sem a viagem ou abastecimento associado. Operação bloqueada.");
  }
  return db;
}

/** Structural equality independent of JSON key insertion order. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "undefined";
}
