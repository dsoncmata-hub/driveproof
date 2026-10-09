import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice, Panel } from "@/components/dp/primitives";
import { supabase } from "@/lib/dp/supabase";

type StationPrice={id:string;station_name:string;station_address:string;municipality:string;state_uf:string;latitude:number;longitude:number;fuel_type:string;price_per_unit:number;observed_on:string};
const HORIZON_DAYS=7;
function kmBetween(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}){
  const rad=Math.PI/180,dLat=(b.latitude-a.latitude)*rad,dLon=(b.longitude-a.longitude)*rad;
  const x=Math.sin(dLat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dLon/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(x)));
}
function normalizeFuel(f:string){return f==="diesel_s10"?"Diesel S10":f==="gnv"?"GNV":f.replaceAll("_"," ").replace(/^./,m=>m.toUpperCase());}
const field="mt-1 w-full min-h-11 rounded-md border border-input bg-secondary/40 px-3 text-base";

export function NearbyStations(){
 const [cep,setCep]=useState("");
 const [fuel,setFuel]=useState("gasolina");
 const [radius,setRadius]=useState(20);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [location,setLocation]=useState("");
 const [stations,setStations]=useState<(StationPrice&{km:number})[]>([]);
 const [center,setCenter]=useState<{latitude:number;longitude:number}|null>(null);
 async function searchAt(latitude:number,longitude:number,label:string){
   const bounded=Math.min(20,Math.max(1,radius));
   const latDelta=bounded/111;
   const lonDelta=bounded/(111*Math.max(.2,Math.cos(latitude*Math.PI/180)));
   const minDate=new Date(Date.now()-HORIZON_DAYS*86400000).toISOString().slice(0,10);
   const {data,error}=await supabase.from("carvrum_station_prices").select("id,station_name,station_address,municipality,state_uf,latitude,longitude,fuel_type,price_per_unit,observed_on")
      .eq("fuel_type",fuel).gte("observed_on",minDate)
      .gte("latitude",latitude-latDelta).lte("latitude",latitude+latDelta)
      .gte("longitude",longitude-lonDelta).lte("longitude",longitude+lonDelta).limit(1000);
   if(error)throw error;
   const c={latitude,longitude};
   const filtered=((data??[]) as StationPrice[]).map(s=>({...s,km:kmBetween(c,s)})).filter(s=>s.km<=bounded)
     .sort((a,b)=>a.price_per_unit-b.price_per_unit||a.km-b.km);
   setCenter(c);setLocation(label);setStations(filtered);
   setMessage(filtered.length===0
     ?"Nenhuma cotação ANP recente e georreferenciada disponível neste raio. Não é possível afirmar qual é o posto mais barato."
     :"Comparação apenas entre postos encontrados na amostra ANP recente, não entre todos os postos da região.");
 }
 async function searchCep(){
   const digits=cep.replace(/\D/g,"");
   if(digits.length!==8){setMessage("Informe um CEP com 8 dígitos.");return;}
   setBusy(true);setMessage("");setStations([]);setCenter(null);
   try{
     const resp=await fetch("https://brasilapi.com.br/api/cep/v2/"+digits);
     if(!resp.ok)throw Error("CEP não localizado.");
     const data=await resp.json() as {city?:string;state?:string;location?:{coordinates?:{latitude?:string;longitude?:string}}};
     const lat=Number(data.location?.coordinates?.latitude),lon=Number(data.location?.coordinates?.longitude);
     if(!data.location?.coordinates?.latitude||!data.location.coordinates.longitude||!Number.isFinite(lat)||!Number.isFinite(lon))
       throw Error("CEP identificado, mas sem coordenadas confiáveis. Use 'Minha localização' com permissão.");
     await searchAt(lat,lon,"CEP "+digits+" · "+(data.city??"")+" / "+(data.state??""));
   }catch(e){setMessage(e instanceof Error?e.message:"Falha ao consultar CEP.");}finally{setBusy(false);}
 }
 function searchGps(){
   if(!navigator.geolocation){setMessage("GPS indisponível.");return;}
   setBusy(true);setMessage("Solicitando sua permissão de localização…");
   navigator.geolocation.getCurrentPosition(p=>{
     void searchAt(p.coords.latitude,p.coords.longitude,"Localização autorizada").catch(e=>setMessage(String(e))).finally(()=>setBusy(false));
   },e=>{setMessage(e.code===1?"Permissão de localização negada.":"Não foi possível obter localização.");setBusy(false);},
   {enableHighAccuracy:true,timeout:15000,maximumAge:60000});
 }
 return <Panel title="Postos mais baratos perto de você — até 20 km">
   <Notice>Preços são levantamentos históricos da ANP, não preços em tempo real. Só mostramos valores com localização verificável e data dos últimos {HORIZON_DAYS} dias. A pesquisa da ANP não cobre todos os postos. Confirme o valor antes de sair.</Notice>
   <div className="mt-3 grid grid-cols-2 gap-3">
     <label className="col-span-2 text-sm">Seu CEP
       <input className={field} inputMode="numeric" maxLength={9} value={cep}
       placeholder="00000-000" onChange={e=>setCep(e.target.value)}/>
     </label>
     <label className="text-sm">Combustível
       <select className={field} value={fuel} onChange={e=>setFuel(e.target.value)}>
        <option value="gasolina">Gasolina comum</option><option value="etanol">Etanol</option>
        <option value="diesel">Diesel</option><option value="diesel_s10">Diesel S10</option>
        <option value="gasolina_aditivada">Gasolina aditivada</option><option value="gnv">GNV</option>
       </select>
     </label>
     <label className="text-sm">Raio máximo
      <select className={field} value={radius} onChange={e=>setRadius(Number(e.target.value))}>
       <option value={5}>5 km</option><option value={10}>10 km</option><option value={15}>15 km</option><option value={20}>20 km</option>
      </select>
     </label>
   </div>
   <div className="mt-3 flex flex-wrap gap-2">
     <Button disabled={busy} onClick={()=>void searchCep()}>{busy?"Pesquisando…":"Buscar por CEP"}</Button>
     <Button variant="secondary" disabled={busy} onClick={searchGps}>Usar minha localização</Button>
   </div>
   {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
   {center&&<p className="mt-3 text-xs text-muted-foreground">Centro: {location} · raio de {radius} km em linha reta (não distância por estrada).</p>}
   {stations.length>0&&<div className="mt-3 space-y-2">
     <p className="text-sm font-medium">{stations.length} cotação(ões) elegíveis · ordenadas pelo menor preço por unidade</p>
     {stations.slice(0,15).map((s,i)=><div key={s.id} className="rounded-lg border border-border p-3">
       <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="text-sm font-semibold">{i===0?"Menor preço encontrado · ":""}{s.station_name}</p>
        <p className="text-xs text-muted-foreground">{s.station_address} · {s.municipality}/{s.state_uf}</p></div>
        <p className="whitespace-nowrap font-semibold">R$ {Number(s.price_per_unit).toFixed(3).replace(".",",")}</p>
       </div>
       <p className="mt-2 text-xs text-muted-foreground">{normalizeFuel(s.fuel_type)} · {s.km.toFixed(1).replace(".",",")} km · ANP em {new Date(s.observed_on+"T12:00:00").toLocaleDateString("pt-BR")}</p>
       <a className="mt-2 inline-block text-sm underline" target="_blank" rel="noreferrer"
        href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(s.latitude+","+s.longitude)}>Ver localização no mapa</a>
     </div>)}
   </div>}
 </Panel>;
}
