import { useCallback,useEffect,useState } from "react";
import { Panel,Notice } from "@/components/dp/primitives";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/dp/supabase";
import { useAccount } from "@/components/dp/AccountProvider";
import { useDb } from "@/lib/dp/store";
type Entry={id:string;category:string;description:string;amount:number;incurred_on:string};
const categories=[["manutencao","Manutenção"],["seguro","Seguro"],["imposto","Impostos"],["estacionamento","Estacionamento"],["pedagio","Pedágio"],["outro","Outros gastos"],["receita","Receita profissional"]];
const cls="mt-1 w-full min-h-11 rounded-md border border-input bg-secondary/40 px-3 text-base";
export function FinancialDashboard(){
 const {user}=useAccount(),db=useDb();
 const [entries,setEntries]=useState<Entry[]>([]);
 const [category,setCategory]=useState("manutencao"),[amount,setAmount]=useState(""),[description,setDescription]=useState("");
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const load=useCallback(async()=>{if(!user)return;const {data,error}=await supabase.from("carvrum_financial_entries").select("id,category,description,amount,incurred_on").order("incurred_on",{ascending:false}).limit(500);
 if(error)setMessage(error.message);else setEntries((data??[]) as Entry[]);},[user]);
 useEffect(()=>{void load();},[load]);
 const fuel=db.fuelings.filter(f=>!f.demo&&f.totalValue!=null).reduce((a,f)=>a+Number(f.totalValue??0),0);
 const traveled=db.trips.filter(t=>t.finished).reduce((a,t)=>a+Number(t.distanceKm),0);
 const costs=entries.filter(e=>e.category!=="receita").reduce((a,e)=>a+Number(e.amount),0);
 const income=entries.filter(e=>e.category==="receita").reduce((a,e)=>a+Number(e.amount),0);
 async function save(){
  if(!user){setMessage("Entre na conta para salvar receitas e despesas.");return;}
  const value=Number(amount.replace(",","."));
  if(!Number.isFinite(value)||value<=0||value>1000000){setMessage("Informe um valor válido.");return;}
  setBusy(true);setMessage("");
  const {error}=await supabase.from("carvrum_financial_entries").insert({user_id:user.id,category,amount:value,description:description.trim(),vehicle_label:db.vehicle.name});
  if(error)setMessage(error.message);else {setAmount("");setDescription("");await load();setMessage("Lançamento registrado.");}
  setBusy(false);
 }
 return <Panel title="Financeiro do veículo — visão inicial">
  <Notice>Comparação acumulada dos registros disponíveis. A média por km não equivale ao custo contábil completo se houver despesas ou distâncias ausentes. Não inclui depreciação sem lançamento específico.</Notice>
  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
   <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Combustível registrado</p><strong>R$ {fuel.toFixed(2).replace(".",",")}</strong></div>
   <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Outras despesas</p><strong>R$ {costs.toFixed(2).replace(".",",")}</strong></div>
   <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Receitas</p><strong>R$ {income.toFixed(2).replace(".",",")}</strong></div>
   <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Custo/km observado</p><strong>{traveled>0?"R$ "+((fuel+costs)/traveled).toFixed(2).replace(".",","):"Sem km suficiente"}</strong></div>
  </div>
  <div className="mt-3 grid grid-cols-2 gap-3">
   <label className="text-sm">Categoria<select className={cls} value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
   <label className="text-sm">Valor (R$)<input className={cls} inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
   <label className="col-span-2 text-sm">Descrição opcional<input className={cls} value={description} maxLength={160} onChange={e=>setDescription(e.target.value)}/></label>
  </div>
  <Button className="mt-3" disabled={busy||!user} onClick={()=>void save()}>{busy?"Salvando…":"Adicionar despesa ou receita"}</Button>
  {message&&<p role="status" className="mt-2 text-sm">{message}</p>}
  <div className="mt-3 space-y-2">{entries.slice(0,12).map(e=><div key={e.id} className="flex justify-between gap-2 border-b py-2 text-sm">
   <div><p>{categories.find(([id])=>id===e.category)?.[1]} — {e.description||"Sem descrição"}</p><p className="text-xs text-muted-foreground">{e.incurred_on}</p></div>
   <div className="flex shrink-0 items-center gap-2"><strong>R$ {Number(e.amount).toFixed(2).replace(".",",")}</strong>
    <button className="text-xs underline" onClick={async()=>{const {error}=await supabase.from("carvrum_financial_entries").delete().eq("id",e.id);if(error)setMessage(error.message);else await load();}}>Excluir</button>
   </div>
  </div>)}</div>
 </Panel>;
}
