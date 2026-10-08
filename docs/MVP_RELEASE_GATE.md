# CARVRUM — prontidão comercial, versão 0.3.0

Fonte oficial: `dsoncmata-hub/driveproof`. Web: https://driveproof-taupe.vercel.app/.

## Implementado e validado tecnicamente

- IndexedDB separado por conta, importação do formato legado sem apagar a origem, fechamento do espaço ao sair e retomada offline de sessão previamente verificada.
- GPS persistido incrementalmente em blocos de 500 pontos, cálculo incremental de métricas e rastreador que permanece ativo entre rotas.
- Sincronização privada em três versões, protocolo de blocos GPS imutáveis e CAS; cliente antigo não pode substituir snapshot de protocolo 2.
- Preservação e exportação das duas versões em conflitos; fotos verificadas por SHA-256, recuperação e reparo com preservação dos bytes divergentes.
- Consentimento de localização revogável, exportação dos registros/originais, rotas de privacidade, termos e exclusão autenticada.
- Função Supabase de exclusão publicada: sessão recente, bloqueio de alterações durante processamento, remoção de arquivos/cópias operacionais do titular e revogação de sessões.
- Teste real de exclusão com conta temporária: login, foto, snapshot, backup manual, exclusão e recusa do JWT antigo. Fixtures removidas; conta, objeto, revisão e conteúdo anteriores preservados.
- Projetos Capacitor Android/iOS com assets embarcados, integração GPS nativa, câmera, compartilhamento de arquivos e retorno PKCE vinculado a nonce.
- CI sequencial: testes web, assets nativos estáticos, Android APK de teste/AAB sem assinatura comercial e iOS para simulador. Compilação não comprova funcionamento em telefone físico.

## Ainda impede o lançamento comercial

- Testar em dois aparelhos físicos, GPS com tela bloqueada/segundo plano, ausência de rede, bateria, atualização do aplicativo, sincronização concorrente e recuperação de fotos reais.
- Configurar/confirmar o redirect `carvrum://auth-callback**` no Supabase e testar login nativo. iOS oferece acesso por e-mail; Google permanece na web/Android. Não pressupor autorização de Sign in with Apple.
- Contas Apple Developer/Play Console, titular do aplicativo e identificador definitivo. `com.dsoncmata.carvrum` é um namespace técnico provisório.
- Assinaturas e certificados mantidos fora do repositório, TestFlight/teste interno, screenshots reais, conta de revisão e aprovação das lojas.
- Identificação comercial do controlador, contato de privacidade/suporte, retenção, validação jurídica dos textos e formulários de privacidade das lojas.
- Preços, condições comerciais e decisão entre venda do aplicativo, assinatura ou piloto gratuito. Cobrança, restauração de compras e cancelamento dependem dessa decisão e dos produtos cadastrados nas lojas.
- Monitoramento de produção com redação de dados pessoais e orçamento/limites de armazenamento.

## Restrição preservada

O job de backup `0 */12 * * *`, função de captura e função de status não foram alterados. A exclusão explicitamente solicitada pelo titular remove suas cópias operacionais, sem alterar agendamento ou apagar dados de outros titulares. O aviso do advisor para `driveproof_backup_status` foi registrado; sua correção exige uma etapa futura no escopo de backups. As tabelas privadas sem políticas são intencionalmente inacessíveis pela API comum.

Pronto para compilação/teste não significa pronto para submissão. Disponível para venda exige aprovação das lojas e operação comercial definida.
