import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/dp/supabase";
import { readDb, useDb } from "@/lib/dp/store";

const MAX_BYTES = 4_000_000;
function hasRecords() {
  const d = readDb();
  return !!(d.trips.length || d.fuelings.length || d.evidences.length || d.stations.length);
}

export function CloudAutoSync({ userId }: { userId: string }) {
  const db = useDb();
  const enabledKey = "driveproof:auto-sync:" + userId;
  const revisionKey = "driveproof:auto-sync:revision:" + userId;
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("Desativada");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const lastUploaded = useRef<string | null>(null);
  const inFlight = useRef(false);
  const blocked = useRef(false);

  useEffect(() => {
    setEnabled(localStorage.getItem(enabledKey) === "on");
    setReady(true);
    setStatus(localStorage.getItem(enabledKey) === "on" ? "Aguardando alterações" : "Desativada");
    lastUploaded.current = null;
    blocked.current = false;
  }, [enabledKey]);

  async function validateAndUpload() {
    if (inFlight.current || blocked.current) return;
    const snapshot = readDb();
    if (snapshot.activeTripId) {
      setStatus("Viagem em andamento: envio pausado");
      return;
    }
    const json = JSON.stringify(snapshot);
    if (new TextEncoder().encode(json).length > MAX_BYTES) {
      setStatus("Limite de 4 MB atingido. Faça backup e entre em contato com suporte.");
      blocked.current = true;
      return;
    }
    if (lastUploaded.current === json) return;
    inFlight.current = true;
    setStatus("Sincronizando…");
    try {
      const { data: account, error: accountError } = await supabase.auth.getUser();
      if (accountError || account.user?.id !== userId) throw Error("Sessão não confirmada");
      const { data: remote, error: remoteError } = await supabase
        .from("cloud_sync_state").select("revision,snapshot").eq("user_id", userId).maybeSingle();
      if (remoteError) throw remoteError;

      // Never overwrite a cloud copy until this device has an acknowledged revision.
      const storedRevision = Number(localStorage.getItem(revisionKey) ?? "0");
      if (remote && (!storedRevision || storedRevision !== Number(remote.revision))) {
        blocked.current = true;
        setStatus("Conflito detectado: cópia da nuvem diferente. Envio interrompido para proteger seus dados.");
        return;
      }

      // Do not initialize the cloud with an empty device.
      if (!remote && !hasRecords()) {
        setStatus("Sem registros para enviar");
        return;
      }
      const { data: revision, error } = await supabase.rpc("cloud_sync_upload", {
        expected_revision: remote ? storedRevision : 0,
        new_snapshot: snapshot,
      });
      if (error) throw error;
      if (!revision) {
        blocked.current = true;
        setStatus("Conflito de versão. Sincronização interrompida; seus registros locais continuam intactos.");
        return;
      }
      localStorage.setItem(revisionKey, String(revision));
      lastUploaded.current = json;
      setStatus("Sincronizado na nuvem");
    } catch (e) {
      setStatus("Sem conexão ou falha de envio: dados preservados neste aparelho");
    } finally {
      inFlight.current = false;
    }
  }

  useEffect(() => {
    if (!ready || !enabled || blocked.current) return;
    const id = window.setTimeout(() => { void validateAndUpload(); }, 2500);
    return () => clearTimeout(id);
  }, [db, enabled, ready, userId]);

  function activate() {
    if (!window.confirm("Ativar cópia automática dos seus dados de viagem e localização na nuvem? Seus registros existentes serão preservados. Conflitos bloqueiam o envio para evitar perdas.")) return;
    blocked.current = false;
    setEnabled(true);
    localStorage.setItem(enabledKey, "on");
    setStatus("Aguardando envio seguro");
  }
  function deactivate() {
    localStorage.removeItem(enabledKey);
    setEnabled(false);
    blocked.current = false;
    setStatus("Desativada");
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-sm font-semibold">Sincronização automática (experimental)</p>
      <p className="text-xs text-muted-foreground">
        Após ativar, envia cópias dos registros concluídos quando o aplicativo estiver
        aberto e conectado. Não faz restauração ou mesclagem automática entre aparelhos.
        Conflitos interrompem o envio; fotos originais não estão incluídas.
      </p>
      <p className="text-xs" role="status">{status}</p>
      {enabled ? (
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={deactivate}>Desativar</Button>
          <Button type="button" className="flex-1" disabled={busy} onClick={() => {
            setBusy(true);
            void validateAndUpload().finally(() => setBusy(false));
          }}>Tentar enviar</Button>
        </div>
      ) : (
        <Button type="button" variant="outline" className="min-h-12 w-full" onClick={activate}>
          Ativar sincronização automática
        </Button>
      )}
    </div>
  );
}
