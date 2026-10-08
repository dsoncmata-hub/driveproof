# DriveProof

Aplicativo de registro de viagens, consumo de combustível e evidências técnicas, baseado em React, TypeScript e TanStack Start.

## Desenvolvimento independente

Este repositório é independente de editores visuais. Código-fonte versionado no GitHub, hospedagem prevista na Vercel. Supabase será adicionado após configuração da organização e do modelo de dados.

## Iniciar

```bash
npm install
npm run dev
npm run build
npx vitest run src/lib/dp
```

Estado atual: protótipo em migração e ainda não aprovado para uso em produção. GPS em segundo plano no iOS exige testes nativos; os relatórios não constituem prova pericial automática. A pressão oficial dos pneus deve ser inserida pelo proprietário segundo a etiqueta do veículo.

**Privacidade:** não subir ao repositório coordenadas, evidências pessoais, segredos, tokens ou chaves privadas. Base de dados atual local do navegador. Faça backup dos dados antes de limpar o navegador.
