# CARVRUM — preparação para App Store e Google Play

## Builds reproduzíveis

```sh
npm ci --ignore-scripts
npm run native:sync
npm run native:android
npm run native:ios
```

`build:native` prerenderiza o shell SPA e gera `dist-native/public/index.html`. Apenas os assets públicos são copiados pelo Capacitor; o servidor SSR não é embarcado. Não há `server.url` remoto. Android usa API 36, Java 21, GPS em serviço de primeiro plano e notificação visível. iOS declara localização em segundo plano, câmera, acesso a fotos e manifesto de privacidade. Ícones derivam do SVG CARVRUM existente. Versão de pacote 0.3.0, build 3; namespace provisório `com.dsoncmata.carvrum`.

A CI em `.github/workflows/validate.yml` valida web → SPA estática → Android → iOS, preservando a sequência. APK debug serve para testes; AAB release sem assinatura e app de simulador não podem ser publicados nas lojas. Não cadastrar chaves privadas em arquivos versionados.

Plugin de GPS: `@capacitor-community/background-geolocation@1.2.26`, licença MIT. O aviso do CLI sobre Capacitor 7 deve ser confrontado com compilação das plataformas; o Package.swift distribuído aceita Capacitor 8. Android usa `useLegacyBridge` conforme instrução do plugin para reduzir suspensão do JavaScript. Nada nesta configuração garante rastreamento após encerramento forçado do aplicativo.

## Autenticação

Supabase nativo usa PKCE. Adicionar `carvrum://auth-callback**` à allowlist de redirects do projeto `pylmernfpgcwxylzcbqi`. O handler aceita somente host/caminho/nonce/code corretos, com solicitação iniciada há menos de dez minutos. Segredos e tokens não aparecem em logs. O acesso Google já existente permanece na web/Android; iOS oferece e-mail para evitar publicar uma opção social sem os serviços equivalentes exigidos pela revisão. Se Google for oferecido no iOS posteriormente, implementar/configurar a alternativa de privacidade exigida pela regra 4.8.

## Ensaio obrigatório em aparelhos

1. Instalar APK e build iOS assinado de teste. Autorizar GPS, iniciar viagem, trocar de rota, bloquear tela por vinte minutos e alternar aplicativos.
2. Ficar sem rede, capturar fotografia, encerrar viagem, reabrir e conferir pontos e SHA-256. Revogar consentimento e confirmar interrupção do rastreador.
3. Mesma conta em dois aparelhos: sincronizar alterações independentes e concorrentes, revisar conflitos, confirmar que nenhuma versão foi perdida. Conta diferente deve permanecer vazia.
4. Recuperar originais em instalação limpa, alterar deliberadamente uma cópia de teste, reparar e exportar bytes preservados.
5. Confirmar links de acesso nativos, logout, exclusão recente e JWT revogado. Excluir somente contas sintéticas de teste.
6. Medir bateria, pontos ausentes e limites de memória em viagem longa. Compilação/Playwright não substituem esses ensaios.

## Informações e acessos necessários para submissão

Entidade/publicador, identificador definitivo, contas das lojas, certificados, canal de suporte/privacidade, prazo de retenção, planos/preços e produtos de cobrança. Usar URLs `/privacidade`, `/termos` e `/excluir-conta`; concluir identificação comercial dos textos antes da revisão. Preparar screenshots reais, descrição sem alegação pericial, conta de revisão e formulários de Data safety/App Privacy.

Referências oficiais consultadas em 08/10/2026:

- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/support/offering-account-deletion-in-your-app/
- https://developer.android.com/google/play/requirements/target-sdk (API 36 para novos envios a partir de 31/08/2026)
- https://support.google.com/googleplay/android-developer/answer/9799150
- https://capacitorjs.com/docs/apis/filesystem (manifesto FileTimestamp, C617.1)
- https://github.com/capacitor-community/background-geolocation/blob/master/README.md
