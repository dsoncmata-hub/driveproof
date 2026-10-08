import { haversineKm } from "./geo";

export type NearbySuggestion = {
  externalId: string;
  name: string;
  brand: string;
  address: string;
  city: string;
  cnpj: string;
  lat: number;
  lon: number;
  distanceKm: number;
};

export type NearbyResult =
  | { ok: true; items: NearbySuggestion[]; accuracyM: number | null }
  | { ok: false; reason: string };

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 30_000,
    }),
  );
}

/**
 * Busca até 3 postos próximos em base pública de mapas (OpenStreetMap/Overpass).
 * Só deve ser chamado após consentimento explícito. Resultado é SUGESTÃO:
 * o usuário precisa confirmar o posto.
 */
export async function findNearbyStations(): Promise<NearbyResult> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator))
    return { ok: false, reason: "GPS indisponível neste navegador. Use o cadastro manual." };
  let pos: GeolocationPosition;
  try {
    pos = await getPosition();
  } catch {
    return {
      ok: false,
      reason:
        "Não foi possível obter a localização (permissão negada, sinal fraco ou limitação do navegador no iPhone). Use o cadastro manual.",
    };
  }
  const { latitude: lat, longitude: lon, accuracy } = pos.coords;
  const q = `[out:json][timeout:10];nwr["amenity"="fuel"](around:3000,${lat},${lon});out center 30;`;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(q),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as {
      elements: Array<{ id: number; type: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }>;
    };
    const items = json.elements
      .map((e) => {
        const p = e.center ?? (e.lat != null && e.lon != null ? { lat: e.lat, lon: e.lon } : null);
        if (!p) return null;
        const t = e.tags ?? {};
        return {
          externalId: `osm:${e.type}/${e.id}`,
          name: (t["name"] ?? t["brand"] ?? "Posto sem nome no mapa").slice(0, 120),
          brand: (t["brand"] ?? "").slice(0, 60),
          address: [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", ").slice(0, 160),
          city: (t["addr:city"] ?? "").slice(0, 80),
          cnpj: (t["ref:vatin"] ?? t["ref:CNPJ"] ?? "").replace(/\D/g, "").slice(0, 14),
          lat: p.lat,
          lon: p.lon,
          distanceKm: haversineKm({ lat, lon }, p),
        } satisfies NearbySuggestion;
      })
      .filter((x): x is NearbySuggestion => x != null)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 3);
    if (items.length === 0)
      return { ok: false, reason: "Nenhum posto encontrado no mapa num raio de 3 km. Use o cadastro manual." };
    return { ok: true, items, accuracyM: accuracy ?? null };
  } catch {
    return { ok: false, reason: "Serviço de mapas indisponível ou sem internet. Use o cadastro manual." };
  }
}

export function validCnpj(v: string): boolean {
  const d = v.replace(/\D/g, "");
  return d === "" || d.length === 14;
}