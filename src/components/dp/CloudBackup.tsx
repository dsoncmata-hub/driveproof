import { useState } from "react";
import { toast } from "sonner";
import { checkCloudIdentity } from "@/lib/dp/cloudSync";
import { supabase } from "@/lib/dp/supabase";
import { APP_VERSION, readDb, writeDb, type DbShape } from "@/lib/dp/store";
import { Button } from "@/components/ui/button";

type BackupRow = { snapshot: DbShape; saved_at: string };
const MAX_BYTES = 4_000_000;

export function CloudBackup({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);

  async function saveBackup() {
    const snapshot = readDb();
    if (snapshot.activeTripId) {
      toast.error("Finalize ou descarte a viagem em andamento antes de salvar o backup.");
      return;
    }
    const hasRecords =
      snapshot.trips.length +
        snapshot.fuelings.length +
        snapshot.evidences.length +
        snapshot.stations.length >
      0;
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
    if (bytes > MAX_BYTES) {
      toast.error("Registros grandes demais para o backup inicial. Nenhum dado foi alterado.");
      return;
    }
    if (
      !window.confirm(
        "Salvar uma cópia dos registros deste aparelho na sua conta CARVRUM? Um backup anterior nesta conta será substituído.",
      )
    )
      return;
    setBusy(true);
    try {
      await checkCloudIdentity(userId);
      const { data: previousBackup, error: lookupError } = await supabase
        .from("local_backups")
        .select("saved_at,snapshot")
        .eq("user_id", userId)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!hasRecords && previousBackup) {
        throw new Error(
          "Backup não enviado: este aparelho não contém registros e já existe uma cópia na nuvem.",
        );
      }
      const { error } = await supabase.from("local_backups").upsert(
        {
          user_id: userId,
          snapshot,
          app_version: APP_VERSION,
          saved_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      const { data: verified, error: verifyError } = await supabase
        .from("local_backups")
        .select("saved_at")
        .eq("user_id", userId)
        .single();
      if (verifyError || !verified)
        throw new Error("O backup foi enviado, mas não foi possível confirmar a gravação.");
      toast.success("Backup concluído na nuvem. Os registros do aparelho foram preservados.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar o backup.");
    } finally {
      setBusy(false);
    }
  }

  async function restoreBackup() {
    const current = readDb();
    if (
      current.activeTripId ||
      current.trips.length ||
      current.fuelings.length ||
      current.evidences.length ||
      current.stations.length
    ) {
      toast.error(
        "Restauração bloqueada: este aparelho já contém registros. Nenhum dado foi substituído.",
      );
      return;
    }
    setBusy(true);
    try {
      await checkCloudIdentity(userId);
      const { data, error } = await supabase
        .from("local_backups")
        .select("snapshot,saved_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.error("Esta conta ainda não possui backup.");
        return;
      }
      const backup = data as BackupRow;
      const snapshot = backup.snapshot;
      if (
        !snapshot ||
        snapshot.version !== 1 ||
        !Array.isArray(snapshot.trips) ||
        !Array.isArray(snapshot.fuelings) ||
        !Array.isArray(snapshot.evidences) ||
        !Array.isArray(snapshot.stations) ||
        !snapshot.vehicle
      ) {
        throw new Error("Formato de backup inválido. Nada foi restaurado.");
      }
      if (
        !window.confirm(
          "Restaurar o backup de " +
            new Date(backup.saved_at).toLocaleString("pt-BR") +
            "? A operação só é permitida quando não há registros neste aparelho.",
        )
      )
        return;
      await checkCloudIdentity(userId);
      if (
        readDb().trips.length ||
        readDb().fuelings.length ||
        readDb().evidences.length ||
        readDb().stations.length ||
        readDb().activeTripId
      )
        throw Error("Os registros locais mudaram. Nada foi substituído.");
      await writeDb(snapshot);
      toast.success("Backup restaurado neste aparelho.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao restaurar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-secondary/30 p-3">
      <p className="text-sm font-semibold">Backup manual na nuvem</p>
      <p className="text-xs text-muted-foreground">
        Protege registros de viagens, pontos GPS, abastecimentos, postos e metadados das evidências.
        Os arquivos originais de fotos não são incluídos. O backup não é sincronização automática e
        pode substituir uma cópia anterior.
      </p>
      <Button type="button" className="min-h-12 w-full" disabled={busy} onClick={saveBackup}>
        {busy ? "Aguarde…" : "Salvar backup na nuvem"}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full"
        disabled={busy}
        onClick={restoreBackup}
      >
        Restaurar backup neste aparelho vazio
      </Button>
    </div>
  );
}
