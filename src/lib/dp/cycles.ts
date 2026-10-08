// Ciclos tanque-cheio → tanque-cheio e atribuição (estimativa associada) a postos.
// Módulo puro: sem acesso a armazenamento, para ser testável.
import type { Fueling, FuelType, RouteType, Trip } from "./types";

export const PLAUSIBLE_KMPL = { min: 2, max: 40 } as const;

export type Attribution =
  | { kind: "posto_unico"; stationId: string }
  | { kind: "misto"; reason: string }
  | { kind: "sem_posto"; reason: string };

export type CycleStatus = "valido" | "invalido" | "em_formacao";

export type Cycle = {
  id: string;
  startId: string;
  endId: string | null;
  fuelingIds: string[];
  startAt: number;
  endAt: number | null;
  fuelType: FuelType | null;
  distanceKm: number | null;
  liters: number | null;
  kmPerL: number | null;
  cost: number | null;
  costPerKm: number | null;
  weightedPricePerL: number | null;
  status: CycleStatus;
  reasons: string[];
  attribution: Attribution;
};

const fuelValue = (f: Fueling): number | null =>
  f.totalValue ?? (f.liters != null && f.pricePerLiter != null ? f.liters * f.pricePerLiter : null);

/**
 * Combustível consumido no ciclo vem do residual anterior + abastecimento que abriu o
 * ciclo + parciais intermediários. O abastecimento que FECHA o ciclo apenas mede o
 * volume consumido; por isso nunca é usado na atribuição.
 */
function attribute(list: Fueling[], s: number, e: number): Attribution {
  if (s === 0)
    return { kind: "sem_posto", reason: "Origem do combustível residual desconhecida (primeiro registro)." };
  const supply = [list[s - 1]!, ...list.slice(s, e)];
  if (supply.some((f) => !f.stationId))
    return { kind: "sem_posto", reason: "Posto não identificado em ao menos um abastecimento de origem." };
  const ids = new Set(supply.map((f) => f.stationId as string));
  if (ids.size > 1) return { kind: "misto", reason: "Combustível misto — sem atribuição." };
  const fuels = new Set(supply.map((f) => f.fuelType));
  if (fuels.size > 1) return { kind: "misto", reason: "Residual de outro combustível — sem atribuição." };
  return { kind: "posto_unico", stationId: [...ids][0]! };
}

function evaluate(list: Fueling[], s: number, e: number): Cycle {
  const seq = list.slice(s, e + 1);
  const start = seq[0]!;
  const end = seq[seq.length - 1]!;
  const after = seq.slice(1);
  const reasons: string[] = [];

  if (seq.some((f) => f.odometer == null)) reasons.push("Hodômetro ausente em abastecimento do ciclo.");
  if (after.some((f) => f.liters == null || f.liters <= 0)) reasons.push("Volume ausente ou inválido.");
  for (let k = 1; k < seq.length; k++) {
    const a = seq[k - 1]!.odometer;
    const b = seq[k]!.odometer;
    if (a != null && b != null && b <= a) {
      reasons.push("Hodômetro regressivo ou repetido.");
      break;
    }
  }
  const fuels = new Set(seq.map((f) => f.fuelType));
  if (fuels.has("nao_informado")) reasons.push("Combustível não informado.");
  else if (fuels.size > 1) reasons.push(`Combustíveis diferentes no ciclo (${[...fuels].join(", ")}).`);

  const distanceKm =
    start.odometer != null && end.odometer != null ? end.odometer - start.odometer : null;
  const liters = after.every((f) => f.liters != null)
    ? after.reduce((a, f) => a + (f.liters as number), 0)
    : null;
  let kmPerL = distanceKm != null && liters && liters > 0 && distanceKm > 0 ? distanceKm / liters : null;
  if (kmPerL != null && (kmPerL < PLAUSIBLE_KMPL.min || kmPerL > PLAUSIBLE_KMPL.max))
    reasons.push(
      `Rendimento ${kmPerL.toFixed(1)} km/L fora da faixa plausível (${PLAUSIBLE_KMPL.min}–${PLAUSIBLE_KMPL.max}); verifique digitação.`,
    );

  const values = after.map(fuelValue);
  const cost = values.every((v) => v != null) ? values.reduce((a, v) => a + (v as number), 0) : null;
  const valid = reasons.length === 0;
  if (!valid) kmPerL = null;

  return {
    id: `${start.id}>${end.id}`,
    startId: start.id,
    endId: end.id,
    fuelingIds: seq.map((f) => f.id),
    startAt: start.at,
    endAt: end.at,
    fuelType: fuels.size === 1 ? start.fuelType : null,
    distanceKm,
    liters,
    kmPerL,
    cost,
    costPerKm: valid && cost != null && distanceKm ? cost / distanceKm : null,
    weightedPricePerL: cost != null && liters ? cost / liters : null,
    status: valid ? "valido" : "invalido",
    reasons,
    attribution: valid ? attribute(list, s, e) : { kind: "sem_posto", reason: "Ciclo inválido." },
  };
}

/** Retorna ciclos do mais recente para o mais antigo; o primeiro pode estar "em formação". */
export function buildCycles(fuelings: Fueling[]): Cycle[] {
  const list = [...fuelings].sort((a, b) => a.at - b.at);
  const cycles: Cycle[] = [];
  let startIdx = -1;
  for (let i = 0; i < list.length; i++) {
    if (!list[i]!.fullTank) continue;
    if (startIdx >= 0) cycles.push(evaluate(list, startIdx, i));
    startIdx = i;
  }
  if (startIdx >= 0) {
    const tail = list.slice(startIdx);
    const start = tail[0]!;
    const last = tail[tail.length - 1]!;
    cycles.push({
      id: `${start.id}>aberto`,
      startId: start.id,
      endId: null,
      fuelingIds: tail.map((f) => f.id),
      startAt: start.at,
      endAt: null,
      fuelType: start.fuelType,
      distanceKm:
        start.odometer != null && last.odometer != null ? last.odometer - start.odometer : null,
      liters: tail.slice(1).reduce((a, f) => a + (f.liters ?? 0), 0),
      kmPerL: null,
      cost: null,
      costPerKm: null,
      weightedPricePerL: null,
      status: "em_formacao",
      reasons: ["Ciclo em formação: aguardando próximo abastecimento com tanque cheio."],
      attribution: { kind: "sem_posto", reason: "Ciclo não fechado." },
    });
  }
  return cycles.reverse();
}

/* ------------------------------ estatística ------------------------------ */

export type Confidence = "insuficiente" | "baixa" | "media" | "alta";

export type GroupStats = {
  n: number;
  km: number;
  liters: number;
  kmPerL: number | null; // km totais / litros totais
  mean: number | null;
  stdev: number | null;
  cv: number | null;
  costPerKm: number | null;
  weightedPricePerL: number | null;
  confidence: Confidence;
};

export function groupStats(cycles: Cycle[]): GroupStats {
  const v = cycles.filter((c) => c.status === "valido" && c.kmPerL != null);
  const n = v.length;
  const km = v.reduce((a, c) => a + (c.distanceKm ?? 0), 0);
  const liters = v.reduce((a, c) => a + (c.liters ?? 0), 0);
  const vals = v.map((c) => c.kmPerL as number);
  const mean = n ? vals.reduce((a, b) => a + b, 0) / n : null;
  const stdev =
    n >= 2 && mean != null
      ? Math.sqrt(vals.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1))
      : null;
  const cv = stdev != null && mean ? stdev / mean : null;
  const withCost = v.filter((c) => c.cost != null);
  const cost = withCost.reduce((a, c) => a + (c.cost as number), 0);
  const costKm = withCost.reduce((a, c) => a + (c.distanceKm ?? 0), 0);
  const costL = withCost.reduce((a, c) => a + (c.liters ?? 0), 0);
  let confidence: Confidence = "insuficiente";
  if (n >= 5 && cv != null && cv <= 0.08) confidence = "alta";
  else if (n >= 3 && (cv == null || cv <= 0.12)) confidence = "media";
  else if (n >= 2) confidence = "baixa";
  return {
    n,
    km,
    liters,
    kmPerL: liters > 0 ? km / liters : null,
    mean,
    stdev,
    cv,
    costPerKm: costKm > 0 ? cost / costKm : null,
    weightedPricePerL: costL > 0 ? cost / costL : null,
    confidence,
  };
}

export type StationRank = { stationId: string; fuelType: FuelType; stats: GroupStats; cycles: Cycle[] };

/** Agrupa somente ciclos válidos de posto único, segmentados por combustível. */
export function stationRanking(cycles: Cycle[]): StationRank[] {
  const map = new Map<string, StationRank>();
  for (const c of cycles) {
    if (c.status !== "valido" || c.attribution.kind !== "posto_unico" || !c.fuelType) continue;
    const key = `${c.attribution.stationId}|${c.fuelType}`;
    const cur = map.get(key) ?? { stationId: c.attribution.stationId, fuelType: c.fuelType, stats: groupStats([]), cycles: [] };
    cur.cycles.push(c);
    map.set(key, cur);
  }
  return [...map.values()]
    .map((r) => ({ ...r, stats: groupStats(r.cycles) }))
    .sort((a, b) => (b.stats.kmPerL ?? 0) - (a.stats.kmPerL ?? 0));
}

/* ------------------------------ contexto ------------------------------ */

export type CycleContext = {
  tripCount: number;
  routeType: RouteType | null;
  acShare: number | null;
  avgOccupants: number | null;
};

export function cycleContext(c: Cycle, trips: Trip[], now = Date.now()): CycleContext {
  const end = c.endAt ?? now;
  const inside = trips.filter((t) => t.startedAt >= c.startAt && t.startedAt <= end);
  if (inside.length === 0) return { tripCount: 0, routeType: null, acShare: null, avgOccupants: null };
  const byRoute = new Map<RouteType, number>();
  for (const t of inside)
    byRoute.set(t.checklist.routeType, (byRoute.get(t.checklist.routeType) ?? 0) + t.distanceKm);
  const routeType = [...byRoute.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const occ = inside.map((t) => t.checklist.occupants).filter((x): x is number => x != null);
  return {
    tripCount: inside.length,
    routeType,
    acShare: inside.filter((t) => t.checklist.acOn).length / inside.length,
    avgOccupants: occ.length ? occ.reduce((a, b) => a + b, 0) / occ.length : null,
  };
}

/* ------------------------------ alertas ------------------------------ */

export type YieldAlert = { stationId: string; fuelType: FuelType; message: string };

/**
 * Queda relevante: só com ≥4 ciclos no grupo e o último ciclo com o mesmo tipo de
 * trajeto predominante dos anteriores. Nunca afirma causa.
 */
export function yieldDropAlerts(
  ranking: StationRank[],
  ctxOf: (c: Cycle) => CycleContext,
): YieldAlert[] {
  const out: YieldAlert[] = [];
  for (const r of ranking) {
    if (r.cycles.length < 4) continue;
    const sorted = [...r.cycles].sort((a, b) => (a.endAt ?? 0) - (b.endAt ?? 0));
    const last = sorted[sorted.length - 1]!;
    const prior = sorted.slice(0, -1);
    const ps = groupStats(prior);
    if (ps.mean == null || ps.stdev == null || last.kmPerL == null) continue;
    const lastCtx = ctxOf(last);
    const priorRoutes = prior.map((c) => ctxOf(c).routeType).filter(Boolean);
    if (!lastCtx.routeType || !priorRoutes.length || priorRoutes.some((x) => x !== lastCtx.routeType))
      continue;
    const threshold = Math.max(2 * ps.stdev, 0.08 * ps.mean);
    if (ps.mean - last.kmPerL > threshold)
      out.push({
        stationId: r.stationId,
        fuelType: r.fuelType,
        message: `Último ciclo (${last.kmPerL.toFixed(2)} km/L) abaixo da média anterior (${ps.mean.toFixed(2)} km/L) em condições de trajeto semelhantes. Observação estatística; não indica fraude, adulteração ou defeito.`,
      });
  }
  return out;
}