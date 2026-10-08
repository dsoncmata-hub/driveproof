import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/dp/supabase";
import { getBlob, putBlob } from "@/lib/dp/blobs";
import { sha256OfBlob } from "@/lib/dp/hash";
import { readDb } from "@/lib/dp/store";
import type { Evidence } from "@/lib/dp/types";

const BUCKET = "driveproof-evidence";
const MAX_SIZE = 20 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
function objectPath(userId: string, e: Evidence) {
  // Immutable content-addressed path within the user's private folder.
  return userId + "/" + e.id + "/" + e.sha256;
}
function validate(e: Evidence, blob: Blob): string | null {
  if (!TYPES.has(e.mimeType) || blob.type !== e.mimeType) return "Tipo de arquivo incompatível";
  if (blob.size !== e.sizeBytes || blob.size > MAX_SIZE) return "Tamanho incompatível ou acima de 20 MB";
  return null;
}

export function CloudEvidenceSync({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Fotos originais ainda não enviadas ou verificadas.");

  async function checkIdentity() {
    const { data, error } = await supabase.auth.getUser();
    if (error || data.user?.id !== userId) throw Error("Sessão não confirmada. Entre novamente.");
  }

  async function upload() {
    const evidence = [...readDb().evidences];
    if (!evidence.length) {
      setStatus("Nenhuma evidência cadastrada.");
      return;
    }
    if (!window.confirm("Enviar os arquivos originais das evidências deste aparelho para seu espaço privado no Supabase? Inclui fotografias e dados de localização vinculados. Os arquivos locais serão preservados.")) return;
    setBusy(true);
    let sent = 0, missing = 0, failed = 0;
    try {
      await checkIdentity();
      for (const e of evidence) {
        try {
          const blob = await getBlob(e.id);
          if (!blob) { missing++; continue; }
          const problem = validate(e, blob);
          if (problem || (await sha256OfBlob(blob)) !== e.sha256) { failed++; continue; }
          const path = objectPath(userId, e);
          const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
            contentType: e.mimeType,
            cacheControl: "3600",
            upsert: false,
          });
          if (error && !/already exists|duplicate|409/i.test(error.message)) { failed++; continue; }
          sent++;
        } catch { failed++; }
      }
      setStatus("Envio finalizado: " + sent + " arquivo(s) enviado(s)/já presentes, " + missing +
        " ausente(s) neste aparelho, " + failed + " falha(s).");
      if (failed) toast.error("Algumas fotos não foram enviadas. Confira o resumo.");
      else toast.success("Envio de fotos concluído. Confira o resumo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao autenticar envio.");
    } finally { setBusy(false); }
  }

  async function download() {
    const evidence = [...readDb().evidences];
    if (!evidence.length) { setStatus("Nenhuma evidência cadastrada."); return; }
    if (!window.confirm("Baixar fotos originais das evidências que estão ausentes neste aparelho? Os arquivos já existentes não serão substituídos.")) return;
    setBusy(true);
    let recovered = 0, present = 0, unavailable = 0;
    try {
      await checkIdentity();
      for (const e of evidence) {
        try {
          if (await getBlob(e.id)) { present++; continue; }
          const { data: blob, error } = await supabase.storage.from(BUCKET).download(objectPath(userId, e));
          if (error || !blob || validate(e, blob) || (await sha256OfBlob(blob)) !== e.sha256) {
            unavailable++;
            continue;
          }
          await putBlob(e.id, blob);
          recovered++;
        } catch { unavailable++; }
      }
      setStatus("Recuperação: " + recovered + " foto(s) recuperada(s), " + present +
        " já presente(s), " + unavailable + " indisponível(is)/inválida(s). Atualize a página para ver miniaturas.");
      if (unavailable) toast.error("Algumas fotos ainda não estão disponíveis na nuvem.");
      else toast.success("Arquivos originais conferidos pelo SHA-256.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao recuperar fotos.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-sm font-semibold">Fotos originais das evidências</p>
      <p className="text-xs text-muted-foreground">
        Armazenamento privado e opcional. Os arquivos são conferidos com SHA-256
        antes do envio e após o download. Somente JPEG, PNG, WebP ou PDF até 20 MB.
        Evidências apenas de demonstração podem não possuir arquivo original.
      </p>
      <p className="text-xs" role="status">{status}</p>
      <Button type="button" className="min-h-12 w-full" disabled={busy} onClick={() => void upload()}>
        {busy ? "Processando…" : "Enviar fotos originais para a nuvem"}
      </Button>
      <Button type="button" variant="outline" className="min-h-12 w-full" disabled={busy} onClick={() => void download()}>
        Recuperar fotos ausentes neste aparelho
      </Button>
    </div>
  );
}
