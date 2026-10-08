import { useEffect, useState } from "react";
import { auxiliaryList } from "@/lib/dp/localRecords";
import { download } from "@/lib/dp/exporters";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
type Review = { at: number; local: unknown; cloud: unknown; choices: Record<string, string> };
export function ConflictArchive({ userId }: { userId: string }) {
  const [rows, setRows] = useState<{ key: string; value: Review }[]>([]);
  useEffect(() => {
    let alive = true;
    void auxiliaryList<Review>("reviews", userId)
      .then((values) => {
        if (alive) setRows(values.sort((a, b) => b.value.at - a.value.at));
      })
      .catch((e) => toast.error(e.message));
    return () => {
      alive = false;
    };
  }, [userId]);
  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="font-semibold">Versões preservadas de conflitos</p>
      <p className="text-xs text-muted-foreground">
        As duas versões ficam neste aparelho. Exporte o arquivo antes de remover os dados locais;
        ele pode conter coordenadas e informações pessoais.
      </p>
      {rows.length ? (
        rows.map((row) => (
          <div key={row.key} className="flex flex-wrap items-center gap-2">
            <span className="text-xs">{new Date(row.value.at).toLocaleString("pt-BR")}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                download(
                  "carvrum-revisao-" + row.value.at + ".json",
                  JSON.stringify(row.value, null, 2),
                  "application/json",
                )
              }
            >
              Exportar as duas versões
            </Button>
          </div>
        ))
      ) : (
        <p className="text-sm">Nenhum conflito arquivado nesta instalação.</p>
      )}
    </div>
  );
}
