import type { TrackPoint } from "./types";

export const MS_TO_KMH = 3.6;

/** Distância em km entre dois pontos (Haversine). */
export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function totalDistanceKm(points: TrackPoint[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const d = haversineKm(a, b);
    // descarta saltos improváveis (ruído de GPS): > 1 km entre amostras
    if (d < 1) sum += d;
  }
  return sum;
}

export function elevationGainM(points: TrackPoint[]): number | null {
  const withAlt = points.filter((p) => typeof p.altitude === "number");
  if (withAlt.length < 2) return null;
  let gain = 0;
  for (let i = 1; i < withAlt.length; i++) {
    const diff = (withAlt[i]!.altitude as number) - (withAlt[i - 1]!.altitude as number);
    if (diff > 0.5) gain += diff;
  }
  return Math.round(gain);
}

export function speedKmh(p: TrackPoint): number {
  return typeof p.speed === "number" && p.speed >= 0 ? p.speed * MS_TO_KMH : 0;
}

/** Normaliza o trajeto para coordenadas de um SVG (viewBox 0..100). */
export function trackToPolyline(points: TrackPoint[], size = 100, pad = 6): string {
  if (points.length < 2) return "";
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const spanLat = Math.max(maxLat - minLat, 1e-6);
  const spanLon = Math.max(maxLon - minLon, 1e-6);
  const span = Math.max(spanLat, spanLon);
  const inner = size - pad * 2;
  return points
    .map((p) => {
      const x = pad + ((p.lon - minLon) / span) * inner;
      const y = pad + inner - ((p.lat - minLat) / span) * inner;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}