import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/dp/supabase";
import { APP_VERSION, readDb, writeDb, type DbShape } from "@/lib/dp/store";
import { Button } from "@/components/ui/button";

type BackupRow = { snapshot: DbShape; saved_at: string };
const MAX_BYTES = 4_000_000;

export function CloudBackup({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);

  async function saveBackup() {
    const snapshot = readDb();
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
    if (bytes > MAX_BYTES) {
      toast.error("Registros grandes demais para o backup inicial. Nenhum dado foi alterado.");
      return;
    }
    if (!window.confirm("Salvar uma cópia dos registros deste aparelho na sua conta DriveProof? Um backup anterior nesta conta será substituído.")) return;
    setBusy(true);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || auth.user?.id !== userId) throw new Error("Sessão não confirmada. Entre novamente.");
      const { error } = await supabase.from("local_backups").upsert({
        user_id: userId,
        snapshot,
        app_version: APP_VERSION,
        saved_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw error;
      toast.success("Backup concluído na nuvem. Os registros do aparelho foram preservados.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar o backup.");
    } finally {
      setBusy(false);
    }
  }

  async function restoreBackup() {
    const current = readDb();
    if (current.activeTripId || current.trips.length || current.fuelings.length ||
        current.evidences.length || current.stations.length) {
      toast.error("Restauração bloqueada: este aparelho já contém registros. Nenhum dado foi substituído.");
      return;
    }
    setBusy(true);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || auth.user?.id !== userId) throw new Error("Sessão não confirmada. Entre novamente.");
      const { data, error } = await supabase.from("local_backups")
        .select("snapshot,saved_at").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.error("Esta conta ainda não possui backup.");
        return;
      }
      const backup = data as BackupRow;
      const snapshot = backup.snapshot;
      if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.trips) ||
          !Array.isArray(snapshot.fuelings) || !Array.isArray(snapshot.evidences) ||
          !Array.isArray(snapshot.stations) || !snapshot.vehicle) {
        throw new Error("Formato de backup inválido. Nada foi restaurado.");
      }
      if (!window.confirm("Restaurar o backup de " + new Date(backup.saved_at).toLocaleString("pt-BR") +
        "? A operação só é permitida quando não há registros neste aparelho.")) return;
      // Keep the local snapshot until the browser confirms that the restored copy fits.
      const key = "driveproof:v1";
      const previous = window.localStorage.getItem(key);
      try {
        window.localStorage.setItem(key, JSON.stringify(snapshot));
      } catch (e) {
        if (previous === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, previous);
        throw e;
      }
      writeDb(snapshot);
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
        Protege registros de viagens, pontos GPS, abastecimentos, postos e metadados das
        evidências. Os arquivos originais de fotos não são incluídos. O backup não
        é sincronização automática e pode substituir uma cópia anterior.
      </p>
      <Button type="button" className="min-h-12 w-full" disabled={busy} onClick={saveBackup}>
        {busy ? "Aguarde…" : "Salvar backup na nuvem"}
      </Button>
      <Button type="button" variant="outline" className="min-h-12 w-full" disabled={busy} onClick={restoreBackup}>
        Restaurar backup neste aparelho vazio
      </Button>
    </div>
  );
}
