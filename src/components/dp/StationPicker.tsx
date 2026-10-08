import { useState } from "react";
import { MapPin, Star, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Notice } from "./primitives";
import { findNearbyStations, validCnpj, type NearbySuggestion } from "@/lib/dp/stations";
import { addStation, toggleFavoriteStation, uid, useDb } from "@/lib/dp/store";
import type { Station } from "@/lib/dp/types";

const input =
  "mt-1 min-h-12 w-full rounded-md border border-input bg-secondary/40 px-3 outline-none focus:border-ring";

export function StationPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const db = useDb();
  const [mode, setMode] = useState<"lista" | "gps" | "manual">("lista");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [items, setItems] = useState<NearbySuggestion[]>([]);
  const [pending, setPending] = useState<NearbySuggestion | null>(null);
  const [form, setForm] = useState({ name: "", address: "", city: "", brand: "", cnpj: "", localId: "", favorite: false });

  const lastUse = new Map<string, number>();
  for (const f of db.fuelings) if (f.stationId) lastUse.set(f.stationId, Math.max(lastUse.get(f.stationId) ?? 0, f.at));
  const known = [...db.stations]
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (lastUse.get(b.id) ?? 0) - (lastUse.get(a.id) ?? 0))
    .slice(0, 6);
  const selected = db.stations.find((s) => s.id === value) ?? null;

  async function search() {
    setLoading(true);
    setMsg(null);
    const r = await findNearbyStations();
    setLoading(false);
    if (r.ok) {
      setItems(r.items);
      if (r.accuracyM && r.accuracyM > 100) setMsg(`Precisão do GPS baixa (±${Math.round(r.accuracyM)} m). Confira com atenção.`);
    } else {
      setItems([]);
      setMsg(r.reason);
    }
  }

  function confirmSuggestion(s: NearbySuggestion) {
    const existing = db.stations.find((x) => x.localId === s.externalId);
    const st: Station = existing ?? {
      id: uid("st"),
      name: s.name,
      address: s.address,
      city: s.city,
      brand: s.brand,
      cnpj: s.cnpj,
      localId: s.externalId,
      favorite: false,
      lat: s.lat,
      lon: s.lon,
      source: "sugestao_gps_confirmada",
      createdAt: Date.now(),
    };
    if (!existing) addStation(st);
    onChange(st.id);
    setPending(null);
    setMode("lista");
    toast.success("Posto confirmado");
  }

  function saveManual() {
    const name = form.name.trim();
    if (!name) { toast.error("Informe o nome do posto."); return; }
    if (!validCnpj(form.cnpj)) { toast.error("CNPJ deve ter 14 dígitos (ou deixe em branco)."); return; }
    const st: Station = {
      id: uid("st"),
      name: name.slice(0, 120),
      address: form.address.trim().slice(0, 160),
      city: form.city.trim().slice(0, 80),
      brand: form.brand.trim().slice(0, 60),
      cnpj: form.cnpj.replace(/\D/g, ""),
      localId: form.localId.trim().slice(0, 40),
      favorite: form.favorite,
      lat: null,
      lon: null,
      source: "manual",
      createdAt: Date.now(),
    };
    addStation(st);
    onChange(st.id);
    setMode("lista");
    setForm({ name: "", address: "", city: "", brand: "", cnpj: "", localId: "", favorite: false });
  }

  return (
    <div className="space-y-2">
      <span className="label-tec">Posto</span>
      {selected ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-primary bg-primary/10 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{selected.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[selected.brand, selected.address, selected.city].filter(Boolean).join(" · ") || "sem endereço"}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Trocar</Button>
        </div>
      ) : (
        <>
          {known.length > 0 ? (
            <div className="grid gap-2">
              {known.map((s) => (
                <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-1">
                  <button
                    type="button"
                    onClick={() => onChange(s.id)}
                    className="min-h-12 truncate rounded-md border border-border bg-secondary/40 px-3 text-left text-sm"
                  >
                    {s.name}
                  </button>
                  <button
                    type="button"
                    aria-label={s.favorite ? "Remover favorito" : "Favoritar"}
                    onClick={() => toggleFavoriteStation(s.id)}
                    className="grid min-h-12 w-12 place-items-center rounded-md border border-border"
                  >
                    <Star className={`size-5 ${s.favorite ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" className="min-h-12" onClick={() => setMode(mode === "gps" ? "lista" : "gps")}>
              <MapPin className="size-4" /> Postos próximos
            </Button>
            <Button variant="secondary" className="min-h-12" onClick={() => setMode(mode === "manual" ? "lista" : "manual")}>
              <Plus className="size-4" /> Cadastrar
            </Button>
          </div>
        </>
      )}

      {!selected && mode === "gps" ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          {!consent ? (
            <>
              <Notice>
                Para sugerir postos, o app lê sua localização uma vez e consulta uma base pública
                de mapas (OpenStreetMap). As sugestões podem estar erradas; você sempre confirma.
              </Notice>
              <Button className="min-h-12 w-full" onClick={() => { setConsent(true); void search(); }}>
                Autorizar e buscar
              </Button>
            </>
          ) : (
            <>
              {loading ? <p className="text-sm text-muted-foreground">Buscando…</p> : null}
              {msg ? <Notice tone="warning">{msg}</Notice> : null}
              {items.map((s) => (
                <button
                  key={s.externalId}
                  type="button"
                  onClick={() => setPending(s)}
                  className={`block w-full rounded-md border p-3 text-left ${pending?.externalId === s.externalId ? "border-primary" : "border-border"}`}
                >
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="numeric text-xs text-muted-foreground">
                    {(s.distanceKm * 1000).toFixed(0)} m · {s.brand || "bandeira não informada"}
                  </p>
                  <p className="text-xs text-muted-foreground">{[s.address, s.city].filter(Boolean).join(", ") || "endereço não informado no mapa"}{s.cnpj ? ` · CNPJ ${s.cnpj}` : ""}</p>
                </button>
              ))}
              {pending ? (
                <Button className="min-h-12 w-full" onClick={() => confirmSuggestion(pending)}>
                  <Check className="size-4" /> Confirmo que estou em: {pending.name}
                </Button>
              ) : null}
              {!loading ? (
                <Button variant="ghost" className="w-full" onClick={() => void search()}>Buscar de novo</Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {!selected && mode === "manual" ? (
        <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3">
          {([
            ["name", "Nome *", 2],
            ["address", "Endereço", 2],
            ["city", "Cidade", 1],
            ["brand", "Bandeira", 1],
            ["cnpj", "CNPJ (opcional)", 1],
            ["localId", "Identificador", 1],
          ] as const).map(([k, l, span]) => (
            <label key={k} className={`block ${span === 2 ? "col-span-2" : ""}`}>
              <span className="label-tec">{l}</span>
              <input
                value={form[k]}
                maxLength={k === "cnpj" ? 18 : 160}
                inputMode={k === "cnpj" ? "numeric" : undefined}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                className={input}
              />
            </label>
          ))}
          <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={form.favorite} onChange={(e) => setForm({ ...form, favorite: e.target.checked })} className="size-5" />
            Marcar como favorito
          </label>
          <Button className="col-span-2 min-h-12" onClick={saveManual}>Salvar posto</Button>
        </div>
      ) : null}
    </div>
  );
}