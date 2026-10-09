import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/dp/AppShell";
import { Panel, Notice } from "@/components/dp/primitives";
import { Button } from "@/components/ui/button";
import { download } from "@/lib/dp/exporters";
import { APP_VERSION, readDb } from "@/lib/dp/store";
import { PRIVACY_VERSION } from "@/lib/dp/privacy";
export const Route = createFileRoute("/privacidade")({
  head: () => ({ meta: [{ title: "Privacidade — CARVRUM" }] }),
  component: PrivacyPage,
});
function PrivacyPage() {
  return (
    <AppShell title="Privacidade e meus dados">
      <div className="space-y-4">
        <Notice tone="warning">
          CARVRUM está em validação. A identificação comercial do responsável, contato de
          privacidade e condições de cobrança precisam ser definidos antes da oferta comercial. Esta
          página descreve o comportamento técnico atual.
        </Notice>
        <Panel title="Dados e finalidades">
          <p className="text-sm">
            Registramos os dados que você informa sobre veículo, viagens, checklist, abastecimentos
            e postos. Com sua autorização, o GPS registra coordenadas, horário, velocidade, altitude
            e precisão para calcular trajetos e consumo. Fotografias e arquivos escolhidos são
            preservados como originais, junto com seus metadados e SHA-256. Arquivos podem conter
            informações pessoais e localização; confira o que deseja anexar.
          </p>
        </Panel>
        <Panel title="Onde os dados ficam">
          <p className="text-sm">
            Registros e originais ficam no armazenamento local desta instalação, separados por
            conta. O envio à nuvem é opcional: a sincronização envia registros e pontos GPS; fotos
            são enviadas pelo comando específico. Usamos Supabase para autenticação, banco e
            arquivos privados, e Vercel para hospedagem web. O login Google usa o Google como
            provedor de identidade. Não há publicidade comportamental nem venda de dados
            implementadas nesta versão.
          </p>
          <p className="mt-2 text-sm">
            Uma sessão já verificada pode abrir seus registros locais offline. Revogações e
            exclusões remotas só podem ser verificadas quando o aparelho volta à rede. O isolamento
            da interface não substitui a proteção do aparelho. Pessoas com acesso administrativo ao
            navegador ou dispositivo podem acessar seu armazenamento. Use bloqueio de tela e evite
            aparelhos compartilhados.
          </p>
        </Panel>
        <Panel title="Permissões e revogação">
          <p className="text-sm">
            O GPS inicia após sua autorização e permissão do sistema. Você pode pausar o GPS,
            revogar o registro na tela Viagem, desativar a sincronização e sair da conta. No
            navegador, tela bloqueada e segundo plano podem interromper o GPS. No aplicativo nativo
            em validação, há integração de localização em segundo plano durante uma viagem ativa; a
            continuidade depende da plataforma e das permissões.
          </p>
        </Panel>
        <Panel title="Cópias e exclusão">
          <p className="text-sm">
            Registros permanecem até serem removidos por você ou pelo fluxo de exclusão de conta. O
            CARVRUM mantém cópias operacionais periódicas; elas são removidas para o titular quando
            sua exclusão é processada. Cópias de infraestrutura geridas pelos fornecedores seguem
            seus próprios processos de retenção e acesso restrito. Exportações salvas por você e
            cópias em aparelhos offline precisam ser removidas nesses locais. Não declaramos um
            prazo de retenção comercial antes de defini-lo.
          </p>
        </Panel>
        <Panel title="Exportar ou excluir">
          <p className="mb-3 text-sm">
            A exportação JSON inclui os registros e pontos GPS desta instalação; os arquivos
            originais de fotos devem ser exportados separadamente. Proteja o arquivo exportado.
          </p>
          <Button
            onClick={() =>
              download(
                "carvrum-meus-dados.json",
                JSON.stringify(
                  {
                    appVersion: APP_VERSION,
                    privacyVersion: PRIVACY_VERSION,
                    exportedAt: new Date().toISOString(),
                    records: readDb(),
                  },
                  null,
                  2,
                ),
                "application/json",
              )
            }
          >
            Exportar meus registros e pontos GPS
          </Button>
          <p className="mt-3">
            <Link className="underline" to="/excluir-conta">
              Solicitar exclusão da minha conta
            </Link>
          </p>
          <p className="mt-3">
            <Link className="underline" to="/termos">
              Condições de uso
            </Link>
          </p>
        </Panel>
        <p className="text-xs text-muted-foreground">Versão do aviso: {PRIVACY_VERSION}</p>
      </div>
    </AppShell>
  );
}
