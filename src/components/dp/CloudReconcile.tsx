import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/dp/supabase";
import { readDb, writeDb, type DbShape } from "@/lib/dp/store";

const LISTS = ["trips", "fuelings", "evidences", "stations"] as const;
type Collection = (typeof LISTS)[number];
type Item = { id: string };
type MergeResult = { snapshot: DbShape; addedFromCloud: number; addedToCloud: number };

function mergeAdditive(local: DbShape, cloud: DbShape): MergeResult {
  if (local.version !== 1 || cloud.version !== 1 || local.activeTripId || cloud.activeTripId) {
    throw Error("Versão incompatível ou viagem em andamento. Conciliação interrompida.");
  }
  if (JSON.stringify(local.vehicle) !== JSON.stringify(cloud.vehicle) ||
      local.notifPausedUntil !== cloud.notifPausedUntil) {
    throw Error("Configurações de veículo ou notificações diferentes. Nenhum dado foi substituído.");
  }
  const next: DbShape = { ...local, demoSeeded: local.demoSeeded || cloud.demoSeeded };
  let addedFromCloud = 0, addedToCloud = 0;
  for (const key of LISTS) {
    const current = local[key] as Item[];
    const remote = cloud[key] as Item[];
    const l = new Map(current.map(x => [x.id, x]));
    const r = new Map(remote.map(x => [x.id, x]));
    if (l.size !== current.length || r.size !== remote.length) throw Error("IDs duplicados em " + key + ".");
    for (const [id, item] of l) {
      const other = r.get(id);
      if (other && JSON.stringify(item) !== JSON.stringify(other)) {
        throw Error("Conflito de conteúdo no registro " + id + ". Nenhum dado foi alterado.");
      }
    }
    addedFromCloud += remote.filter(x => !l.has(x.id)).length;
    addedToCloud += current.filter(x => !r.has(x.id)).length;
    const merged = [...current, ...remote.filter(x => !l.has(x.id))];
    // The arrays share the same item identifier shape but have different domain types.
    (next as unknown as Record<Collection, Item[]>)[key] = merged;
  }
  return { snapshot: next, addedFromCloud, addedToCloud };
}

export function CloudReconcile({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Não iniciado");

  async function reconcile() {
    if (busy) return;
    setBusy(true);
    setMessage("Verificando dados…");
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || auth.user?.id !== userId) throw Error("Sessão não confirmada.");
      const local = readDb();
      const localJson = JSON.stringify(local);
      const { data: row, error } = await supabase.from("cloud_sync_state")
        .select("revision,snapshot").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      if (!row || !row.snapshot) throw Error("Não há registros sincronizados disponíveis.");
      const remote = row.snapshot as DbShape;
      if (!Array.isArray(remote.trips) || !Array.isArray(remote.fuelings) ||
          !Array.isArray(remote.evidences) || !Array.isArray(remote.stations) ||
          !remote.vehicle || !Number.isSafeInteger(row.revision)) throw Error("Dados remotos inválidos.");
      const merged = mergeAdditive(local, remote);
      if (!merged.addedFromCloud && !merged.addedToCloud) {
        // Equal records may have a newer revision; never acknowledge different content silently.
        setMessage("Nenhum registro novo. As duas cópias já contêm os mesmos IDs.");
        return;
      }
      const summary = "Receber " + merged.addedFromCloud + " registro(s) da nuvem e enviar " +
        merged.addedToCloud + " deste aparelho? Nenhum registro existente será excluído.";
      if (!window.confirm(summary)) { setMessage("Cancelado. Dados preservados."); return; }
      if (JSON.stringify(readDb()) !== localJson) throw Error("Dados locais mudaram. Tente novamente.");
      const mergedJson = JSON.stringify(merged.snapshot);
      if (new TextEncoder().encode(mergedJson).length > 4_000_000) throw Error("Limite seguro de sincronização excedido.");
      // Re-evaluate the current cloud revision atomically. On a concurrent write, the RPC
      // returns null and this device must not commit its provisional merge.
      const { data: updatedRevision, error: uploadError } = await supabase.rpc("cloud_sync_upload", {
        expected_revision: row.revision, new_snapshot: merged.snapshot,
      });
      if (uploadError) throw uploadError;
      if (!updatedRevision) throw Error("Outro aparelho alterou a nuvem. Nenhum registro local foi modificado.");
      const revisionKey = "driveproof:auto-sync:revision:" + userId;
      const priorData = localStorage.getItem("driveproof:v1");
      const priorRevision = localStorage.getItem(revisionKey);
      try {
        localStorage.setItem("driveproof:v1", mergedJson);
        localStorage.setItem(revisionKey, String(updatedRevision));
      } catch (storageError) {
        if (priorData == null) localStorage.removeItem("driveproof:v1");
        else localStorage.setItem("driveproof:v1", priorData);
        if (priorRevision == null) localStorage.removeItem(revisionKey);
        else localStorage.setItem(revisionKey, priorRevision);
        throw storageError;
      }
      writeDb(merged.snapshot);
      setMessage("Conciliação concluída: " + merged.addedFromCloud + " recebido(s), " +
        merged.addedToCloud + " enviado(s). Fotos originais devem ser recuperadas separadamente.");
      toast.success("Registros conciliados sem exclusões.");
      window.location.reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível conciliar.";
      setMessage(msg);
      toast.error(msg);
    } finally { setBusy(false); }
  }

  return <div className="space-y-2 rounded-md border border-border p-3">
    <p className="text-sm font-semibold">Conciliar registros de dois aparelhos (experimental)</p>
    <p className="text-xs text-muted-foreground">
      Une viagens, abastecimentos, evidências e postos com IDs diferentes, sem excluir itens.
      Se um mesmo ID tiver conteúdo diferente, a operação é bloqueada. Não altera veículo
      nem configurações divergentes e não baixa fotografias originais.
    </p>
    <p className="text-xs" role="status">{message}</p>
    <Button type="button" variant="outline" className="min-h-12 w-full" disabled={busy}
      onClick={() => void reconcile()}>{busy ? "Conferindo registros…" : "Verificar e conciliar registros"}</Button>
  </div>;
}
