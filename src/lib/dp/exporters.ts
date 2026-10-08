import type { DbShape } from "./store";
import { tankToTankConsumption, tripPhysicalKmPerL, deviation } from "./analysis";
import { fmtDateTime } from "./format";

export function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvEscape).join(";")).join("\r\n");
}

export function exportTripsCsv(db: DbShape) {
  const header = [
    "id",
    "rotulo",
    "inicio",
    "fim",
    "distancia_gps_km",
    "vel_media_kmh",
    "vel_max_kmh",
    "hodometro_inicial",
    "hodometro_final",
    "litros_informados",
    "consumo_fisico_km_l",
    "consumo_indicado_km_l",
    "diferenca_km_l",
    "diferenca_pct",
    "psi_de",
    "psi_dd",
    "psi_te",
    "psi_td",
    "psi_recomendado_diant",
    "psi_recomendado_tras",
    "medicao_pneus",
    "ocupantes",
    "carga_kg",
    "ac_ligado",
    "ac_temp_c",
    "temp_ambiente_c",
    "combustivel",
    "partida_frio",
    "modo_conducao",
    "janelas",
    "via",
    "transito",
    "trajeto",
    "ganho_altimetrico_m",
    "evidencias",
  ];
  const rows = db.trips.map((t) => {
    const phys = tripPhysicalKmPerL(t);
    const dev = deviation(phys, t.indicatedKmPerL);
    const c = t.checklist;
    return [
      t.id,
      t.label,
      fmtDateTime(t.startedAt),
      fmtDateTime(t.endedAt),
      t.distanceKm.toFixed(3),
      t.avgSpeedKmh.toFixed(1),
      t.maxSpeedKmh.toFixed(1),
      t.odometerStart ?? "",
      t.odometerEnd ?? "",
      t.litersUsedEstimate ?? "",
      phys?.toFixed(2) ?? "",
      t.indicatedKmPerL ?? "",
      dev?.abs.toFixed(2) ?? "",
      dev?.pct.toFixed(1) ?? "",
      c.tirePressurePsi.frontLeft ?? "",
      c.tirePressurePsi.frontRight ?? "",
      c.tirePressurePsi.rearLeft ?? "",
      c.tirePressurePsi.rearRight ?? "",
      c.recommendedFrontPsi ?? "",
      c.recommendedRearPsi ?? "",
      c.tireMeasuredAt,
      c.occupants ?? "",
      c.estimatedLoadKg ?? "",
      c.acOn ? "sim" : "nao",
      c.acTempC ?? "",
      c.ambientTempC ?? "",
      c.fuelType,
      c.coldStart ? "sim" : "nao",
      c.driveMode,
      c.windows,
      c.roadCondition,
      c.traffic,
      c.routeType,
      t.elevationGainM ?? "",
      db.evidences.filter((e) => e.tripId === t.id).length,
    ];
  });
  download("driveproof-viagens.csv", "\uFEFF" + toCsv([header, ...rows]), "text/csv;charset=utf-8");
}

export function exportFuelingsCsv(db: DbShape) {
  const header = [
    "id",
    "data",
    "hodometro",
    "litros",
    "preco_litro",
    "valor_total",
    "posto",
    "tanque_cheio",
    "combustivel",
    "observacao",
  ];
  const rows = db.fuelings.map((f) => [
    f.id,
    fmtDateTime(f.at),
    f.odometer ?? "",
    f.liters ?? "",
    f.pricePerLiter ?? "",
    f.totalValue ?? "",
    f.station,
    f.fullTank ? "sim" : "nao",
    f.fuelType,
    f.note,
  ]);
  const seg = tankToTankConsumption(db.fuelings);
  const segHeader = ["", "", "", "", "", "", "", "", "", ""];
  const segRows: unknown[][] = [
    segHeader,
    ["Trechos bomba-a-bomba (somente entre tanques cheios)"],
    ["ate", "distancia_km", "litros", "km_por_litro", "custo_por_km"],
    ...seg.map((s) => [
      fmtDateTime(s.at),
      s.distanceKm.toFixed(1),
      s.liters.toFixed(2),
      s.kmPerL.toFixed(2),
      s.costPerKm?.toFixed(3) ?? "",
    ]),
  ];
  download(
    "driveproof-abastecimentos.csv",
    "\uFEFF" + toCsv([header, ...rows, ...segRows]),
    "text/csv;charset=utf-8",
  );
}

export function exportEvidenceManifestCsv(db: DbShape, tripId?: string) {
  const header = [
    "id",
    "viagem",
    "abastecimento",
    "categoria",
    "arquivo",
    "capturado_em",
    "latitude",
    "longitude",
    "sha256",
    "bytes",
    "captura_no_app",
    "observacao",
  ];
  const rows = db.evidences
    .filter((e) => !tripId || e.tripId === tripId)
    .map((e) => [
      e.id,
      e.tripId ?? "",
      e.fuelingId ?? "",
      e.category,
      e.fileName,
      fmtDateTime(e.capturedAt),
      e.lat ?? "",
      e.lon ?? "",
      e.sha256,
      e.sizeBytes,
      e.inAppCapture ? "sim" : "nao",
      e.note,
    ]);
  download(
    "driveproof-evidencias.csv",
    "\uFEFF" + toCsv([header, ...rows]),
    "text/csv;charset=utf-8",
  );
}

/**
 * PDF via diálogo de impressão do navegador ("Salvar como PDF").
 * É o caminho viável em PWA/iOS sem dependências nativas.
 */
export function printToPdf() {
  if (typeof window !== "undefined") window.print();
}