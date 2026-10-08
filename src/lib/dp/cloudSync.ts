import { supabase } from "./supabase";
import { readDb, writeDb, type DbShape } from "./store";
import { canonical, parseSnapshot } from "./snapshot";
import { planMerge, type Choice, type Conflict } from "./reconcile";
import { localScope } from "./accountScope";
import { auxiliaryGet, auxiliaryPut } from "./localRecords";
import { hydrateRemoteSnapshot, prepareRemoteSnapshot } from "./trackCloud";

export const MAX_SNAPSHOT_BYTES = 4_000_000;
export const revisionKey = (userId: string) => "driveproof:auto-sync:revision:" + userId;
const baseKey = (userId: string) => "driveproof:sync-base:" + userId;
const hasRecords = (db: DbShape) =>
  !!(db.trips.length || db.fuelings.length || db.evidences.length || db.stations.length);
export function assertLocalOwner(userId: string) {
  if (localScope() !== userId)
    throw Error("Conta diferente do espaço local aberto. Operação bloqueada.");
}

export async function checkCloudIdentity(userId: string) {
  const { data, error } = await supabase.auth.getUser();
  if (error || data.user?.id !== userId) throw Error("Sessão não confirmada. Entre novamente.");
  assertLocalOwner(userId);
}

export async function acknowledge(userId: string, revision: number, snapshot: DbShape) {
  if (!Number.isSafeInteger(revision) || revision < 1) throw Error("Revisão inválida.");
  await auxiliaryPut("sync", userId + ":base", { revision, snapshot });
  localStorage.setItem(revisionKey(userId), String(revision));
}

export async function readBase(userId: string): Promise<DbShape | null> {
  const saved = await auxiliaryGet<{ revision: number; snapshot: DbShape }>(
    "sync",
    userId + ":base",
  );
  const legacy = localStorage.getItem(baseKey(userId));
  const base = saved ?? (legacy ? JSON.parse(legacy) : null);
  return base && base.revision === Number(localStorage.getItem(revisionKey(userId)))
    ? parseSnapshot(base.snapshot)
    : null;
}

const locks = new Set<string>();
export async function withCloudLock<T>(userId: string, task: () => Promise<T>): Promise<T> {
  if (navigator.locks) return navigator.locks.request("carvrum:cloud:" + userId, task);
  if (locks.has(userId)) throw Error("Outra sincronização está em andamento. Aguarde.");
  locks.add(userId);
  try {
    return await task();
  } finally {
    locks.delete(userId);
  }
}

export type SyncResult = {
  conflicts: Conflict[];
  snapshot: DbShape;
  revision: number;
  status: string;
};
export async function syncRecords(
  userId: string,
  choices: Record<string, Choice> = {},
  expectedReview?: { local: string; revision: number },
): Promise<SyncResult> {
  return withCloudLock(userId, async () => {
    await checkCloudIdentity(userId);
    const local = parseSnapshot(readDb()),
      localJson = canonical(local);
    if (local.activeTripId) throw Error("Viagem em andamento: sincronização pausada.");
    const { data: row, error } = await supabase
      .from("cloud_sync_state")
      .select("revision,snapshot")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    const revision = row ? Number(row.revision) : 0;
    if (!Number.isSafeInteger(revision) || revision < 0) throw Error("Revisão remota inválida.");
    if (
      expectedReview &&
      (expectedReview.revision !== revision || expectedReview.local !== localJson)
    ) {
      throw Error("Os dados mudaram desde a revisão. Confira os conflitos novamente.");
    }
    if (!row && !hasRecords(local))
      return { conflicts: [], snapshot: local, revision, status: "Sem registros para enviar" };
    const remote = row ? await hydrateRemoteSnapshot(userId, row.snapshot) : null;
    const plan = remote
      ? planMerge(local, remote, await readBase(userId), choices)
      : { snapshot: local, conflicts: [] };
    if (plan.conflicts.length)
      return { ...plan, revision, status: "Conflitos aguardam sua escolha" };
    const transport = await prepareRemoteSnapshot(userId, plan.snapshot);
    if (new TextEncoder().encode(JSON.stringify(transport)).length > MAX_SNAPSHOT_BYTES) {
      throw Error(
        "Limite de metadados atingido. Nenhum registro foi removido; entre em contato com suporte.",
      );
    }
    await checkCloudIdentity(userId);
    if (canonical(readDb()) !== localJson)
      throw Error("Dados locais mudaram. Sincronização será repetida.");
    if (Object.keys(choices).length && remote) {
      // Store both versions BEFORE a conflict resolution can replace the remote copy.
      // If there is no room, abort before the CAS request and preserve both live copies.
      await auxiliaryPut("reviews", userId + ":" + crypto.randomUUID(), {
        at: Date.now(),
        local,
        cloud: remote,
        choices,
      });
      window.dispatchEvent(new Event("carvrum:conflict-archive"));
    }
    let updatedRevision = revision;
    if (
      !remote ||
      canonical(plan.snapshot) !== canonical(remote) ||
      row?.snapshot?.syncProtocol !== 2
    ) {
      const { data, error: uploadError } = await supabase.rpc("cloud_sync_upload_v2", {
        expected_revision: revision,
        new_snapshot: transport,
      });
      if (uploadError) throw uploadError;
      if (!data) throw Error("Outro aparelho alterou a nuvem. Tente sincronizar novamente.");
      updatedRevision = Number(data);
    }
    await checkCloudIdentity(userId);
    // Preserve edits made during the request; do not replace them with the earlier snapshot.
    if (canonical(readDb()) !== localJson) {
      if (canonical(local) !== canonical(plan.snapshot)) {
        // A cloud merge occurred while local data changed: leave the old base for a fresh merge.
        throw Error(
          "Novos registros locais preservados. Sincronize novamente para concluir a conciliação.",
        );
      }
      await acknowledge(userId, updatedRevision, plan.snapshot);
      return {
        ...plan,
        revision: updatedRevision,
        status: "Enviado; novas alterações aguardam sincronização",
      };
    }
    // Persist merged records before acknowledging; quota failures keep the old base.
    if (canonical(readDb()) !== canonical(plan.snapshot)) await writeDb(plan.snapshot);
    await acknowledge(userId, updatedRevision, plan.snapshot);
    return {
      ...plan,
      revision: updatedRevision,
      status: "Registros sincronizados entre aparelhos",
    };
  });
}
