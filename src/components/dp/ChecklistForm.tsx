import { LABELS, TIRE_LABELS } from "@/lib/dp/defaults";
import { tireAlerts } from "@/lib/dp/analysis";
import type { Checklist } from "@/lib/dp/types";
import { Notice, Panel } from "./primitives";

type Props = { value: Checklist; onChange: (next: Checklist) => void };

function NumField({
  label,
  value,
  onChange,
  unit,
  step = "0.1",
  placeholder = "—",
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  unit?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="label-tec">
        {label} {unit ? `(${unit})` : ""}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="numeric mt-1 min-h-12 w-full rounded-md border border-input bg-secondary/40 px-3 text-base text-foreground outline-none focus:border-ring"
      />
    </label>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Record<string, string>;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <span className="label-tec">{label}</span>
      <div className="mt-1 flex flex-wrap gap-2">
        {Object.entries(options).map(([key, text]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key as T)}
            className={`min-h-11 rounded-md border px-3 text-sm font-medium ${
              value === key
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-secondary/40 text-muted-foreground"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border bg-secondary/40 px-3 py-2">
      <span className="min-w-0 text-sm">{label}</span>
      <div className="flex shrink-0 gap-1">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            className={`min-h-10 rounded px-3 text-sm font-semibold ${
              value === v ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
            }`}
          >
            {v ? "Sim" : "Não"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChecklistForm({ value, onChange }: Props) {
  const set = (patch: Partial<Checklist>) => onChange({ ...value, ...patch });
  const alerts = tireAlerts(value);

  return (
    <div className="space-y-4">
      <Panel title="Pneus — pressão medida (PSI)">
        <div className="grid grid-cols-2 gap-3">
          {TIRE_LABELS.map((t) => (
            <NumField
              key={t.key}
              label={t.label}
              unit="PSI"
              value={value.tirePressurePsi[t.key]}
              onChange={(v) =>
                set({ tirePressurePsi: { ...value.tirePressurePsi, [t.key]: v } })
              }
            />
          ))}
        </div>
        <div className="mt-3 space-y-3">
          <Choice
            label="Condição da medição"
            value={value.tireMeasuredAt}
            options={LABELS.tireMeasuredAt}
            onChange={(v) => set({ tireMeasuredAt: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <NumField
              label="Recomendada dianteira"
              unit="PSI"
              value={value.recommendedFrontPsi}
              onChange={(v) => set({ recommendedFrontPsi: v })}
            />
            <NumField
              label="Recomendada traseira"
              unit="PSI"
              value={value.recommendedRearPsi}
              onChange={(v) => set({ recommendedRearPsi: v })}
            />
          </div>
          <Notice>
            O app não presume pressão correta. Informe a pressão recomendada conforme a
            etiqueta da coluna da porta ou o manual do veículo.
          </Notice>
          {alerts.map((a, i) => (
            <Notice key={i} tone={a.level === "atencao" ? "warning" : "info"}>
              {a.message}
            </Notice>
          ))}
        </div>
      </Panel>

      <Panel title="Carga e clima">
        <div className="grid grid-cols-2 gap-3">
          <NumField
            label="Ocupantes"
            step="1"
            value={value.occupants}
            onChange={(v) => set({ occupants: v })}
          />
          <NumField
            label="Carga estimada"
            unit="kg"
            step="1"
            value={value.estimatedLoadKg}
            onChange={(v) => set({ estimatedLoadKg: v })}
          />
          <NumField
            label="Temperatura ambiente"
            unit="°C"
            value={value.ambientTempC}
            onChange={(v) => set({ ambientTempC: v })}
          />
          <NumField
            label="Temperatura do AC"
            unit="°C"
            value={value.acTempC}
            onChange={(v) => set({ acTempC: v })}
          />
        </div>
        <div className="mt-3 space-y-2">
          <Toggle label="Ar-condicionado ligado" value={value.acOn} onChange={(v) => set({ acOn: v })} />
          <Toggle
            label="Partida a frio"
            value={value.coldStart}
            onChange={(v) => set({ coldStart: v })}
          />
        </div>
      </Panel>

      <Panel title="Combustível e condução">
        <div className="space-y-3">
          <NumField
            label="Nível inicial de combustível"
            unit="%"
            step="1"
            value={value.initialFuelLevelPct}
            onChange={(v) => set({ initialFuelLevelPct: v })}
          />
          <Choice
            label="Combustível no tanque"
            value={value.fuelType}
            options={LABELS.fuelType}
            onChange={(v) => set({ fuelType: v })}
          />
          <Choice
            label="Modo de condução"
            value={value.driveMode}
            options={LABELS.driveMode}
            onChange={(v) => set({ driveMode: v })}
          />
          <Choice
            label="Janelas"
            value={value.windows}
            options={LABELS.windows}
            onChange={(v) => set({ windows: v })}
          />
        </div>
      </Panel>

      <Panel title="Via e trajeto">
        <div className="space-y-3">
          <Choice
            label="Condição da via"
            value={value.roadCondition}
            options={LABELS.roadCondition}
            onChange={(v) => set({ roadCondition: v })}
          />
          <Choice
            label="Trânsito"
            value={value.traffic}
            options={LABELS.traffic}
            onChange={(v) => set({ traffic: v })}
          />
          <Choice
            label="Tipo de trajeto"
            value={value.routeType}
            options={LABELS.routeType}
            onChange={(v) => set({ routeType: v })}
          />
          <label className="block">
            <span className="label-tec">Observações</span>
            <textarea
              rows={3}
              value={value.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Ex.: pista em obras, vento forte, mesmo motorista."
              className="mt-1 w-full rounded-md border border-input bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-ring"
            />
          </label>
        </div>
      </Panel>
    </div>
  );
}