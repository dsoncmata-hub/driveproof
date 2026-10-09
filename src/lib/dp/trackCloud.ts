import { z } from "zod";
import { pointSchema, parseSnapshot } from "./snapshot";
import { checkCloudIdentity } from "./cloudSync";
import { supabase } from "./supabase";
import { sha256OfBlob } from "./hash";
import { auxiliaryGet, auxiliaryPut, POINTS_PER_BLOCK } from "./localRecords";
import type { DbShape } from "./store";
import type { TrackPoint } from "./types";

export const TRACK_BUCKET = "carvrum-tracks";
const blockSchema = z.array(pointSchema).min(1).max(POINTS_PER_BLOCK);
const path = (user: string, trip: string, hash: string) => {
  if (
    !/^[a-zA-Z0-9_-]+$/.test(user) ||
    !/^[a-zA-Z0-9_-]+$/.test(trip) ||
    !/^[a-f0-9]{64}$/.test(hash)
  )
    throw Error("Identificador de trajeto inválido.");
  return user + "/" + trip + "/" + hash + ".json";
};
async function verifiedBlock(blob: Blob, hash: string, count: number): Promise<TrackPoint[]> {
  if (blob.size > 1_000_000 || (await sha256OfBlob(blob)) !== hash)
    throw Error("Integridade do bloco GPS inválida. Nenhum trajeto foi substituído.");
  const points = blockSchema.parse(JSON.parse(await blob.text()));
  if (points.length !== count) throw Error("Bloco GPS incompleto.");
  return points;
}
async function readBlock(user: string, trip: string, hash: string, count: number) {
  const key = user + ":" + trip + ":" + hash;
  const cached = await auxiliaryGet<Blob>("track-cache", key);
  if (cached) {
    try {
      return await verifiedBlock(cached, hash, count);
    } catch {
      /* Recover a damaged cache from the immutable remote copy. */
    }
  }
  await checkCloudIdentity(user);
  const { data, error } = await supabase.storage
    .from(TRACK_BUCKET)
    .download(path(user, trip, hash));
  if (error) throw error;
  if (!data) throw Error("Bloco GPS indisponível na nuvem.");
  const points = await verifiedBlock(data, hash, count);
  await checkCloudIdentity(user);
  await auxiliaryPut("track-cache", key, data);
  return points;
}

/** Stage immutable blocks before CAS; an interrupted upload leaves the old snapshot usable. */
export async function prepareRemoteSnapshot(user: string, snapshot: DbShape): Promise<DbShape> {
  const trips = [];
  for (const trip of snapshot.trips) {
    if (!trip.points.length) {
      trips.push(trip);
      continue;
    }
    const trackChunks = [];
    for (let start = 0; start < trip.points.length; start += POINTS_PER_BLOCK) {
      const points = trip.points.slice(start, start + POINTS_PER_BLOCK);
      const blob = new Blob([JSON.stringify(points)], { type: "application/json" });
      const hash = await sha256OfBlob(blob),
        key = user + ":" + trip.id + ":" + hash;
      const cached = await auxiliaryGet<Blob>("track-cache", key);
      if (!cached || (await sha256OfBlob(cached)) !== hash) {
        await checkCloudIdentity(user);
        const { error } = await supabase.storage
          .from(TRACK_BUCKET)
          .upload(path(user, trip.id, hash), blob, {
            contentType: "application/json",
            upsert: false,
          });
        if (error && !/already exists|duplicate|409/i.test(error.message)) throw error;
        if (error) await readBlock(user, trip.id, hash, points.length);
        else await auxiliaryPut("track-cache", key, blob);
      }
      trackChunks.push({ hash, count: points.length });
    }
    trips.push({ ...trip, points: [], trackChunks });
  }
  return { ...snapshot, trips, syncProtocol: 2 } as DbShape;
}

export async function hydrateRemoteSnapshot(user: string, raw: unknown): Promise<DbShape> {
  const parsed = parseSnapshot(raw);
  const { syncProtocol: unusedProtocol, ...snapshot } = parsed as DbShape & {
    syncProtocol?: number;
  };
  const total = snapshot.trips.reduce(
    (n, t) => n + (t.trackChunks?.reduce((a, c) => a + c.count, 0) ?? t.points.length),
    0,
  );
  if (total > 1_000_000)
    throw Error("Trajeto excede o limite de memória deste aparelho; use exportação assistida.");
  const trips = [];
  for (const trip of snapshot.trips) {
    if (!trip.trackChunks) {
      trips.push(trip);
      continue;
    }
    const points: TrackPoint[] = [];
    for (const chunk of trip.trackChunks)
      points.push(...(await readBlock(user, trip.id, chunk.hash, chunk.count)));
    if (points.some((p, i) => i > 0 && p.t <= points[i - 1]!.t))
      throw Error("Ordem dos pontos GPS inválida na nuvem.");
    const { trackChunks: unused, ...fields } = trip;
    trips.push({ ...fields, points });
  }
  return parseSnapshot({ ...snapshot, trips });
}
