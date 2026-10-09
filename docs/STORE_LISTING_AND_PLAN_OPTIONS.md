# CARVRUM — Pacote de preparação para lojas (rascunho não submetido)

## Nome e proposta de valor
CARVRUM — Viagens, consumo e custos do veículo

Resumo curto (Google Play, revisar limite de caracteres): Controle viagens, abastecimentos e consumo com registros organizados.

Descrição longa — descrever apenas recursos comprovados no binário submetido:
CARVRUM permite registrar viagens por GPS, documentar abastecimentos, preservar evidências fotográficas e consultar relatórios do uso do veículo. As funções nativas de localização podem exigir permissões explícitas e devem ser validadas em dispositivos físicos. Recursos de análises financeiras avançadas, multiveículos, assinatura Pro e Frota estão em desenvolvimento e NÃO devem ser anunciados como disponíveis antes de implementados e validados.

## Planos propostos (não ativados)
- Free: gratuito. Funcionalidades liberadas devem refletir a build efetiva.
- Pro: preço de hipótese R$ 14,90/mês (não há assinatura comercial habilitada).
- Frota: preço de hipótese a partir de R$ 49,90/mês (sem compra habilitada).
Não publicar compras dentro do app nem metadados de produtos pagos antes de integrar cobrança oficial, gerenciamento, restauração, cancelamento, recibos e fluxos de reembolso exigidos.

## Bloqueadores obrigatórios
- Conta Google Play Console e Apple Developer habilitadas, identidade verificada.
- Assinatura Android comercial com Play App Signing; certificados/provisionamento iOS e arquivo de distribuição.
- Provas em aparelhos físicos Android/iOS e GPS em segundo plano sob diferentes estados de energia e permissões.
- Screenshots reais dos binários; ícones, classificações etárias, textos das permissões e política de privacidade com identificação do controlador e contato de suporte.
- Data Safety (Google) / App Privacy (Apple), fluxo público de exclusão de conta e processo de suporte.
- Fluxo de compras e assinatura efetivamente implementado antes de ativar ofertas pagas.
- TestFlight e faixas de teste Google Play conforme elegibilidade da conta; submissão e aprovação efetivas.

## Segurança de lançamento
Não incluir tokens privados no cliente. Evitar claims de economia comprovada, diagnóstico ou rastreamento ininterrupto quando não demonstrados. Preservar backups existentes e dados legados. Nenhum teste sintético deve gerar cobranças.
