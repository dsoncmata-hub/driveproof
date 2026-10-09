import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/dp/AppShell";
export const Route = createFileRoute("/termos")({
  head: () => ({ meta: [{ title: "Condições de uso — CARVRUM" }] }),
  component: () => (
    <AppShell title="Condições de uso">
      <div className="space-y-4 text-sm">
        <p>
          Versão técnica de validação. Planos, preços, responsável comercial, suporte e condições de
          contratação ainda precisam ser publicados antes da oferta de serviços pagos.
        </p>
        <p>
          Use o CARVRUM apenas com o veículo parado ao preencher informações, capturar arquivos ou
          operar telas. Os registros auxiliam o acompanhamento do veículo; não substituem
          manutenção, diagnóstico profissional ou avaliação pericial.
        </p>
        <p>
          Distância GPS, velocidades e consumo dependem do sensor, das permissões e da qualidade dos
          dados informados. Lacunas do GPS não são preenchidas como se fossem leituras reais. O
          comparativo de combustível por posto considera ciclos de tanque cheio e deve ser
          interpretado junto com rota, trânsito, combustível e condições do veículo.
        </p>
        <p>
          Você decide quais registros e originais enviar à sua conta. Não anexe dados de terceiros
          sem autorização. Evite apagar o armazenamento local antes de verificar os registros e
          arquivos recuperados em outro aparelho.
        </p>
        <p>
          A versão atual não implementa cobrança ou compra dentro do aplicativo. Não há renovação,
          assinatura ou débito automático ativo no CARVRUM.
        </p>
        <Link to="/privacidade" className="underline">
          Privacidade e controle dos dados
        </Link>
      </div>
    </AppShell>
  ),
});
