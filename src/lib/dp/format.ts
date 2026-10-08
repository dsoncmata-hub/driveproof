export function fmtDateTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

export function fmtDate(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("pt-BR");
}

export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

export function fmtNum(v: number | null | undefined, digits = 1, suffix = ""): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}${suffix}`;
}

export function fmtMoney(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fmtCoord(lat: number | null, lon: number | null): string {
  if (lat == null || lon == null) return "sem coordenada";
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

export function shortHash(h: string): string {
  return h ? `${h.slice(0, 12)}…${h.slice(-6)}` : "—";
}