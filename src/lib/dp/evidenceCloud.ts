import { supabase } from "./supabase";
import { getBlob, putBlob } from "./blobs";
import { sha256OfBlob } from "./hash";
import { checkCloudIdentity } from "./cloudSync";
import type { Evidence } from "./types";

export const EVIDENCE_BUCKET = "driveproof-evidence";
export const MAX_EVIDENCE_SIZE = 20 * 1024 * 1024;
export const EVIDENCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
export function evidenceObjectPath(userId: string, e: Evidence) {
  if (
    !/^[a-zA-Z0-9_-]+$/.test(userId) ||
    !/^[a-zA-Z0-9_-]+$/.test(e.id) ||
    !/^[a-f0-9]{64}$/i.test(e.sha256)
  ) {
    throw Error("Identificador de evidência inválido.");
  }
  return userId + "/" + e.id + "/" + e.sha256;
}
export async function verifyEvidenceBlob(e: Evidence, blob: Blob): Promise<boolean> {
  return (
    EVIDENCE_TYPES.has(e.mimeType) &&
    blob.type === e.mimeType &&
    blob.size === e.sizeBytes &&
    blob.size > 0 &&
    blob.size <= MAX_EVIDENCE_SIZE &&
    (await sha256OfBlob(blob)).toLowerCase() === e.sha256.toLowerCase()
  );
}

async function downloadVerified(userId: string, e: Evidence): Promise<Blob> {
  await checkCloudIdentity(userId);
  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .download(evidenceObjectPath(userId, e));
  if (error) throw error;
  if (!data || !(await verifyEvidenceBlob(e, data)))
    throw Error("Arquivo remoto não confere com o SHA-256 registrado.");
  await checkCloudIdentity(userId);
  return data;
}

export async function recoverEvidence(
  userId: string,
  e: Evidence,
): Promise<"present" | "recovered"> {
  await checkCloudIdentity(userId);
  const local = await getBlob(e.id);
  if (local) {
    if (!(await verifyEvidenceBlob(e, local)))
      throw Error("Original local inválido; preservado para análise, sem substituição automática.");
    return "present";
  }
  const cloud = await downloadVerified(userId, e);
  if (await getBlob(e.id))
    throw Error("O arquivo local mudou durante a recuperação. Tente novamente.");
  await checkCloudIdentity(userId);
  await putBlob(e.id, cloud);
  return "recovered";
}

export async function uploadEvidence(
  userId: string,
  e: Evidence,
): Promise<"missing" | "existing" | "sent"> {
  await checkCloudIdentity(userId);
  const local = await getBlob(e.id);
  if (!local) return "missing";
  if (!(await verifyEvidenceBlob(e, local)))
    throw Error("Original local inválido ou fora dos limites permitidos.");
  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(evidenceObjectPath(userId, e), local, {
      contentType: e.mimeType,
      cacheControl: "3600",
      upsert: false,
    });
  if (error && !/already exists|duplicate|409/i.test(error.message)) throw error;
  // A duplicate path or successful upload alone is not proof of an intact original.
  await downloadVerified(userId, e);
  return error ? "existing" : "sent";
}
