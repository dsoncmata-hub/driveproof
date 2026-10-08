# CARVRUM 0.2.0 — validação técnica

## Alterações implementadas

- GPS: persistência imediata de amostras, vínculo explícito com a viagem, leitura síncrona da viagem ativa, conferência antes de encerrar/descartar, timestamps monotônicos, filtros de precisão e velocidade, ausência de interpolação em lacunas superiores a 60 segundos e tempo em movimento separado do tempo total.
- Sincronização: comparação em três versões (base reconhecida/aparelho/nuvem), união de alterações independentes, propagação de exclusões quando existe base, revisão explícita de divergências e preservação local de ambas as versões antes de aplicar escolhas.
- Proteção de conta: confirmação de identidade antes de operações e antes de aplicar resultados, vínculo dos registros locais à conta proprietária, bloqueio de outra conta no mesmo perfil do navegador e chave de componente específica por conta.
- Concorrência: exclusão mútua com Web Locks quando disponível e controle de revisão atômico no servidor. Alterações locais durante uma requisição permanecem preservadas. Sem Web Locks, há proteção no mesmo contexto JavaScript; a revisão no servidor continua obrigatória.
- Fotografias: downloads privados, conferência de tipo/tamanho/SHA-256, verificação também de arquivos locais e de uploads repetidos, originais imutáveis através da API do cliente e atualização de miniaturas sem recarregar a página.
- Persistência: falhas de escrita não são mais apresentadas como gravação bem-sucedida em memória. Falhas de leitura não são convertidas silenciosamente em banco vazio.
- Interface: CARVRUM nas telas e metadados, controles de viagem aguardam hidratação antes de aceitar entrada e botões aguardam seus manipuladores de eventos.
- Engenharia: lockfile npm, versão Supabase fixada, comandos de verificação, testes Vitest/Playwright e pipeline GitHub Actions.

## Evidências executadas

- 44 testes Vitest: consumo, atribuição ao posto, GPS, ciclo de vida do rastreamento, validação de snapshots, conciliação, identidade e integridade de arquivos.
- Sete testes de navegador: navegação mobile, início/finalização de viagem, hodômetro inválido, telas sem registros, restauração de metadados, recuperação de fotografia com SHA-256, revisão de conflito, bloqueio de restauração sobre aparelho com registros e convergência de dois contextos isolados.
- Dez verificações reais no Supabase: inserção inicial, recusa de inserção duplicada, atualização por revisão, recusa de revisão antiga, recusa de escrita direta, snapshot inválido, isolamento de leitura/atualização entre contas, isolamento do Storage e recusa de acesso anônimo. Fixtures executadas em subtransação revertida; nenhum usuário de teste permaneceu.
- TypeScript sem erros; lint das áreas alteradas; build Vite/Nitro para Vercel gerado.
- `npm audit`: zero vulnerabilidades reportadas nas dependências instaladas no momento da execução. Isso não equivale a uma auditoria de segurança completa.

Os testes de navegador de sincronização interceptam a API com fixtures determinísticas. Validam interface, IndexedDB, Web Crypto e fluxo de conciliação; não substituem OAuth real nem testes de rede e GPS em aparelhos físicos. Os testes de isolamento/revisão SQL usam o projeto Supabase real.

## Preservação verificada no Supabase

Antes e depois da migração, sem alteração:

- snapshot existente: revisão 3, MD5 `6fec0609c433979d227d45381023e85f`;
- fotografia existente: um objeto, sem remoção ou substituição;
- cron: job 1, ativo, `0 */12 * * *`, hash do comando `525548b2249cab6b20760ef055668e91`;
- função `capture_12h`: hash `cfd7808b221fd2e6852604b310056d8f`;
- função `driveproof_backup_status`: hash `560ac463d335728f330e3fe6b5f5d493`.

A migração altera acesso à sincronização e à atualização de originais. Não altera frequência, comandos ou funções da rotina de backups.

## Limites que permanecem

- GPS web não é telemetria nativa contínua em segundo plano. Falhas e lacunas são explicitadas; não inventamos distância.
- Snapshot monolítico limitado a 4 MB; registros e base reconhecida ocupam localStorage. Sessões longas precisam de persistência incremental em IndexedDB/SQLite e envio de pontos em lotes antes de escala comercial.
- Originais inválidos já presentes são preservados e reportados, sem substituição automática. Recuperação assistida de originais corrompidos ainda precisa de fluxo dedicado.
- O navegador mantém os registros ao sair da conta. Outra conta tem operações de nuvem bloqueadas; isolamento físico dos dados por conta no aparelho ainda precisa ser implementado antes de uso em aparelhos compartilhados.
- Versões divergentes revisadas ficam apenas no aparelho; ainda não há interface para consultar/exportar todas as revisões arquivadas nem retenção definida.
- Conflitos que resultariam em evidências órfãs são bloqueados. A revisão guiada de relações pai/filho permanece pendente.
- Não foram validados iPhone/Android físicos, bateria, GPS em tela bloqueada, OAuth real nesta execução, assinatura de builds ou lojas.
- O conector Vercel está na equipe Senda Moda. A implantação existente está em `drive-proof`, sem autorização de API nessa equipe. A publicação pode ocorrer pela integração GitHub existente; inspeção de logs/configuração depende do acesso correto.

## Continuação 0.3.0 — armazenamento privado e aplicativos

- 73 testes Vitest passaram: isolamento local por conta, importação sem apagar legado, falha de persistência, blocos GPS, CAS/conflitos, sessão offline, nonce PKCE e lifecycle do rastreador nativo.
- Dez fluxos Playwright passaram na web. Incluem concorrência em dois contextos isolados, logout/conta A/conta B/retorno à A, abertura offline e reparo de foto que conserva os bytes divergentes.
- TypeScript, build web, build SPA nativa e lint do núcleo passaram (somente o aviso preexistente de Fast Refresh do botão). `npm audit --omit=dev --audit-level=high`: zero vulnerabilidades.
- Dez assertions RLS/CAS e seis assertions de exclusão/sessões passaram no Supabase real, com transações revertidas e zero fixtures restantes.
- Exclusão real HTTP/SDK: uma conta sintética foi criada, autenticada, recebeu snapshot/protocolo 2, foto e backup manual. A Edge Function publicada removeu os dados e a conta; o JWT antigo foi recusado. A fixture foi removida. Nenhuma credencial ou token real foi versionado.
- Depois das migrations e dos testes: permanece uma conta e um objeto existentes; snapshot revisão 3 e MD5 `6fec0609c433979d227d45381023e85f`. Job ativo `0 */12 * * *`, MD5 do comando `525548b2249cab6b20760ef055668e91`. Função de captura MD5 `cfd7808b221fd2e6852604b310056d8f`; função de status MD5 `560ac463d335728f330e3fe6b5f5d493`. Iguais à linha de base.
- Advisor: dois avisos permanecem — proteção contra senhas vazadas desativada e RPC de status do backup SECURITY DEFINER. O login de produto usa Google/e-mail; não foi alterada configuração Auth administrativa nem rotina de backups. Tabelas privadas sem políticas são intencionalmente negadas a clientes.

A CI inclui compilação Android (APK debug, AAB release sem assinatura comercial e lint) e iOS para simulador. Consultar o resultado efetivo da execução vinculada à PR antes de considerar esses pacotes validados. Nenhum ensaio em telefone físico, assinatura de distribuição ou publicação nas lojas foi realizado neste ambiente.
