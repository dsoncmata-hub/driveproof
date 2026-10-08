import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/dp/AppShell";
import { Notice, Panel } from "@/components/dp/primitives";

export const Route = createFileRoute("/metodologia")({
  head: () => ({
    meta: [
      { title: "Metodologia — CARVRUM" },
      {
        name: "description",
        content:
          "Como o CARVRUM mede consumo, quais variáveis afetam o resultado e quais são os limites técnicos da medição.",
      },
      { property: "og:title", content: "Metodologia — CARVRUM" },
      {
        property: "og:description",
        content: "Variáveis de consumo, método bomba-a-bomba, integridade por hash e limitações.",
      },
    ],
  }),
  component: Metodologia,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel title={title}>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </Panel>
  );
}

function Metodologia() {
  return (
    <AppShell title="Metodologia" subtitle="Como medimos e o que não podemos afirmar">
      <div className="space-y-4">
        <Notice tone="warning">
          Este aplicativo registra evidências e condições de teste. Ele não realiza diagnóstico
          automotivo, não atesta defeito e não constitui prova pericial.
        </Notice>

        <Section title="1. O que é medido">
          <p>
            Distância por GPS (soma de trechos entre coordenadas), tempo, velocidade instantânea,
            média e máxima, variação de altitude quando o aparelho fornece, e todas as variáveis que
            você informa no checklist antes da viagem.
          </p>
          <p>
            O consumo físico só é calculado quando existem litros e quilometragem confiáveis: na
            viagem, com os litros que você informar; no histórico de abastecimentos, pelo método
            bomba-a-bomba.
          </p>
        </Section>

        <Section title="2. Método bomba-a-bomba">
          <p>
            Só são usados abastecimentos marcados como <strong>tanque cheio</strong>. A distância é
            a diferença de hodômetro entre dois enchimentos completos, e os litros são os do
            enchimento final do intervalo. Abastecimentos parciais entram no histórico de custo, mas
            ficam fora do cálculo de km/L.
          </p>
          <p>
            Fontes de erro conhecidas: desligamento do bico em momentos diferentes, inclinação do
            terreno no posto, temperatura do combustível, e imprecisão do próprio hodômetro.
          </p>
        </Section>

        <Section title="3. Variáveis que afetam consumo e dirigibilidade">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Pressão dos pneus:</strong> pressão baixa aumenta resistência ao rolamento.
              Medições com pneus quentes indicam valores maiores que com pneus frios — por isso
              registramos a condição da medição.
            </li>
            <li>
              <strong>Carga e ocupantes:</strong> mais massa exige mais energia, principalmente em
              trajeto urbano com muitas retomadas.
            </li>
            <li>
              <strong>Ar-condicionado:</strong> o compressor consome potência do motor; o efeito
              varia com a temperatura ajustada e a temperatura externa.
            </li>
            <li>
              <strong>Temperatura ambiente e partida a frio:</strong> motor frio opera com mistura
              mais rica até atingir a temperatura de trabalho.
            </li>
            <li>
              <strong>Tipo de trajeto e trânsito:</strong> urbano com paradas consome mais que
              rodovia em velocidade estável.
            </li>
            <li>
              <strong>Combustível:</strong> etanol tem menor energia por litro que gasolina; a
              mistura no tanque altera o km/L de forma esperada.
            </li>
            <li>
              <strong>Janelas abertas:</strong> aumentam o arrasto aerodinâmico em velocidade
              rodoviária.
            </li>
            <li>
              <strong>Via e altimetria:</strong> chuva, piso molhado e subidas aumentam o consumo.
            </li>
            <li>
              <strong>Modo de condução e estilo do motorista:</strong> acelerações fortes e
              frenagens tardias pesam muito no resultado.
            </li>
          </ul>
        </Section>

        <Section title="4. Índice de comparabilidade">
          <p>
            Ao comparar duas viagens, o app pontua a semelhança das condições (pneus, carga, AC,
            temperatura, trajeto, trânsito, combustível, partida a frio, janelas) e mostra quais
            variáveis reduziram a comparabilidade.
          </p>
          <p>
            O índice <strong>não corrige</strong> o consumo medido. Ele apenas indica o quanto duas
            medições podem ser confrontadas. Variáveis não informadas contam como desconhecidas e
            reduzem a confiança da comparação.
          </p>
        </Section>

        <Section title="5. Integridade das evidências">
          <p>
            Cada foto recebe data/hora, coordenada quando disponível, categoria e o hash SHA-256 do
            arquivo original. O arquivo é guardado sem reescrita no próprio aparelho; se o conteúdo
            mudar, o hash muda.
          </p>
          <p>
            Cada viagem gera um manifesto de integridade: a lista de hashes das evidências, o hash
            do trajeto registrado e um hash do próprio manifesto.
          </p>
          <p>
            Isso demonstra consistência interna do registro. Não substitui perícia, cadeia de
            custódia formal nem laudo técnico.
          </p>
        </Section>

        <Section title="6. Limitações técnicas conhecidas">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              GPS de celular tem erro típico de alguns metros; túneis, garagens e prédios degradam o
              sinal e a distância medida.
            </li>
            <li>
              Em PWA no iPhone, o rastreamento pausa com a tela bloqueada ou o app em segundo plano.
              Registro contínuo exigiria um aplicativo nativo iOS.
            </li>
            <li>
              A câmera do navegador oferece menos controle de metadados que a câmera nativa; fotos
              importadas da galeria não garantem quando foram feitas.
            </li>
            <li>O relógio usado é o do aparelho e pode ser alterado pelo usuário.</li>
            <li>
              O consumo indicado pelo computador de bordo é digitado manualmente e depende da
              leitura correta da tela do veículo.
            </li>
            <li>
              Leitura direta da central do veículo (OBD-II por Bluetooth) está prevista para uma
              fase futura e não existe nesta versão.
            </li>
          </ul>
        </Section>

        <Section title="7. Como fazer um teste mais confiável">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Mesma rota, mesmo sentido, faixa de horário parecida.</li>
            <li>Pneus medidos frios, com a mesma pressão alvo em todas as repetições.</li>
            <li>Mesma quantidade de ocupantes e carga.</li>
            <li>AC no mesmo estado e mesma temperatura.</li>
            <li>Tanque cheio no mesmo posto e mesmo bico, antes e depois.</li>
            <li>Fotografe painel e bomba em cada ponta do teste.</li>
            <li>Repita pelo menos três vezes por configuração.</li>
          </ol>
        </Section>
      </div>
    </AppShell>
  );
}
