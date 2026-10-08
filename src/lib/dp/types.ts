// Modelos de dados do DriveProof.
// Tudo é local por padrão. Campos "syncState" existem para uma futura
// sincronização opcional (fase 2) e para uma futura fase OBD-II.

export type SyncState = "local" | "pending" | "synced";

export type TirePressures = {
  frontLeft: number | null;
  frontRight: number | null;
  rearLeft: number | null;
  rearRight: number | null;
};

export type TireCondition = "frio" | "quente" | "nao_informado";
export type FuelType = "gasolina" | "etanol" | "mistura" | "diesel" | "gnv" | "nao_informado";
export type DriveMode = "eco" | "normal" | "sport" | "nao_aplicavel";
export type RouteType = "urbano" | "rodoviario" | "misto";
export type TrafficLevel = "livre" | "moderado" | "intenso";
export type RoadCondition = "seco" | "chuva_leve" | "chuva_forte" | "piso_molhado";
export type WindowState = "fechadas" | "abertas" | "parcial";

export type Checklist = {
  tirePressurePsi: TirePressures;
  tireMeasuredAt: TireCondition;
  recommendedFrontPsi: number | null;
  recommendedRearPsi: number | null;
  ambientTempC: number | null;
  occupants: number | null;
  estimatedLoadKg: number | null;
  acOn: boolean;
  acTempC: number | null;
  initialFuelLevelPct: number | null;
  fuelType: FuelType;
  coldStart: boolean;
  driveMode: DriveMode;
  windows: WindowState;
  roadCondition: RoadCondition;
  traffic: TrafficLevel;
  routeType: RouteType;
  notes: string;
};

export type TrackPoint = {
  t: number; // epoch ms
  lat: number;
  lon: number;
  /** m/s conforme a API de geolocalização */
  speed: number | null;
  altitude: number | null;
  accuracy: number | null;
};

export type EvidenceCategory = "painel" | "bomba" | "pneus" | "evento" | "outro";

export type Evidence = {
  id: string;
  tripId: string | null;
  fuelingId: string | null;
  category: EvidenceCategory;
  /** Nome original do arquivo, quando houver */
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  capturedAt: number;
  lat: number | null;
  lon: number | null;
  sha256: string;
  /** true quando a imagem veio da câmera do próprio app */
  inAppCapture: boolean;
  note: string;
  syncState: SyncState;
};

export type Trip = {
  id: string;
  label: string;
  startedAt: number;
  endedAt: number | null;
  points: TrackPoint[];
  distanceKm: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  movingSeconds: number;
  elevationGainM: number | null;
  odometerStart: number | null;
  odometerEnd: number | null;
  /** consumo indicado pelo computador de bordo, digitado pelo usuário */
  indicatedKmPerL: number | null;
  litersUsedEstimate: number | null;
  checklist: Checklist;
  finished: boolean;
  syncState: SyncState;
};

export type Fueling = {
  id: string;
  at: number;
  odometer: number | null;
  liters: number | null;
  pricePerLiter: number | null;
  totalValue: number | null;
  /** nome do posto (legado / exibição) */
  station: string;
  stationId?: string | null;
  /** nível do tanque antes de abastecer, opcional */
  tankLevelPct?: number | null;
  /** registro fictício de demonstração */
  demo?: boolean;
  fullTank: boolean;
  fuelType: FuelType;
  tripId: string | null;
  note: string;
  syncState: SyncState;
};

export type Vehicle = {
  name: string;
  plate: string;
  recommendedFrontPsi: number | null;
  recommendedRearPsi: number | null;
  tankLiters: number | null;
};

export type ManifestEntry = {
  evidenceId: string;
  sha256: string;
  category: EvidenceCategory;
  capturedAt: number;
  lat: number | null;
  lon: number | null;
  fileName: string;
  sizeBytes: number;
};

export type TripManifest = {
  tripId: string;
  generatedAt: number;
  appVersion: string;
  entries: ManifestEntry[];
  trackHash: string;
  manifestHash: string;
};

export type Station = {
  id: string;
  name: string;
  address: string;
  city: string;
  brand: string;
  cnpj: string;
  /** identificador local definido pelo usuário ou id externo do mapa */
  localId: string;
  favorite: boolean;
  lat: number | null;
  lon: number | null;
  source: "manual" | "sugestao_gps_confirmada";
  createdAt: number;
  demo?: boolean;
};