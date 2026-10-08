import type { Checklist, Vehicle } from "./types";

export function defaultChecklist(vehicle?: Vehicle): Checklist {
  return {
    tirePressurePsi: { frontLeft: null, frontRight: null, rearLeft: null, rearRight: null },
    tireMeasuredAt: "nao_informado",
    recommendedFrontPsi: vehicle?.recommendedFrontPsi ?? null,
    recommendedRearPsi: vehicle?.recommendedRearPsi ?? null,
    ambientTempC: null,
    occupants: null,
    estimatedLoadKg: null,
    acOn: false,
    acTempC: null,
    initialFuelLevelPct: null,
    fuelType: "nao_informado",
    coldStart: false,
    driveMode: "nao_aplicavel",
    windows: "fechadas",
    roadCondition: "seco",
    traffic: "moderado",
    routeType: "misto",
    notes: "",
  };
}

export const LABELS = {
  fuelType: {
    gasolina: "Gasolina",
    etanol: "Etanol",
    mistura: "Mistura",
    diesel: "Diesel",
    gnv: "GNV",
    nao_informado: "Não informado",
  },
  driveMode: { eco: "Eco", normal: "Normal", sport: "Sport", nao_aplicavel: "Não se aplica" },
  routeType: { urbano: "Urbano", rodoviario: "Rodoviário", misto: "Misto" },
  traffic: { livre: "Livre", moderado: "Moderado", intenso: "Intenso" },
  roadCondition: {
    seco: "Seco",
    chuva_leve: "Chuva leve",
    chuva_forte: "Chuva forte",
    piso_molhado: "Piso molhado",
  },
  windows: { fechadas: "Fechadas", abertas: "Abertas", parcial: "Parcial" },
  tireMeasuredAt: { frio: "Pneus frios", quente: "Pneus quentes", nao_informado: "Não informado" },
  evidence: {
    painel: "Painel",
    bomba: "Bomba",
    pneus: "Pneus",
    evento: "Evento",
    outro: "Outro",
  },
} as const;

export const TIRE_LABELS: Array<{ key: keyof Checklist["tirePressurePsi"]; label: string; axle: "front" | "rear" }> = [
  { key: "frontLeft", label: "Dianteiro esquerdo", axle: "front" },
  { key: "frontRight", label: "Dianteiro direito", axle: "front" },
  { key: "rearLeft", label: "Traseiro esquerdo", axle: "rear" },
  { key: "rearRight", label: "Traseiro direito", axle: "rear" },
];