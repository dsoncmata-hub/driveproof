import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addFueling, readDb, update, useDb, uid } from "@/lib/dp/store";
import { syncRecords } from "@/lib/dp/cloudSync";

const MAX_BYTES = 4_000_000;

export function CloudAutoSync({ userId }: { userId: string }) {
  const db = useDb();
  const enabledKey = "driveproof:auto-sync:" + userId;
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("Desativada");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const blocked = useRef(false);

  useEffect(() => {
    setEnabled(localStorage.getItem(enabledKey) === "on");
    setReady(true);
    setStatus(localStorage.getItem(enabledKey) === "on" ? "Aguardando alterações" : "Desativada");
    blocked.current = false;
  }, [enabledKey]);

  const validateAndUpload = useCallback(async () => {
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
    inFlight.current = true;
    setStatus("Sincronizando…");
    try {
      const result = await syncRecords(userId);
      setStatus(
        result.conflicts.length
          ? "Conflitos detectados. Abra Conciliar registros para escolher as versões."
          : result.status,
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Falha de conexão. Registros locais preservados.");
    } finally {
      inFlight.current = false;
    }
  }, [userId]);

  useEffect(() => {
    if (!ready || !enabled || blocked.current) return;
    const id = window.setTimeout(() => {
      void validateAndUpload();
    }, 2500);
    return () => clearTimeout(id);
  }, [db, enabled, ready, validateAndUpload]);

  useEffect(() => {
    if (!ready || !enabled) return;
    const retry = () => {
      if (document.visibilityState === "visible") void validateAndUpload();
    };
    const timer = window.setInterval(retry, 15_000);
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
  }, [enabled, ready, validateAndUpload]);

  function createTest() {
    if (!enabled) {
      toast.error("Ative a sincronização antes do teste.");
      return;
    }
    if (db.activeTripId) {
      toast.error("Finalize a viagem em andamento antes do teste.");
      return;
    }
    if (db.fuelings.some((f) => f.id.startsWith("dp_sync_test_"))) {
      toast.error("Já existe um registro de teste neste aparelho.");
      return;
    }
    if (
      !window.confirm(
        "Criar um abastecimento fictício sem litros, preço ou quilometragem para testar o envio à nuvem? Ele ficará identificado como DEMONSTRAÇÃO.",
      )
    )
      return;
    addFueling({
      id: uid("dp_sync_test"),
      at: Date.now(),
      odometer: null,
      liters: null,
      pricePerLiter: null,
      totalValue: null,
      station: "TESTE DE SINCRONIZAÇÃO — NÃO É ABASTECIMENTO REAL",
      fullTank: false,
      fuelType: "nao_informado",
      tripId: null,
      note: "DEMONSTRAÇÃO: registro criado exclusivamente para teste de sincronização automática.",
      demo: true,
      syncState: "local",
    });
    toast.success("Registro fictício criado. Aguarde o status 'Sincronizado na nuvem'.");
  }

  function removeTest() {
    const count = db.fuelings.filter((f) => f.demo && f.id.startsWith("dp_sync_test_")).length;
    if (!count) return;
    if (
      !window.confirm(
        "Remover somente " +
          count +
          " registro(s) fictício(s) deste teste? Os abastecimentos reais não serão alterados.",
      )
    )
      return;
    update((d) => ({
      ...d,
      fuelings: d.fuelings.filter((f) => !(f.demo && f.id.startsWith("dp_sync_test_"))),
    }));
    toast.success("Teste removido localmente. Aguarde sincronização da alteração.");
  }

  function activate() {
    if (
      !window.confirm(
        "Ativar cópia automática dos seus dados de viagem e localização na nuvem? Seus registros existentes serão preservados. Conflitos bloqueiam o envio para evitar perdas.",
      )
    )
      return;
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
        Após ativar, envia cópias dos registros concluídos quando o aplicativo estiver aberto e
        conectado. Alterações independentes são conciliadas; versões incompatíveis aguardam sua
        escolha em Conciliar registros. Fotos originais são gerenciadas abaixo.
      </p>
      <p className="text-xs" role="status">
        {status}
      </p>
      {enabled && (
        <div className="space-y-2 rounded-md border border-dashed border-border p-2">
          <p className="text-xs font-semibold">Teste controlado de sincronização</p>
          <p className="text-xs text-muted-foreground">
            Cria um abastecimento de demonstração sem valores reais. Aguarde a confirmação do envio
            antes de removê-lo. Não clique em salvar backup manual durante o teste.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={createTest}
            disabled={busy || db.fuelings.some((f) => f.demo && f.id.startsWith("dp_sync_test_"))}
          >
            Criar registro fictício de teste
          </Button>
          {db.fuelings.some((f) => f.demo && f.id.startsWith("dp_sync_test_")) && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={removeTest}
              disabled={busy}
            >
              Remover somente o registro de teste
            </Button>
          )}
        </div>
      )}
      {enabled ? (
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={deactivate}>
            Desativar
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void validateAndUpload().finally(() => setBusy(false));
            }}
          >
            Tentar enviar
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" className="min-h-12 w-full" onClick={activate}>
          Ativar sincronização automática
        </Button>
      )}
    </div>
  );
}
