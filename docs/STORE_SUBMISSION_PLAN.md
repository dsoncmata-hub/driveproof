# CARVRUM — preparação para App Store e Google Play

Estado: web validada em ambiente controlado; não há AAB/IPA assinado nem publicação nas lojas.

## Caminho técnico

Manter este repositório como fonte oficial. Para reaproveitar a interface React, a opção técnica é um shell Capacitor com assets locais, integração nativa de GPS, câmera, armazenamento persistente e OAuth. O projeto atual gera SSR para Vercel: o resultado do servidor não pode ser simplesmente copiado para um pacote móvel. Antes de adicionar plataformas, produzir e testar uma entrada cliente estática que reutilize as rotas/domínio sem servidor de renderização obrigatório.

A escolha de um plugin de localização em segundo plano exige revisar licença e custo antes de instalar. Um WebView remoto da Vercel não resolve, por si só, rastreamento contínuo, suspensão de JavaScript ou retenção de dados offline. Não foi adicionado um shell sem validação para aparentar prontidão.

## Portões para submissão

1. Identidade do publicador: entidade, conta Apple Developer/Play Console, domínio de suporte e titularidade do nome comercial. Identificador de aplicativo definido após isso, sem presumir domínio registrado.
2. Builds nativos: plataforma iOS e Android versionada, assets locais, armazenamento por conta, integração de GPS em segundo plano, fluxo de permissão/consentimento, OAuth/deep links, assinatura e distribuição interna.
3. Validação física: iniciar viagem, bloquear tela por 20 minutos, alternar aplicativos, perder rede, reiniciar aplicativo, reconectar, sincronizar dois aparelhos e recuperar fotos. Medir perda de amostras e consumo de bateria. Não anunciar captura com aplicativo encerrado sem comprovação por plataforma.
4. Privacidade: controlador identificado, contato para direitos, política acessível no app e no site, finalidade de GPS/fotografias, fornecedores, retenção, consentimento e revogação, formulários de privacidade/Data safety coerentes com o comportamento real.
5. Exclusão: início de exclusão dentro do app; reautenticação, revogação de sessões, processamento de dados/objetos/backups segundo política definida, confirmação ao usuário. Para Google Play, verificar também o recurso web de solicitação aplicável. A rotina atual de backups não foi alterada; sua retenção precisa integrar a política antes da oferta comercial.
6. Comercial: planos/preços, recursos pagos, sistema de cobrança adequado ao tipo de produto e às regras de cada loja, restauração de compras, cancelamento e suporte. Nenhum preço ou cobrança foi inventado nesta implementação.
7. Material de loja: ícones nativos, screenshots de aparelhos suportados, descrição sem promessa de precisão pericial ou GPS contínuo não testado, conta de revisão e instruções detalhadas.
8. Observabilidade e lançamento: monitoramento com redação de dados pessoais, limites de Storage, rastreamento incremental, testes de carga, canal de suporte, piloto controlado, build aprovado e listagem publicada.

## Referências oficiais consultadas

- [Apple: exclusão de conta no aplicativo](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Apple: diretrizes de revisão](https://developer.apple.com/app-store/review/guidelines/br/)
- [Google Play: localização em segundo plano](https://support.google.com/googleplay/android-developer/answer/9799150)
- [Capacitor: documentação](https://capacitorjs.com/docs)
- [Capacitor: ambiente de desenvolvimento](https://capacitorjs.com/docs/getting-started/environment-setup)

Esses portões são requisitos de desenvolvimento e validação, não uma confirmação de aprovação das lojas. As regras devem ser revistas na data da submissão.
