import type { Checklist, Fueling, Trip } from "./types";
import { TIRE_LABELS } from "./defaults";
import { buildCycles } from "./cycles";

/* --------------------------- pneus --------------------------- */

export type TireAlert = {
  level: "info" | "atencao";
  message: string;
};

/** Alertas de COMPARABILIDADE (não são diagnóstico de defeito). */
export function tireAlerts(c: Checklist): TireAlert[] {
  const t = c.tirePressurePsi;
  const alerts: TireAlert[] = [];
  const missing = TIRE_LABELS.filter((x) => t[x.key] == null);
  if (missing.length > 0) {
    alerts.push({
      level: "info",
      message: `Pressão não informada em: ${missing.map((m) => m.label).join(", ")}. Sem esse dado não é possível comparar a condição dos pneus entre viagens.`,
    });
  }
  const axlePairs: Array<[string, number | null, number | null]> = [
    ["dianteiro", t.frontLeft, t.frontRight],
    ["traseiro", t.rearLeft, t.rearRight],
  ];
  for (const [axle, a, b] of axlePairs) {
    if (a != null && b != null && Math.abs(a - b) >= 2) {
      alerts.push({
        level: "atencao",
        message: `Diferença de ${Math.abs(a - b).toFixed(1)} PSI entre os pneus do eixo ${axle}. Isso reduz a comparabilidade com outras viagens; não é conclusão sobre defeito.`,
      });
    }
  }
  const checkRef = (label: string, value: number | null, ref: number | null) => {
    if (value == null || ref == null) return;
    const diff = value - ref;
    if (Math.abs(diff) >= 3) {
      alerts.push({
        level: "atencao",
        message: `${label}: ${value} PSI, ${diff > 0 ? "acima" : "abaixo"} da pressão recomendada informada (${ref} PSI) em ${Math.abs(diff).toFixed(1)} PSI.`,
      });
    }
  };
  checkRef("Dianteiro esquerdo", t.frontLeft, c.recommendedFrontPsi);
  checkRef("Dianteiro direito", t.frontRight, c.recommendedFrontPsi);
  checkRef("Traseiro esquerdo", t.rearLeft, c.recommendedRearPsi);
  checkRef("Traseiro direito", t.rearRight, c.recommendedRearPsi);
  if (c.tireMeasuredAt === "nao_informado" && TIRE_LABELS.some((x) => t[x.key] != null)) {
    alerts.push({
      level: "info",
      message:
        "Não foi informado se a medição foi com pneus frios ou quentes. Pneus quentes indicam pressão maior.",
    });
  }
  return alerts;
}

export function averageTirePsi(c: Checklist): number | null {
  const values = TIRE_LABELS.map((x) => c.tirePressurePsi[x.key]).filter(
    (v): v is number => v != null,
  );
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/* --------------------- índice de comparabilidade --------------------- */

export type ComparabilityFactor = {
  name: string;
  weight: number;
  score: number; // 0..1
  detail: string;
};

export type ComparabilityResult = {
  score: number; // 0..100
  factors: ComparabilityFactor[];
  unknownCount: number;
};

function numericScore(a: number | null, b: number | null, tolerance: number) {
  if (a == null || b == null) return null;
  const diff = Math.abs(a - b);
  return Math.max(0, 1 - diff / tolerance);
}

function boolScore(a: boolean, b: boolean) {
  return a === b ? 1 : 0;
}

function enumScore(a: string, b: string) {
  return a === b ? 1 : 0;
}

/**
 * Compara duas viagens variável a variável. O resultado é explicativo:
 * nunca ajusta ou "corrige" o consumo medido.
 */
export function comparability(a: Trip, b: Trip): ComparabilityResult {
  const ca = a.checklist;
  const cb = b.checklist;
  const raw: Array<{ name: string; weight: number; score: number | null; detail: string }> = [
    {
      name: "Pressão dos pneus",
      weight: 20,
      score: numericScore(averageTirePsi(ca), averageTirePsi(cb), 6),
      detail: `${fmtPsi(averageTirePsi(ca))} vs ${fmtPsi(averageTirePsi(cb))} (média dos 4)`,
    },
    {
      name: "Ocupantes / carga",
      weight: 15,
      score:
        avgOf([
          numericScore(ca.occupants, cb.occupants, 4),
          numericScore(ca.estimatedLoadKg, cb.estimatedLoadKg, 150),
        ]) ?? null,
      detail: `${ca.occupants ?? "?"} ocupantes / ${ca.estimatedLoadKg ?? "?"} kg vs ${cb.occupants ?? "?"} ocupantes / ${cb.estimatedLoadKg ?? "?"} kg`,
    },
    {
      name: "Ar-condicionado",
      weight: 12,
      score:
        boolScore(ca.acOn, cb.acOn) === 0
          ? 0
          : ca.acOn
            ? (numericScore(ca.acTempC, cb.acTempC, 6) ?? 0.7)
            : 1,
      detail: `${ca.acOn ? `ligado ${ca.acTempC ?? "?"}°C` : "desligado"} vs ${cb.acOn ? `ligado ${cb.acTempC ?? "?"}°C` : "desligado"}`,
    },
    {
      name: "Temperatura ambiente",
      weight: 8,
      score: numericScore(ca.ambientTempC, cb.ambientTempC, 12),
      detail: `${ca.ambientTempC ?? "?"}°C vs ${cb.ambientTempC ?? "?"}°C`,
    },
    {
      name: "Tipo de trajeto",
      weight: 15,
      score: enumScore(ca.routeType, cb.routeType),
      detail: `${ca.routeType} vs ${cb.routeType}`,
    },
    {
      name: "Trânsito",
      weight: 10,
      score: enumScore(ca.traffic, cb.traffic),
      detail: `${ca.traffic} vs ${cb.traffic}`,
    },
    {
      name: "Combustível",
      weight: 10,
      score:
        ca.fuelType === "nao_informado" || cb.fuelType === "nao_informado"
          ? null
          : enumScore(ca.fuelType, cb.fuelType),
      detail: `${ca.fuelType} vs ${cb.fuelType}`,
    },
    {
      name: "Partida a frio",
      weight: 5,
      score: boolScore(ca.coldStart, cb.coldStart),
      detail: `${ca.coldStart ? "sim" : "não"} vs ${cb.coldStart ? "sim" : "não"}`,
    },
    {
      name: "Janelas",
      weight: 5,
      score: enumScore(ca.windows, cb.windows),
      detail: `${ca.windows} vs ${cb.windows}`,
    },
  ];

  let weighted = 0;
  let totalWeight = 0;
  let unknownCount = 0;
  const factors: ComparabilityFactor[] = raw.map((f) => {
    if (f.score == null) {
      unknownCount += 1;
      return { name: f.name, weight: f.weight, score: 0, detail: `${f.detail} — dado ausente` };
    }
    weighted += f.score * f.weight;
    totalWeight += f.weight;
    return { name: f.name, weight: f.weight, score: f.score, detail: f.detail };
  });

  const score = totalWeight === 0 ? 0 : Math.round((weighted / totalWeight) * 100);
  return { score, factors, unknownCount };
}

function avgOf(values: Array<number | null>): number | null {
  const ok = values.filter((v): v is number => v != null);
  if (ok.length === 0) return null;
  return ok.reduce((a, b) => a + b, 0) / ok.length;
}

function fmtPsi(v: number | null) {
  return v == null ? "?" : `${v.toFixed(1)} PSI`;
}

/* ------------------------ consumo bomba-a-bomba ------------------------ */

export type TankToTank = {
  fromId: string;
  toId: string;
  at: number;
  distanceKm: number;
  liters: number;
  kmPerL: number;
  costPerKm: number | null;
};

/**
 * Ciclos tanque-cheio → tanque-cheio válidos. Soma os litros de TODOS os
 * abastecimentos após o cheio inicial (inclusive parciais). Ver cycles.ts.
 */
export function tankToTankConsumption(fuelings: Fueling[]): TankToTank[] {
  return buildCycles(fuelings)
    .filter((c) => c.status === "valido" && c.kmPerL != null)
    .map((c) => ({
      fromId: c.startId,
      toId: c.endId as string,
      at: c.endAt as number,
      distanceKm: c.distanceKm as number,
      liters: c.liters as number,
      kmPerL: c.kmPerL as number,
      costPerKm: c.costPerKm,
    }));
}

/** Consumo físico da viagem, quando o usuário informou litros consumidos. */
export function tripPhysicalKmPerL(trip: Trip): number | null {
  const distance =
    trip.odometerStart != null && trip.odometerEnd != null
      ? trip.odometerEnd - trip.odometerStart
      : trip.distanceKm;
  if (!trip.litersUsedEstimate || trip.litersUsedEstimate <= 0 || distance <= 0) return null;
  return distance / trip.litersUsedEstimate;
}

export function deviation(physical: number | null, indicated: number | null) {
  if (physical == null || indicated == null || physical === 0) return null;
  const abs = indicated - physical;
  return { abs, pct: (abs / physical) * 100 };
}