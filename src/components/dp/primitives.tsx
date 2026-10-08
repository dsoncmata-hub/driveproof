import { AlertTriangle, Info } from "lucide-react";
import type { ReactNode } from "react";
import { trackToPolyline } from "@/lib/dp/geo";
import type { TrackPoint } from "@/lib/dp/types";

export function Panel({
  title,
  right,
  children,
  className = "",
}: {
  title?: string | undefined;
  right?: ReactNode | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel p-4 ${className}`}>
      {title ? (
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <h2 className="label-tec truncate">{title}</h2>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  unit,
  tone = "default",
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "default" | "primary" | "data" | "muted";
}) {
  const color =
    tone === "primary"
      ? "text-primary"
      : tone === "data"
        ? "text-data"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-secondary/40 px-3 py-2">
      <p className="label-tec truncate">{label}</p>
      <p className={`numeric text-xl font-semibold ${color}`}>
        {value}
        {unit ? <span className="ml-1 text-xs text-muted-foreground">{unit}</span> : null}
      </p>
    </div>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="min-w-0 text-sm text-muted-foreground">{label}</span>
      <span className="numeric shrink-0 text-right text-sm">{value}</span>
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning";
  children: ReactNode;
}) {
  const warn = tone === "warning";
  return (
    <div
      className={`flex gap-2 rounded-md border p-3 text-xs leading-relaxed ${
        warn
          ? "border-warning/40 bg-warning/10 text-warning"
          : "border-border bg-secondary/40 text-muted-foreground"
      }`}
    >
      {warn ? (
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      ) : (
        <Info className="mt-0.5 size-4 shrink-0" />
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function TrackMap({ points, className = "" }: { points: TrackPoint[]; className?: string }) {
  const poly = trackToPolyline(points);
  if (!poly) {
    return (
      <div
        className={`grid h-44 place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground ${className}`}
      >
        Sem pontos de GPS suficientes para desenhar o trajeto.
      </div>
    );
  }
  const coords = poly.split(" ");
  const first = (coords[0] ?? "0,0").split(",");
  const last = (coords[coords.length - 1] ?? "0,0").split(",");
  return (
    <div className={`overflow-hidden rounded-md border border-border bg-secondary/30 ${className}`}>
      <svg viewBox="0 0 100 100" className="h-44 w-full">
        <defs>
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.2" className="text-border" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#grid)" />
        <polyline
          points={poly}
          fill="none"
          stroke="currentColor"
          className="text-data"
          strokeWidth="1.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={first[0]} cy={first[1]} r="1.8" className="fill-success" />
        <circle cx={last[0]} cy={last[1]} r="1.8" className="fill-primary" />
      </svg>
      <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        Traçado esquemático a partir das coordenadas registradas (sem mapa base).
      </p>
    </div>
  );
}

export function DrivingWarning() {
  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs font-medium text-destructive">
      Não interaja com o aplicativo dirigindo. Pare o veículo em local seguro antes de
      preencher dados ou tirar fotos.
    </div>
  );
}