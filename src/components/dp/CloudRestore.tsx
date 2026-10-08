import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acknowledge, checkCloudIdentity, withCloudLock } from "@/lib/dp/cloudSync";
import { parseSnapshot } from "@/lib/dp/snapshot";
import { supabase } from "@/lib/dp/supabase";
import { readDb, writeDb, type DbShape } from "@/lib/dp/store";

type CloudRow = { revision: number; updated_at: string; snapshot: DbShape };
const DB_KEY = "driveproof:v1";
const MAX_BYTES = 4_000_000;
const hasContent = (db: DbShape) =>
  !!(
    db.activeTripId ||
    db.trips.length ||
    db.fuelings.length ||
    db.evidences.length ||
    db.stations.length
  );

export function CloudRestore({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);

  async function restore() {
    if (hasContent(readDb())) {
      toast.error(
        "Recuperação bloqueada: este aparelho já possui registros. Nada foi substituído.",
      );
      return;
    }
    setBusy(true);
    try {
      await checkCloudIdentity(userId);
      const { data, error } = await supabase
        .from("cloud_sync_state")
        .select("revision,updated_at,snapshot")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.error("Nenhuma cópia sincronizada encontrada nesta conta.");
        return;
      }
      const row = data as CloudRow;
      if (!Number.isSafeInteger(row.revision) || row.revision < 1) {
        throw Error("A cópia na nuvem tem um formato inesperado. Nenhum dado foi alterado.");
      }
      row.snapshot = parseSnapshot(row.snapshot);
      if (row.snapshot.activeTripId) {
        throw Error(
          "Esta cópia contém viagem em andamento e não pode ser recuperada automaticamente.",
        );
      }
      const json = JSON.stringify(row.snapshot);
      if (new TextEncoder().encode(json).length > MAX_BYTES)
        throw Error("Cópia maior que o limite seguro deste dispositivo.");
      if (
        !row.snapshot.trips.length &&
        !row.snapshot.fuelings.length &&
        !row.snapshot.evidences.length &&
        !row.snapshot.stations.length
      ) {
        throw Error("A cópia na nuvem não possui registros para recuperar.");
      }
      const summary =
        row.snapshot.trips.length +
        " viagem(ns), " +
        row.snapshot.fuelings.length +
        " abastecimento(s) e " +
        row.snapshot.evidences.length +
        " evidência(s)";
      if (
        !window.confirm(
          "Recuperar " +
            summary +
            " da nuvem neste aparelho?\n" +
            "Somente um aparelho sem registros pode receber esta cópia.\n" +
            "As fotos originais não estão incluídas. Nenhum dado na nuvem será apagado.",
        )
      )
        return;
      // Race guard: no local data may be inserted while the confirmation is open.
      if (hasContent(readDb()))
        throw Error("Os dados locais mudaram. Recuperação cancelada sem substituições.");

      await checkCloudIdentity(userId);
      if (hasContent(readDb())) throw Error("Dados locais mudaram. Recuperação cancelada.");
      // Acknowledge the exact remote revision BEFORE store listeners schedule an upload.
      const revisionKey = "driveproof:auto-sync:revision:" + userId;
      const oldDb = localStorage.getItem(DB_KEY);
      const oldRevision = localStorage.getItem(revisionKey);
      try {
        localStorage.setItem(DB_KEY, json);
        localStorage.setItem(revisionKey, String(row.revision));
      } catch (e) {
        try {
          if (oldDb === null) localStorage.removeItem(DB_KEY);
          else localStorage.setItem(DB_KEY, oldDb);
          if (oldRevision === null) localStorage.removeItem(revisionKey);
          else localStorage.setItem(revisionKey, oldRevision);
        } catch {
          /* browser quota or blocked storage; avoid further changes */
        }
        throw e;
      }
      writeDb(row.snapshot);
      acknowledge(userId, row.revision, row.snapshot);
      toast.success("Registros recuperados da nuvem. Atualizando a tela…");
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível recuperar os dados.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-sm font-semibold">Recuperar dados sincronizados</p>
      <p className="text-xs text-muted-foreground">
        Disponível somente em aparelho sem viagens, abastecimentos, evidências ou postos. Mostra a
        quantidade de registros e pede confirmação antes de recuperar. Não mescla dados entre
        aparelhos e não inclui arquivos originais de fotos.
      </p>
      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full"
        disabled={busy}
        onClick={() => void withCloudLock(userId, restore)}
      >
        {busy ? "Verificando cópia…" : "Recuperar registros da nuvem"}
      </Button>
    </div>
  );
}
