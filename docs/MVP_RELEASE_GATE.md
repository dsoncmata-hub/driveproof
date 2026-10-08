# CARVRUM — checklist de prontidão comercial do MVP

> Produto em desenvolvimento: código atual em `dsoncmata-hub/driveproof`; ambiente web atual: https://driveproof-taupe.vercel.app/.
> **Ainda não autorizado a anunciar "disponível para venda na App Store/Google Play".**
> Nome CARVRUM depende de confirmação de marcas e disponibilidade; não assumir titularidade jurídica.

## Funcionalidades com evidência parcial
- [x] Login Google redireciona corretamente e usuário confirmou sessão.
- [x] Snapshot de viagens/abastecimentos/evidências enviado ao Supabase e recuperado em outro navegador.
- [x] Foto original JPEG enviada ao Storage privado e associada a metadados sincronizados.
- [x] Políticas RLS do Supabase configuradas para registros individuais.
- [x] Bloqueios contra escrita em nuvem quando versão remota diverge.
- [ ] Testes automatizados de isolamento real entre **duas contas** distintos.
- [ ] Teste cruzado de dois aparelhos com alterações simultâneas e conflito.
- [ ] Teste do fluxo completo de recuperação de foto + SHA-256 em aparelho novo.
- [ ] Cobertura de restauração com dispositivos com dados preexistentes sem risco de perda.
- [ ] Confirmar limites de armazenamento/custos e política de retenção de fotos e snapshots.
- [ ] Política de privacidade, termos e consentimento LGPD (GPS, fotos, conta Google).
- [ ] Fluxo de exclusão de conta e dados pessoais.
- [ ] Aplicativo iOS/Android empacotado, assinatura e publicação/validação nas lojas (PWA web não equivale a aplicativo nativo).
- [ ] Avaliação das limitações de GPS em segundo plano no iPhone; decidir tecnologia nativa para telemetria contínua.
- [ ] Pagamentos, precificação, condições comerciais e documentação fiscal quando aplicável.
- [ ] Marca/ícones/telas e nome comercial confirmados e consistentes em todos os ambientes.
- [ ] Testes end-to-end de produção, telemetria de erros e suporte.
- [ ] Revisão de segurança e permissões de repositório, variáveis de ambiente e infraestrutura.

## Critério para notificação de prontidão
Somente após testes e evidências para todos os requisitos obrigatórios, distingue-se:
1. **Pronto para submissão** — build de loja e documentação completos;
2. **Disponível para venda** — loja aprovou e listagem está efetivamente publicada com comercialização operante.

## Limites operacionais
A rotina pg_cron 0 */12 * * * foi instalada para snapshots de dados no banco. Essa rotina não protege automaticamente os binários existentes no Storage. Não alterar rotina sem necessidade; desenvolvimento funcional tem prioridade definida pelo usuário.

Acompanhamento de prontidão deve ser fundamentado em execução real de CI/testes, não apenas em commits publicados na Vercel.
