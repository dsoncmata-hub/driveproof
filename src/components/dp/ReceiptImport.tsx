import { useRef,useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice,Panel } from "@/components/dp/primitives";
type Extracted={liters?:string;price?:string;total?:string;fuel?:string;station?:string};
function parseReceipt(text:string):Extracted{
 const normalized=text.replace(/\r/g,"");
 const value=(pattern:RegExp)=>normalized.match(pattern)?.[1]?.replace(",",".");
 const liters=value(/(?:QTD|QUANTIDADE|LITROS?)\s*[:=]?\s*(\d+[,.]\d{1,3})/i);
 const price=value(/(?:VL\.?\s*UNIT|PRE[ÇC]O\s*(?:UNIT[ÁA]RIO|\/L|POR LITRO))\s*[:=]?\s*(?:R\$)?\s*(\d+[,.]\d{2,3})/i);
 const total=value(/(?:VALOR\s*TOTAL|TOTAL\s*(?:A\s*PAGAR)?|VL\.?\s*TOTAL)\s*[:=]?\s*(?:R\$)?\s*(\d+[,.]\d{2})/i);
 const fuel=normalized.match(/GASOLINA|ETANOL|ÁLCOOL|ALCOOL|DIESEL|GNV/i)?.[0]?.toUpperCase();
 return {liters,price,total,fuel:fuel?.includes("GASOLINA")?"gasolina":fuel?.includes("ETANOL")||fuel?.includes("ALCOOL")||fuel?.includes("ÁLCOOL")?"etanol":fuel?.includes("DIESEL")?"diesel":fuel==="GNV"?"gnv":undefined};
}
export function ReceiptImport({onExtract}:{onExtract:(data:Extracted)=>void}){
 const camera=useRef<HTMLInputElement>(null);
 const qrCamera=useRef<HTMLInputElement>(null);
 const [fallback,setFallback]=useState(false),[notice,setNotice]=useState("");
 const [text,setText]=useState("");
 const [image,setImage]=useState<string|null>(null);
 const [link,setLink]=useState("");
 function handleQr(value:string){
  setLink(value);
  // NFC-e QR codes usually point to the SEFAZ consultation page.
  // A link alone does NOT contain reliable fuel line items. Never scrape
  // arbitrary URLs from the browser or claim an unverified extraction.
  setFallback(true);
  setNotice("O QR Code identifica a consulta da NFC-e, mas os itens de combustível não puderam ser extraídos com segurança. Tire uma foto da nota para continuar.");
  camera.current?.click();
 }
 async function scanQrPhoto(file:File|undefined){
  if(!file)return;
  try{
   const Detector=(globalThis as unknown as {BarcodeDetector?:new (o:{formats:string[]})=>{detect:(image:ImageBitmap)=>Promise<{rawValue:string}[]>}}).BarcodeDetector;
   if(!Detector)throw Error("Leitor de QR Code não disponível neste aparelho.");
   const bitmap=await createImageBitmap(file);
   let results:{rawValue:string}[]=[];
   try{results=await new Detector({formats:["qr_code"]}).detect(bitmap);}finally{bitmap.close();}
   if(!results[0]?.rawValue)throw Error("QR Code não identificado na imagem.");
   handleQr(results[0].rawValue);
  }catch{
   setNotice("Não consegui extrair os dados da NFC-e pelo QR Code. Fotografe a nota para preencher o abastecimento.");
   setFallback(true);
   camera.current?.click();
  }
 }
 function handleFile(file:File|undefined){
  if(!file)return;
  if(!file.type.startsWith("image/")||file.size>12*1024*1024){setNotice("Use uma imagem de até 12 MB.");return;}
  const reader=new FileReader();
  reader.onload=()=>{setImage(typeof reader.result==="string"?reader.result:null);setFallback(true);setNotice("Foto capturada. A extração visual automática ainda não está disponível nesta versão: confira a nota e informe o texto ou valores antes de salvar.");};
  reader.readAsDataURL(file);
 }
 function apply(){
  const extracted=parseReceipt(text);
  if(!extracted.liters&&!extracted.price&&!extracted.total&&!extracted.fuel){setNotice("Não reconheci campos suficientes. Preencha manualmente os dados do abastecimento.");return;}
  onExtract(extracted);
  setNotice("Campos identificados no texto e preenchidos para conferência. Confira todos os números com a nota antes de salvar.");
 }
 return <Panel title="Importar nota fiscal — assistente">
  <Notice>O QR Code ou código de barras pode identificar a NFC-e, mas não garante acesso aos itens. Quando não houver extração verificável, pediremos uma foto. Nenhuma nota será registrada automaticamente.</Notice>
  <label className="mt-3 block text-sm">Link ou conteúdo do QR Code da nota
   <input value={link} onChange={e=>setLink(e.target.value)} placeholder="Cole o link lido ou a chave NFC-e" className="mt-1 min-h-11 w-full rounded-md border border-input bg-secondary/40 px-3"/>
  </label>
  <div className="mt-2 flex flex-wrap gap-2">
   <Button type="button" variant="secondary" onClick={()=>qrCamera.current?.click()}>Ler QR Code da nota</Button>
   <Button type="button" variant="secondary" onClick={()=>handleQr(link)}>Usar código informado</Button>
   <Button type="button" onClick={()=>{setFallback(true);camera.current?.click();}}>Fotografar nota</Button>
  </div>
  <input ref={qrCamera} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Fotografar QR Code" onChange={e=>void scanQrPhoto(e.target.files?.[0])}/>
  <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Capturar nota fiscal" onChange={e=>handleFile(e.target.files?.[0])}/>
  {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
  {fallback&&<div className="mt-3 space-y-3">
    {image&&<img src={image} alt="Prévia local da nota fiscal" className="max-h-64 w-full rounded-md object-contain"/>}
    <label className="block text-sm">Texto visível na nota (opcional)
      <textarea value={text} onChange={e=>setText(e.target.value)} rows={4} placeholder="Cole ou transcreva as linhas que contêm combustível, quantidade, preço unitário e total." className="mt-1 w-full rounded-md border border-input bg-secondary/40 px-3 py-2"/>
    </label>
    <Button type="button" variant="secondary" onClick={apply}>Preencher os campos reconhecidos</Button>
    <p className="text-xs text-muted-foreground">O comprovante permanece nesta tela e não é enviado a serviços externos. Esta etapa ainda não realiza OCR automático nem consulta estadual integrada.</p>
  </div>}
 </Panel>;
}
