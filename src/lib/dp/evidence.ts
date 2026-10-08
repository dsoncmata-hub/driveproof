import { putBlob } from "./blobs";
import { sha256OfBlob } from "./hash";
import { addEvidence, uid } from "./store";
import type { Evidence, EvidenceCategory } from "./types";
import { EVIDENCE_TYPES, MAX_EVIDENCE_SIZE } from "./evidenceCloud";
import { locationAllowed } from "./privacy";
import { scopeGeneration } from "./accountScope";

export async function currentPosition(): Promise<GeolocationPosition | null> {
  if (!locationAllowed()) return null;
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 },
    );
  });
}

/**
 * Registra um arquivo como evidência: calcula SHA-256 do binário original,
 * grava o original inalterado no armazenamento local e guarda os metadados.
 */
export async function registerEvidence(opts: {
  file: File | Blob;
  fileName?: string;
  category: EvidenceCategory;
  tripId?: string | null;
  fuelingId?: string | null;
  inAppCapture: boolean;
  note?: string;
  position?: GeolocationPosition | null;
}): Promise<Evidence> {
  const generation = scopeGeneration();
  if (
    !EVIDENCE_TYPES.has(opts.file.type) ||
    opts.file.size <= 0 ||
    opts.file.size > MAX_EVIDENCE_SIZE
  ) {
    throw Error("Use JPEG, PNG, WebP ou PDF de até 20 MB. O original não foi alterado.");
  }
  const pos = opts.position ?? (await currentPosition());
  const sha256 = await sha256OfBlob(opts.file);
  if (generation !== scopeGeneration())
    throw Error("A conta mudou durante a captura. Nenhuma evidência foi vinculada.");
  const id = uid("ev");
  await putBlob(id, opts.file);
  if (generation !== scopeGeneration())
    throw Error("A conta mudou durante a captura. O original permanece no espaço anterior.");
  const evidence: Evidence = {
    id,
    tripId: opts.tripId ?? null,
    fuelingId: opts.fuelingId ?? null,
    category: opts.category,
    fileName:
      opts.fileName ?? (opts.file instanceof File ? opts.file.name : `${opts.category}.jpg`),
    mimeType: opts.file.type || "image/jpeg",
    sizeBytes: opts.file.size,
    capturedAt: Date.now(),
    lat: pos?.coords.latitude ?? null,
    lon: pos?.coords.longitude ?? null,
    sha256,
    inAppCapture: opts.inAppCapture,
    note: opts.note ?? "",
    syncState: "local",
  };
  await addEvidence(evidence);
  return evidence;
}
