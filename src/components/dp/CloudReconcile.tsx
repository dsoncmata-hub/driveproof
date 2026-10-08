import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readDb } from "@/lib/dp/store";
import { canonical } from "@/lib/dp/snapshot";
import { syncRecords } from "@/lib/dp/cloudSync";
import type { Choice, Conflict } from "@/lib/dp/reconcile";

type Review = { local: string; revision: number; conflicts: Conflict[] };
export function CloudReconcile({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Não iniciado");
  const [review, setReview] = useState<Review | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  async function reconcile(resolve = false) {
    if (busy) return;
    setBusy(true);
    try {
      const local = canonical(readDb());
      const result = await syncRecords(
        userId,
        resolve ? choices : {},
        resolve && review ? review : undefined,
      );
      setMessage(result.status);
      if (result.conflicts.length) {
        setReview({ local, revision: result.revision, conflicts: result.conflicts });
        setChoices({});
      } else {
        setReview(null);
        toast.success(result.status);
      }
    } catch (e) {
      const text = e instanceof Error ? e.message : "Falha ao conciliar. Dados preservados.";
      setMessage(text);
      setReview(null);
      toast.error(text);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <p className="text-sm font-semibold">Conciliar registros de dois aparelhos</p>
      <p className="text-xs text-muted-foreground">
        Une alterações independentes. Se duas versões alteraram o mesmo registro, escolha qual usar.
        As versões da revisão ficam preservadas neste navegador. Fotografias originais são
        recuperadas abaixo.
      </p>
      <p className="text-xs" role="status">
        {message}
      </p>
      {review?.conflicts.map((conflict) => (
        <fieldset key={conflict.key} className="space-y-2 rounded border border-border p-2">
          <legend className="break-all text-xs font-semibold">{conflict.label}</legend>
          {(["local", "cloud"] as const).map((choice) => (
            <label key={choice} className="block text-xs">
              <input
                type="radio"
                aria-label={
                  (choice === "local" ? "Usar deste aparelho: " : "Usar da nuvem: ") +
                  conflict.label
                }
                name={conflict.key}
                value={choice}
                checked={choices[conflict.key] === choice}
                onChange={() => setChoices((prior) => ({ ...prior, [conflict.key]: choice }))}
              />
              <span className="ml-2">
                {choice === "local" ? "Usar deste aparelho" : "Usar da nuvem"}
                {conflict[choice] === undefined ? " (registro excluído)" : ""}
              </span>
              <details className="mt-1">
                <summary>Ver conteúdo desta versão</summary>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all p-2">
                  {JSON.stringify(conflict[choice] ?? "Registro excluído", null, 2)}
                </pre>
              </details>
            </label>
          ))}
        </fieldset>
      ))}
      {review ? (
        <Button
          type="button"
          className="min-h-12 w-full"
          disabled={busy || review.conflicts.some((c) => !choices[c.key])}
          onClick={() => void reconcile(true)}
        >
          Aplicar versões escolhidas e sincronizar
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full"
        disabled={busy}
        onClick={() => void reconcile()}
      >
        {busy ? "Conferindo registros…" : "Verificar e conciliar registros"}
      </Button>
    </div>
  );
}
