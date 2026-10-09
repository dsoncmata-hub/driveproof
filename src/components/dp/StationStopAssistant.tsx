import { useEffect,useState,useRef } from "react";
import { useTracker } from "@/components/dp/TripTracker";
import { useDb } from "@/lib/dp/store";
import { supabase } from "@/lib/dp/supabase";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/dp/primitives";
type P={station_name:string;station_address:string;latitude:number;longitude:number};
const dist=(a:{lat:number;lon:number},b:P)=>{const r=Math.PI/180,d1=(b.latitude-a.lat)*r,d2=(b.longitude-a.lon)*r,h=Math.sin(d1/2)**2+Math.cos(a.lat*r)*Math.cos(b.latitude*r)*Math.sin(d2/2)**2;return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));};
export function StationStopAssistant(){
 const engine=useTracker(),db=useDb();
 const [enabled,setEnabled]=useState(false),[station,setStation]=useState<P|null>(null),[suggestion,setSuggestion]=useState<P|null>(null);
 const stopped=useRef(0),lastAsked=useRef(0);
 const last=engine.state.lastPoint;
 useEffect(()=>{if(!enabled||!db.activeTripId||!last||engine.state.status!=="ativo"||engine.state.accuracy==null||engine.state.accuracy>70||engine.state.currentKmh>3||Date.now()-last.t>30000){stopped.current=0;return;}
 const now=Date.now();if(!stopped.current)stopped.current=now;
 if(now-stopped.current<70000||now-lastAsked.current<3600000)return;
 let alive=true;
 void supabase.from("carvrum_station_prices").select("station_name,station_address,latitude,longitude")
  .gte("latitude",last.lat-.002).lte("latitude",last.lat+.002)
  .gte("longitude",last.lon-.002).lte("longitude",last.lon+.002)
  .limit(100).then(({data,error})=>{
    if(!alive||error)return;
    const match=((data??[]) as P[]).map(p=>({p,d:dist(last,p)})).filter(p=>p.d<=100).sort((a,b)=>a.d-b.d)[0]?.p;
    if(match){setStation(match);setSuggestion(match);lastAsked.current=Date.now();}
  });
 return ()=>{alive=false;};
 },[enabled,db.activeTripId,last,engine.state.status,engine.state.accuracy,engine.state.currentKmh]);
 return <Panel title="Detecção de parada em posto">
  <label className="flex gap-2 text-sm items-center"><input type="checkbox" checked={enabled} onChange={e=>{setEnabled(e.target.checked);if(!e.target.checked){setSuggestion(null);stopped.current=0;}}}/>Ativar sugestão de abastecimento após 70 segundos parado</label>
  <p className="mt-2 text-xs text-muted-foreground">Somente com viagem ativa, localização precisa e posto mapeado. O GPS da web pode pausar em segundo plano. Não registra abastecimento automaticamente e silencia por uma hora após sugerir.</p>
  {suggestion&&<div className="mt-3 space-y-2 rounded-md border p-3">
   <p className="text-sm">Parada próxima de <strong>{suggestion.station_name}</strong> — {suggestion.station_address}. Você abasteceu aqui?</p>
   <div className="flex gap-2"><Button type="button" onClick={()=>{setSuggestion(null);window.location.assign("/abastecimentos");}}>Sim, informar preço e litros</Button><Button type="button" variant="secondary" onClick={()=>setSuggestion(null)}>Não</Button></div>
  </div>}
  {!suggestion&&station&&<p className="mt-2 text-xs text-muted-foreground">Último posto próximo identificado: {station.station_name}.</p>}
 </Panel>;
}
