import { defaultChecklist } from "./defaults";
import { elevationGainM, totalDistanceKm } from "./geo";
import { emptyDb, readDb, uid, writeDb, type DbShape } from "./store";
import type { Evidence, Fueling, TrackPoint, Trip } from "./types";

const DAY = 86_400_000;

function makeTrack(startAt: number, minutes: number, baseKmh: number, seed: number): TrackPoint[] {
  const points: TrackPoint[] = [];
  let lat = -23.5615;
  let lon = -46.6559;
  const stepSeconds = 15;
  const total = (minutes * 60) / stepSeconds;
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  for (let i = 0; i < total; i++) {
    const wobble = (rnd() - 0.5) * baseKmh * 0.35;
    const kmh = Math.max(0, baseKmh + wobble);
    const ms = kmh / 3.6;
    const distKm = (ms * stepSeconds) / 1000;
    const heading = (i / total) * Math.PI * 1.4 + seed;
    lat += (distKm / 111) * Math.cos(heading);
    lon += (distKm / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(heading);
    points.push({
      t: startAt + i * stepSeconds * 1000,
      lat,
      lon,
      speed: ms,
      altitude: 760 + Math.sin(i / 12) * 25 + rnd() * 3,
      accuracy: 5 + rnd() * 6,
    });
  }
  return points;
}

function buildTrip(
  label: string,
  startAt: number,
  minutes: number,
  baseKmh: number,
  seed: number,
  overrides: Partial<Trip>,
  checklist: Partial<ReturnType<typeof defaultChecklist>>,
): Trip {
  const points = makeTrack(startAt, minutes, baseKmh, seed);
  const distanceKm = totalDistanceKm(points);
  const speeds = points.map((p) => (p.speed ?? 0) * 3.6);
  const hours = minutes / 60;
  return {
    id: uid("trip"),
    label,
    startedAt: startAt,
    endedAt: startAt + minutes * 60_000,
    points,
    distanceKm,
    maxSpeedKmh: Math.max(...speeds),
    avgSpeedKmh: distanceKm / hours,
    movingSeconds: minutes * 60,
    elevationGainM: elevationGainM(points),
    odometerStart: null,
    odometerEnd: null,
    indicatedKmPerL: null,
    litersUsedEstimate: null,
    finished: true,
    syncState: "local",
    checklist: { ...defaultChecklist(), ...checklist },
    ...overrides,
  };
}

function demoEvidence(
  tripId: string | null,
  fuelingId: string | null,
  category: Evidence["category"],
  at: number,
  lat: number,
  lon: number,
  hashSeed: string,
): Evidence {
  // Hash de demonstração: identifica claramente que não há arquivo original.
  const hash = Array.from(hashSeed + at.toString(36))
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("")
    .padEnd(64, "0")
    .slice(0, 64);
  return {
    id: uid("ev"),
    tripId,
    fuelingId,
    category,
    fileName: `demo-${category}.jpg`,
    mimeType: "image/jpeg",
    sizeBytes: 1_842_000,
    capturedAt: at,
    lat,
    lon,
    sha256: hash,
    inAppCapture: true,
    note: "Registro de demonstração (sem arquivo real anexado).",
    syncState: "local",
  };
}

export function seedDemoData(force = false) {
  const current = readDb();
  if (current.demoSeeded && !force) return;
  const now = Date.now();

  const t1 = buildTrip(
    "Rodovia — referência",
    now - 9 * DAY,
    46,
    82,
    7,
    { odometerStart: 51_200, odometerEnd: 51_263, litersUsedEstimate: 4.6, indicatedKmPerL: 15.2 },
    {
      tirePressurePsi: { frontLeft: 32, frontRight: 32, rearLeft: 30, rearRight: 30 },
      tireMeasuredAt: "frio",
      recommendedFrontPsi: null,
      recommendedRearPsi: null,
      ambientTempC: 24,
      occupants: 1,
      estimatedLoadKg: 10,
      acOn: false,
      initialFuelLevelPct: 80,
      fuelType: "gasolina",
      coldStart: true,
      driveMode: "normal",
      windows: "fechadas",
      roadCondition: "seco",
      traffic: "livre",
      routeType: "rodoviario",
      notes: "Viagem de referência para comparação.",
    },
  );

  const t2 = buildTrip(
    "Rodovia — repetição com AC",
    now - 5 * DAY,
    48,
    80,
    23,
    { odometerStart: 51_540, odometerEnd: 51_602, litersUsedEstimate: 5.4, indicatedKmPerL: 14.1 },
    {
      tirePressurePsi: { frontLeft: 29, frontRight: 33, rearLeft: 30, rearRight: 30 },
      tireMeasuredAt: "quente",
      recommendedFrontPsi: null,
      recommendedRearPsi: null,
      ambientTempC: 31,
      occupants: 3,
      estimatedLoadKg: 60,
      acOn: true,
      acTempC: 20,
      initialFuelLevelPct: 60,
      fuelType: "gasolina",
      coldStart: false,
      driveMode: "normal",
      windows: "fechadas",
      roadCondition: "seco",
      traffic: "moderado",
      routeType: "rodoviario",
      notes: "Mesma rota, condições diferentes.",
    },
  );

  const t3 = buildTrip(
    "Urbano — deslocamento diário",
    now - 2 * DAY,
    34,
    28,
    41,
    { odometerStart: 51_780, odometerEnd: 51_796, litersUsedEstimate: 2.1, indicatedKmPerL: 8.9 },
    {
      tirePressurePsi: { frontLeft: 31, frontRight: 31, rearLeft: 29, rearRight: 29 },
      tireMeasuredAt: "frio",
      recommendedFrontPsi: null,
      recommendedRearPsi: null,
      ambientTempC: 22,
      occupants: 2,
      estimatedLoadKg: 20,
      acOn: true,
      acTempC: 22,
      initialFuelLevelPct: 45,
      fuelType: "etanol",
      coldStart: true,
      driveMode: "eco",
      windows: "parcial",
      roadCondition: "chuva_leve",
      traffic: "intenso",
      routeType: "urbano",
      notes: "Trânsito pesado no horário de pico.",
    },
  );

  const trips = [t3, t2, t1];

  // Abastecimentos FICTÍCIOS (demonstração), coerentes com um Tiggo 7 Sport 1.5 TCI Flex.
  // Casos: posto único sucessivo (A gasolina), mistura de postos (A→B com parcial),
  // troca de combustível (etanol parcial em ciclo de gasolina) e posto com amostra insuficiente.
  const stA = { id: "st_demo_a", name: "Posto Fictício Alfa (demo)", address: "Av. Exemplo, 100", city: "São Paulo/SP", brand: "Bandeira Demo 1", cnpj: "", localId: "ALFA", favorite: true, lat: -23.561, lon: -46.656, source: "manual" as const, createdAt: now - 80 * DAY, demo: true };
  const stB = { id: "st_demo_b", name: "Posto Fictício Beta (demo)", address: "Rua Modelo, 250", city: "São Paulo/SP", brand: "Bandeira Demo 2", cnpj: "", localId: "BETA", favorite: false, lat: -23.57, lon: -46.64, source: "manual" as const, createdAt: now - 80 * DAY, demo: true };
  const stC = { id: "st_demo_c", name: "Posto Fictício Gama (demo)", address: "Estrada Teste, km 12", city: "Jundiaí/SP", brand: "", cnpj: "", localId: "GAMA", favorite: false, lat: -23.18, lon: -46.88, source: "manual" as const, createdAt: now - 80 * DAY, demo: true };
  type Spec = [string, "gasolina" | "etanol", boolean, number, number, number];
  // [posto, combustível, cheio, km desde o anterior, km/L do trecho, preço/L]
  const specs: Spec[] = [
    ["A", "gasolina", true, 0, 11, 6.09],
    ["A", "gasolina", true, 480, 11.2, 6.09],
    ["A", "gasolina", true, 462, 10.9, 6.15],
    ["A", "gasolina", true, 505, 11.4, 6.15],
    ["A", "gasolina", true, 470, 11.0, 6.19],
    ["B", "gasolina", true, 455, 10.8, 5.99],
    ["B", "gasolina", false, 180, 10.5, 5.99],
    ["B", "gasolina", true, 300, 10.6, 5.99],
    ["C", "etanol", false, 200, 9.5, 4.19],
    ["C", "gasolina", true, 260, 10.2, 6.29],
    ["C", "etanol", true, 330, 9.8, 4.29],
    ["C", "etanol", true, 340, 7.7, 4.29],
    ["B", "etanol", true, 335, 7.9, 4.15],
    ["B", "etanol", true, 352, 7.8, 4.15],
  ];
  const stMap: Record<string, typeof stA> = { A: stA, B: stB, C: stC };
  let odo = 48_200;
  const span = 75 * DAY;
  const demoFuelings: Fueling[] = specs.map(([st, fuel, full, km, kmpl, price], i) => {
    odo += km;
    const liters = i === 0 ? 45 : Number((km / kmpl).toFixed(2));
    return {
      id: uid("fuel"),
      at: now - span + Math.round((i / (specs.length - 1)) * (span - DAY)),
      odometer: odo,
      liters,
      pricePerLiter: price,
      totalValue: Number((liters * price).toFixed(2)),
      station: stMap[st]!.name,
      stationId: stMap[st]!.id,
      fullTank: full,
      fuelType: fuel,
      tripId: null,
      note: "Registro fictício de demonstração.",
      syncState: "local",
      demo: true,
    };
  });
  const f2 = demoFuelings[1]!;

  const evidences: Evidence[] = [
    demoEvidence(t1.id, null, "painel", t1.startedAt + 1000, t1.points[0]!.lat, t1.points[0]!.lon, "painel1"),
    demoEvidence(t1.id, null, "pneus", t1.startedAt - 60_000, t1.points[0]!.lat, t1.points[0]!.lon, "pneus1"),
    demoEvidence(t2.id, null, "painel", t2.startedAt + 1000, t2.points[0]!.lat, t2.points[0]!.lon, "painel2"),
    demoEvidence(t3.id, null, "evento", t3.startedAt + 600_000, t3.points[10]!.lat, t3.points[10]!.lon, "evento3"),
    demoEvidence(null, f2.id, "bomba", f2.at, -23.55, -46.64, "bomba2"),
  ];

  const next: DbShape = {
    ...emptyDb(),
    ...current,
    trips: [...trips, ...current.trips],
    fuelings: [...demoFuelings, ...current.fuelings].sort((a, b) => b.at - a.at),
    evidences: [...evidences, ...current.evidences],
    stations: [stA, stB, stC, ...(current.stations ?? []).filter((x) => !x.demo)],
    vehicle: {
      name: "CAOA Chery Tiggo 7 Sport 2026 1.5 TCI Flex (demo)",
      plate: "ABC1D23",
      recommendedFrontPsi: null,
      recommendedRearPsi: null,
      tankLiters: null,
    },
    demoSeeded: true,
    activeTripId: current.activeTripId,
  };
  writeDb(next);
}