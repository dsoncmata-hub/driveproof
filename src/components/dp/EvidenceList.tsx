import { useEffect, useState } from "react";
import { FileCheck2, MapPin } from "lucide-react";
import { getBlobUrl, subscribeBlobs } from "@/lib/dp/blobs";
import { LABELS } from "@/lib/dp/defaults";
import { fmtCoord, fmtDateTime, shortHash } from "@/lib/dp/format";
import type { Evidence } from "@/lib/dp/types";

function EvidenceThumb({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void getBlobUrl(id)
        .then((u) => alive && setUrl(u))
        .catch(() => alive && setUrl(null));
    };
    refresh();
    const unsubscribe = subscribeBlobs((changedId) => {
      if (changedId === id) refresh();
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [id]);
  if (!url) {
    return (
      <div className="grid size-16 shrink-0 place-items-center rounded-md border border-dashed border-border text-[10px] text-muted-foreground">
        sem original
      </div>
    );
  }
  return <img src={url} alt="" className="size-16 shrink-0 rounded-md object-cover" />;
}

export function EvidenceList({ items }: { items: Evidence[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma evidência registrada ainda.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((e) => (
        <li key={e.id} className="flex gap-3 rounded-md border border-border bg-secondary/30 p-3">
          <EvidenceThumb id={e.id} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {LABELS.evidence[e.category]}
              </span>
              {e.inAppCapture ? (
                <span className="flex items-center gap-1 text-[11px] text-success">
                  <FileCheck2 className="size-3" /> capturada no app
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">arquivo importado</span>
              )}
            </div>
            <p className="numeric text-xs text-muted-foreground">{fmtDateTime(e.capturedAt)}</p>
            <p className="numeric flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" /> {fmtCoord(e.lat, e.lon)}
            </p>
            <p className="numeric break-all text-xs text-data">SHA-256 {shortHash(e.sha256)}</p>
            {e.note ? <p className="text-xs text-muted-foreground">{e.note}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
