import { useState } from "react";
import { toast } from "sonner";
import { acknowledge, checkCloudIdentity, withCloudLock } from "@/lib/dp/cloudSync";
import { hydrateRemoteSnapshot } from "@/lib/dp/trackCloud";
import { EvidenceCapture } from "@/components/dp/EvidenceCapture";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/dp/supabase";
import { uploadEvidence, recoverEvidence, repairEvidence } from "@/lib/dp/evidenceCloud";
import { readDb, writeDb, useDb, type DbShape } from "@/lib/dp/store";
import type { Evidence } from "@/lib/dp/types";

export function CloudEvidenceSync({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const db = useDb();
  const [status, setStatus] = useState("Fotos originais ainda não enviadas ou verificadas.");

  async function checkIdentity() {
    await checkCloudIdentity(userId);
  }

  async function upload() {
    const evidence = [...readDb().evidences];
    if (!evidence.length) {
      setStatus("Nenhuma evidência cadastrada.");
      return;
    }
    if (
      !window.confirm(
        "Enviar os arquivos originais das evidências deste aparelho para seu espaço privado no Supabase? Inclui fotografias e dados de localização vinculados. Os arquivos locais serão preservados.",
      )
    )
      return;
    setBusy(true);
    let sent = 0,
      existing = 0,
      missing = 0,
      failed = 0;
    try {
      await checkIdentity();
      for (const e of evidence) {
        try {
          const result = await uploadEvidence(userId, e);
          if (result === "missing") missing++;
          else if (result === "existing") existing++;
          else sent++;
        } catch {
          failed++;
        }
      }
      setStatus(
        "Novos arquivos enviados: " +
          sent +
          " · Já existentes na nuvem: " +
          existing +
          " · Sem original neste aparelho: " +
          missing +
          " · Falhas: " +
          failed +
          ".",
      );
      if (failed) toast.error("Algumas fotografias falharam. Confira o resumo.");
      else if (sent > 0) toast.success(sent + " foto(s) original(is) enviada(s) para a nuvem.");
      else if (existing > 0) toast.info("Nenhuma foto nova: os arquivos já estão na nuvem.");
      else
        toast.warning(
          "Nenhuma fotografia enviada. As evidências podem ser demonstrações sem arquivo original.",
        );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao autenticar envio.");
    } finally {
      setBusy(false);
    }
  }

  async function receiveNewEvidence() {
    setBusy(true);
    try {
      await checkIdentity();
      const { data, error } = await supabase
        .from("cloud_sync_state")
        .select("revision,snapshot")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setStatus("Não há cópia sincronizada na nuvem.");
        return;
      }
      const cloud = await hydrateRemoteSnapshot(userId, data.snapshot);
      const local = readDb();
      if (
        !cloud ||
        cloud.version !== 1 ||
        !Array.isArray(cloud.evidences) ||
        !Array.isArray(cloud.trips) ||
        !Array.isArray(cloud.fuelings) ||
        !Array.isArray(cloud.stations) ||
        !cloud.vehicle ||
        !Number.isSafeInteger(data.revision) ||
        data.revision < 1
      ) {
        throw Error("Formato inesperado na nuvem. Nenhum dado foi alterado.");
      }
      // Never overwrite different local records. Only accept a remote snapshot whose
      // unrelated fields are identical and whose evidences include all local evidence.
      const withoutEvidence = (d: DbShape) => {
        const { evidences: unused, ...rest } = d;
        return JSON.stringify(rest);
      };
      if (withoutEvidence(local) !== withoutEvidence(cloud)) {
        throw Error(
          "Há diferenças em viagens, abastecimentos ou configurações. Atualização bloqueada para preservar os dados.",
        );
      }
      const remoteById = new Map(cloud.evidences.map((e) => [e.id, e]));
      if (
        local.evidences.some((e) => {
          const match = remoteById.get(e.id);
          return !match || JSON.stringify(e) !== JSON.stringify(match);
        })
      )
        throw Error("Conflito entre evidências locais e remotas. Nenhum dado foi alterado.");

      const added = cloud.evidences.filter((e) => !local.evidences.some((x) => x.id === e.id));
      if (!added.length) {
        setStatus("Nenhuma evidência nova na nuvem.");
        return;
      }
      if (
        !window.confirm(
          "Receber " +
            added.length +
            " nova(s) evidência(s) da nuvem? Os arquivos locais não serão excluídos ou substituídos.",
        )
      )
        return;
      const latest = readDb();
      if (JSON.stringify(latest) !== JSON.stringify(local)) {
        throw Error("Os registros mudaram durante a confirmação. Tente novamente.");
      }
      await checkIdentity();
      if (JSON.stringify(readDb()) !== JSON.stringify(local))
        throw Error("Dados locais mudaram. Tente novamente.");
      await writeDb(cloud);
      await acknowledge(userId, Number(data.revision), cloud);
      toast.success(added.length + " evidência(s) recebida(s). Agora recupere as fotos ausentes.");
      setStatus(
        added.length +
          " evidência(s) atualizada(s). Clique em Recuperar fotos ausentes neste aparelho.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao atualizar evidências.");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    const evidence = [...readDb().evidences];
    if (!evidence.length) {
      setStatus("Nenhuma evidência cadastrada.");
      return;
    }
    if (
      !window.confirm(
        "Baixar fotos originais das evidências que estão ausentes neste aparelho? Os arquivos já existentes não serão substituídos.",
      )
    )
      return;
    setBusy(true);
    let recovered = 0,
      present = 0,
      unavailable = 0;
    try {
      await checkIdentity();
      for (const e of evidence) {
        try {
          const result = await recoverEvidence(userId, e);
          if (result === "present") present++;
          else recovered++;
        } catch {
          unavailable++;
        }
      }
      setStatus(
        "Recuperação: " +
          recovered +
          " foto(s) recuperada(s), " +
          present +
          " já presente(s), " +
          unavailable +
          " indisponível(is)/inválida(s). Miniaturas atualizadas automaticamente.",
      );
      if (unavailable) toast.error("Algumas fotos ainda não estão disponíveis na nuvem.");
      else toast.success("Arquivos originais conferidos pelo SHA-256.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao recuperar fotos.");
    } finally {
      setBusy(false);
    }
  }

  async function repair() {
    if (
      !window.confirm(
        "Conferir e reparar originais locais inválidos usando a cópia privada da nuvem? Cada arquivo divergente será preservado numa área de recuperação antes da substituição. Arquivos sem cópia válida na nuvem permanecem intactos.",
      )
    )
      return;
    setBusy(true);
    let repaired = 0;
    const failures: string[] = [];
    try {
      await checkIdentity();
      for (const evidence of [...readDb().evidences]) {
        try {
          if ((await repairEvidence(userId, evidence)) === "repaired") repaired++;
        } catch (error) {
          failures.push(
            evidence.fileName + ": " + (error instanceof Error ? error.message : "indisponível"),
          );
        }
      }
      setStatus(
        `${repaired} original(is) recuperado(s)/reparado(s). ${failures.length} falha(s).` +
          (failures.length ? " " + failures.join(" · ") : ""),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-sm font-semibold">Fotos originais das evidências</p>
      <p className="text-xs text-muted-foreground">
        Armazenamento privado e opcional. Os arquivos são conferidos com SHA-256 antes do envio e
        após o download. Somente JPEG, PNG, WebP ou PDF até 20 MB. Evidências apenas de demonstração
        podem não possuir arquivo original. Este botão envia fotos já anexadas às evidências; para
        adicionar uma foto nova, abra uma viagem ou abastecimento e use a captura de evidência.
      </p>
      <div className="space-y-2 rounded-md border border-dashed border-border p-2">
        <p className="text-xs font-semibold">
          Cadastrar fotografia de teste (sem viagem vinculada)
        </p>
        <p className="text-xs text-muted-foreground">
          Escolha a categoria e use a câmera ou selecione um arquivo. Primeiro a foto será salva
          neste aparelho; depois clique em Enviar fotos originais para a nuvem.
        </p>
        <EvidenceCapture defaultCategory="outro" />
      </div>
      <p className="text-xs text-muted-foreground">
        {db.evidences.length} evidência(s) registrada(s) neste aparelho. As de demonstração podem
        não conter arquivo original.
      </p>
      <p className="text-xs" role="status">
        {status}
      </p>
      <Button
        type="button"
        className="min-h-12 w-full"
        disabled={busy}
        onClick={() => void withCloudLock(userId, upload)}
      >
        {busy ? "Processando…" : "Enviar fotos originais para a nuvem"}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full"
        disabled={busy}
        onClick={() => void withCloudLock(userId, receiveNewEvidence)}
      >
        Atualizar cadastro de evidências da nuvem
      </Button>
      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full"
        disabled={busy}
        onClick={() => void withCloudLock(userId, download)}
      >
        Recuperar fotos ausentes neste aparelho
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        className="min-h-12 w-full"
        onClick={() => void withCloudLock(userId, repair)}
      >
        Conferir e reparar originais inválidos
      </Button>
    </div>
  );
}
