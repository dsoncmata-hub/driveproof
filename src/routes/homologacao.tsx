import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/dp/AppShell";
import { Panel, Notice } from "@/components/dp/primitives";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/components/dp/AccountProvider";
import { supabase } from "@/lib/dp/supabase";
import { download } from "@/lib/dp/exporters";

export const Route = createFileRoute("/homologacao")({
  head: () => ({ meta: [{ title: "Homologação de campo — CARVRUM" }] }),
  component: FieldQA,
});
const VERSION = "0.3.0";
const TESTS = [
  ["01", "Instalação e abertura"],
  ["02", "Layout e navegação"],
  ["03", "Login e retorno"],
  ["04", "Permissões GPS"],
  ["05", "Câmera e foto"],
  ["06", "Início de viagem"],
  ["07", "GPS em movimento"],
  ["08", "Tela bloqueada por 20 minutos"],
  ["09", "Troca de aplicativos"],
  ["10", "Sem internet"],
  ["11", "Retorno da internet"],
  ["12", "Encerramento de viagem"],
  ["13", "Bateria e aquecimento"],
  ["14", "Dois aparelhos na mesma conta"],
  ["15", "Mudanças concorrentes"],
  ["16", "Conflito no mesmo registro"],
  ["17", "Recuperação de fotografias"],
  ["18", "Fechar e reabrir aplicativo"],
  ["19", "Isolamento entre contas"],
  ["20", "Exportação e exclusão em conta sintética"],
] as const;
type Check = { result: "pendente" | "aprovado" | "reprovado" | "bloqueado"; note: string };
type Checks = Record<string, Check>;
type Measures = Record<string, string>;
type Report = {
  id: string;
  app_version: string;
  commit_sha: string | null;
  device_platform: "android" | "ios" | "web";
  device_model: string;
  os_version: string;
  tester_name: string;
  test_date: string;
  trip_label: string;
  measures: Measures;
  checks: Checks;
  observations: string;
  status: "draft" | "completed";
  created_at: string;
};
const empty = () => ({
  device_platform: (typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent) ? "ios" : typeof navigator !== "undefined" && /Android/.test(navigator.userAgent) ? "android" : "web") as Report["device_platform"],
  device_model: "", os_version: typeof navigator !== "undefined" ? navigator.userAgent.slice(0,180) : "", tester_name: "",
  test_date: new Date().toISOString().slice(0, 10),
  trip_label: "", commit_sha: "", measures: {} as Measures,
  checks: {} as Checks, observations: "", status: "draft" as Report["status"],
});
const fieldClass = "mt-1 min-h-11 w-full rounded-md border border-input bg-secondary/40 px-3 text-base text-foreground";
const MEASURES = [
  ["odometer_start", "Hodômetro inicial (km)"],
  ["odometer_end", "Hodômetro final (km)"],
  ["gps_distance", "Distância do CARVRUM (km)"],
  ["gps_points", "Pontos GPS registrados"],
  ["duration", "Duração do teste (min)"],
  ["battery_start", "Bateria inicial (%)"],
  ["battery_end", "Bateria final (%)"],
  ["screen_locked", "Tempo com tela bloqueada (min)"],
  ["station", "Posto de combustível"],
  ["fuel_liters", "Litros abastecidos"],
  ["price_per_liter", "Preço por litro (R$)"],
  ["fuel_type", "Tipo de combustível"],
  ["weather", "Clima / trânsito"],
] as const;

function FieldQA() {
  const { user, ready } = useAccount();
  const [form, setForm] = useState(empty);
  const [id, setId] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [activeTest, setActiveTest] = useState("01");

  const [attachments,setAttachments]=useState<Record<string,{id:string;object_path:string;original_filename:string;check_id:string}[]>>({});
  const [uploading,setUploading]=useState(false);
  const reloadAttachments=useCallback(async(reportId:string)=>{
    const {data,error}=await supabase.from("carvrum_qa_attachments").select("id,object_path,original_filename,check_id").eq("report_id",reportId);
    if(error){setMessage(error.message);return;}
    const grouped:Record<string,{id:string;object_path:string;original_filename:string;check_id:string}[]>={};
    for(const row of data??[]){(grouped[row.check_id]??=[]).push(row);}
    setAttachments(grouped);
  },[]);
  useEffect(()=>{if(id&&user)void reloadAttachments(id);else setAttachments({});},[id,user,reloadAttachments]);
  async function addEvidence(checkId:string,file:File){
    if(!user)return;
    const ext:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov"};
    if(!ext[file.type]||!file.size||file.size>20*1024*1024){setMessage("Formato inválido ou arquivo acima de 20 MB.");return;}
    setUploading(true);setMessage("");
    let uploadedPath="";
    try{
      let reportId=id;
      if(!reportId){
        const {data,error}=await supabase.from("carvrum_qa_reports").insert({
          user_id:user.id,app_version:VERSION,device_platform:form.device_platform,device_model:form.device_model,
          os_version:form.os_version,tester_name:form.tester_name,test_date:form.test_date,
          trip_label:form.trip_label,commit_sha:form.commit_sha||null,checks:form.checks,measures:form.measures,
          observations:form.observations,status:form.status
        }).select("id").single();
        if(error)throw error;
        reportId=data.id as string;setId(reportId);
      }
      if(!reportId)throw Error("Não foi possível obter identificador do relatório.");
      uploadedPath=[user.id,reportId,checkId,crypto.randomUUID()+"."+ext[file.type]].join("/");
      const upload=await supabase.storage.from("carvrum-qa-evidence").upload(uploadedPath,file,{contentType:file.type,upsert:false});
      if(upload.error)throw upload.error;
      const insert=await supabase.from("carvrum_qa_attachments").insert({user_id:user.id,report_id:reportId,
        check_id:checkId,object_path:uploadedPath,original_filename:file.name,mime_type:file.type,bytes:file.size});
      if(insert.error)throw insert.error;
      await reloadAttachments(reportId);
      setMessage("Evidência salva em armazenamento privado.");
    }catch(e){
      if(uploadedPath)await supabase.storage.from("carvrum-qa-evidence").remove([uploadedPath]);
      setMessage(e instanceof Error?e.message:"Falha no envio");
    }finally{setUploading(false);}
  }
  async function viewEvidence(path:string){
    const {data,error}=await supabase.storage.from("carvrum-qa-evidence").createSignedUrl(path,60);
    if(error||!data){setMessage("Não foi possível abrir o arquivo.");return;}
    window.open(data.signedUrl,"_blank","noopener,noreferrer");
  }
  async function removeEvidence(item:{id:string;object_path:string}){
    const {error}=await supabase.storage.from("carvrum-qa-evidence").remove([item.object_path]);
    if(error){setMessage(error.message);return;}
    const deleted=await supabase.from("carvrum_qa_attachments").delete().eq("id",item.id);
    if(deleted.error){setMessage(deleted.error.message);return;}
    if(id)await reloadAttachments(id);
  }
  function openIssueDraft(key:string){
    if(!id){setMessage("Salve o relatório antes de abrir uma issue.");return;}
    const test=TESTS.find(([k])=>k===key);
    if(!test||form.checks[key]?.result!=="reprovado")return;
    const body=[
      "## Falha CARVRUM", "Relatório: "+id, "Teste: "+key+" — "+test[1],
      "Versão: "+VERSION,"Commit: "+(form.commit_sha||"não informado"),
      "Plataforma: "+form.device_platform,"Aparelho: "+form.device_model,
      "Sistema: "+form.os_version,
      "## Comportamento observado",form.checks[key]?.note||"Não descrito",
      "## Passos para reproduzir","Preencher no GitHub.",
      "## Evidências",
      String((attachments[key]??[]).length)+" arquivo(s) privados no relatório CARVRUM. Não publicar GPS, rostos, placas ou links temporários.",
      "## Reteste","- [ ] Correção aplicada\n- [ ] Reteste validado"
    ].join("\n\n");
    const query=new URLSearchParams({title:"[QA]["+VERSION+"]["+key+"] "+test[1],body});
    window.open("https://github.com/dsoncmata-hub/driveproof/issues/new?"+query.toString(),"_blank","noopener,noreferrer");
    setMessage("Rascunho aberto no GitHub. Clique em Submit new issue para efetivamente criá-la.");
  }

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.from("carvrum_qa_reports")
      .select("*").order("created_at", { ascending: false }).limit(100);
    if (error) setMessage("Falha ao carregar relatórios: " + error.message);
    else setReports((data ?? []) as Report[]);
    setLoading(false);
  }, [user]);
  useEffect(() => { void refresh(); }, [refresh]);
  const setField = (key: keyof ReturnType<typeof empty>, value: unknown) =>
    setForm(current => ({ ...current, [key]: value }));
  const setMeasure = (key: string, value: string) =>
    setForm(current => ({ ...current, measures: { ...current.measures, [key]: value } }));
  const setCheck = (key: string, patch: Partial<Check>) =>
    setForm(current => ({ ...current, checks: { ...current.checks,
      [key]: { result: "pendente", note: "", ...current.checks[key], ...patch } } }));
  const completed = TESTS.filter(([key]) => form.checks[key]?.result === "aprovado").length;
  const failed = TESTS.filter(([key]) => form.checks[key]?.result === "reprovado").length;
  const blocked = TESTS.filter(([key]) => form.checks[key]?.result === "bloqueado").length;
  const reviewed = TESTS.filter(([key]) => form.checks[key] && form.checks[key].result !== "pendente").length;
  async function save() {
    if (!user) return;
    setBusy(true); setMessage("");
    const payload = {
      user_id: user.id, app_version: VERSION,
      commit_sha: form.commit_sha.trim() || null,
      device_platform: form.device_platform, device_model: form.device_model,
      os_version: form.os_version, tester_name: form.tester_name,
      test_date: form.test_date, trip_label: form.trip_label,
      measures: form.measures, checks: form.checks, observations: form.observations,
      status: form.status,
      updated_at: new Date().toISOString(),
    };
    const request = id
      ? supabase.from("carvrum_qa_reports").update(payload).eq("id", id).select("id").single()
      : supabase.from("carvrum_qa_reports").insert(payload).select("id").single();
    const { data, error } = await request;
    if (error) setMessage("Não foi possível salvar: " + error.message);
    else { setId(data.id); setMessage("Relatório salvo na conta CARVRUM com sucesso."); await refresh(); }
    setBusy(false);
  }
  function exportCurrent() {
    download("carvrum-homologacao-" + form.test_date + ".json",
      JSON.stringify({ project: "dsoncmata-hub/driveproof", supabaseProject: "pylmernfpgcwxylzcbqi",
        version: VERSION, reportId: id, ...form, exportedAt: new Date().toISOString() }, null, 2),
      "application/json");
  }
  return <AppShell title="Homologação de campo" subtitle="Laboratório CARVRUM · versão 0.3.0">
    <div className="space-y-4">
      <Notice>Relatórios técnicos separados dos dados de viagens de clientes. Não use contas reais no ensaio de exclusão.</Notice>
      {!ready ? <Panel title="Acesso">Verificando autenticação…</Panel>
        : !user ? <Panel title="Acesso necessário">
          <p className="mb-3 text-sm">Entre na sua conta CARVRUM antes de registrar resultados. O relatório só será visível ao titular autenticado.</p>
          <Link to="/" className="underline">Ir para login</Link>
        </Panel> : <>
          <Panel title={`Teste rápido — ${reviewed}/20 registrados`}>
            <p className="mb-3 text-sm text-muted-foreground">Escolha um teste, marque o resultado e salve. Preencha detalhes apenas quando precisar.</p>
            <label className="block text-sm">O que você está testando?
              <select className={fieldClass} value={activeTest} onChange={e=>setActiveTest(e.target.value)}>
                {TESTS.map(([key,title])=><option key={key} value={key}>{key}. {title}</option>)}
              </select>
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button type="button" variant={form.checks[activeTest]?.result==="aprovado"?"default":"secondary"}
                onClick={()=>setCheck(activeTest,{result:"aprovado"})}>Aprovado</Button>
              <Button type="button" variant={form.checks[activeTest]?.result==="reprovado"?"destructive":"secondary"}
                onClick={()=>setCheck(activeTest,{result:"reprovado"})}>Reprovado</Button>
              <Button type="button" variant="outline" onClick={()=>setCheck(activeTest,{result:"bloqueado"})}>Não consegui testar</Button>
              <Button type="button" variant="outline" onClick={()=>setCheck(activeTest,{result:"pendente"})}>Limpar resultado</Button>
            </div>
            {form.checks[activeTest]?.result==="reprovado"&&
              <label className="mt-3 block text-sm">O que deu errado?
                <textarea className={fieldClass} rows={2} value={form.checks[activeTest]?.note??""}
                  onChange={e=>setCheck(activeTest,{note:e.target.value})} placeholder="Descreva o problema em uma frase."/>
              </label>}
            <div className="mt-3 space-y-2">
              <label className="block text-xs">Anexar foto ou vídeo, se necessário (máximo 20 MB)
                <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                  className="mt-1 block w-full" disabled={uploading}
                  onChange={e=>{const file=e.target.files?.[0];if(file)void addEvidence(activeTest,file);e.target.value="";}}/>
              </label>
              {(attachments[activeTest]??[]).map(item=><div key={item.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="flex-1 break-all">{item.original_filename}</span>
                <Button type="button" size="sm" variant="secondary" onClick={()=>void viewEvidence(item.object_path)}>Abrir</Button>
                <Button type="button" size="sm" variant="outline" onClick={()=>void removeEvidence(item)}>Excluir</Button>
              </div>)}
              {form.checks[activeTest]?.result==="reprovado"&&
                <Button type="button" size="sm" variant="secondary" onClick={()=>openIssueDraft(activeTest)}>Preparar issue no GitHub</Button>}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{completed} aprovados · {failed} reprovados · {blocked} bloqueados</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button disabled={busy||uploading} onClick={()=>void save()}>{busy?"Salvando…":"Salvar teste"}</Button>
              <Button variant="outline" onClick={()=>{const i=TESTS.findIndex(([key])=>key===activeTest);setActiveTest(TESTS[(i+1)%TESTS.length][0]);}}>Próximo teste</Button>
            </div>
          </Panel>
          <Button variant="outline" className="w-full" onClick={()=>setShowDetails(!showDetails)}>
            {showDetails?"Ocultar detalhes técnicos":"Mostrar detalhes técnicos (opcional)"}
          </Button>
          {showDetails&&<>
          <Panel title="Identificação do ensaio">
            <p className="mb-3 text-xs text-muted-foreground">Conta: {user.email} · ID: {id ?? "novo relatório"}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([
                ["tester_name", "Responsável"],
                ["device_model", "Modelo do aparelho"],
                ["os_version", "Versão Android/iOS"],
                ["trip_label", "Identificador da viagem"],
                ["commit_sha", "Commit GitHub (opcional)"],
              ] as const).map(([key, title]) =>
                <label key={key} className="text-sm">{title}
                  <input className={fieldClass} value={form[key]} onChange={e => setField(key, e.target.value)}/>
                </label>)}
              <label className="text-sm">Plataforma
                <select className={fieldClass} value={form.device_platform}
                  onChange={e => setField("device_platform", e.target.value)}>
                  <option value="android">Android</option><option value="ios">iPhone / iOS</option><option value="web">Web</option>
                </select>
              </label>
              <label className="text-sm">Data
                <input type="date" className={fieldClass} value={form.test_date}
                  onChange={e => setField("test_date", e.target.value)}/>
              </label>
            </div>
          </Panel>

          <Panel title="Medições">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {MEASURES.map(([key, title]) => <label key={key} className="text-sm">{title}
                <input className={fieldClass} value={form.measures[key] ?? ""}
                  onChange={e => setMeasure(key, e.target.value)}/>
              </label>)}
            </div>
          </Panel>

          </>}
          <Panel title="Conclusão">
            <label className="block text-sm">Observações gerais
              <textarea rows={4} className={fieldClass} value={form.observations}
                onChange={e => setField("observations", e.target.value)}
                placeholder="Rota, clima, comportamento do GPS, rede e bateria."/>
            </label>
            <label className="mt-3 block text-sm">Estado do relatório
              <select className={fieldClass} value={form.status}
                onChange={e => setField("status", e.target.value)}>
                <option value="draft">Rascunho</option>
                <option value="completed">Execução concluída</option>
              </select>
            </label>
            {form.status === "completed" && (reviewed < 20 || failed > 0 || blocked > 0) &&
              <p className="mt-2 text-xs text-amber-400">Execução concluída não significa homologação aprovada. Existem testes pendentes ou falhas.</p>}
            {message && <p role="status" className="mt-3 text-sm">{message}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => void save()}>{busy ? "Salvando…" : id ? "Atualizar relatório" : "Salvar relatório"}</Button>
              <Button variant="secondary" onClick={exportCurrent}>Exportar JSON</Button>
              <Button variant="outline" onClick={() => { setForm(empty()); setId(null); setMessage(""); }}>Novo teste</Button>
            </div>
          </Panel>
          <Panel title="Histórico de homologações">
            <Button variant="secondary" onClick={() => { setShowHistory(!showHistory); void refresh(); }}>
              {showHistory ? "Ocultar histórico" : "Ver relatórios salvos"}
            </Button>
            {loading && <p className="text-sm">Carregando…</p>}
            {showHistory && <div className="mt-3 space-y-2">
              {reports.length === 0 && <p className="text-sm">Nenhum relatório salvo nesta conta.</p>}
              {reports.map(report => <button key={report.id} type="button"
                className="w-full rounded-lg border p-3 text-left text-sm hover:bg-secondary/40"
                onClick={() => { setId(report.id); setForm({ ...empty(), ...report, commit_sha: report.commit_sha ?? "",
                  measures: report.measures ?? {}, checks: report.checks ?? {} }); setMessage("Relatório carregado para edição."); window.scrollTo({top:0,behavior:"smooth"}); }}>
                {report.test_date} · {report.device_platform.toUpperCase()} · {report.device_model || "Aparelho não informado"} · {report.status === "completed" ? "Concluído" : "Rascunho"}
              </button>)}
            </div>}
          </Panel>
        </>}
    </div>
  </AppShell>;
}
