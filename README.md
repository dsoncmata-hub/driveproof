# CARVRUM

Registro de viagens por GPS, abastecimentos, rendimento por posto e evidências originais. React, TypeScript, TanStack Start, Supabase e Vercel; desenvolvimento independente de editores visuais.

## Verificar

```bash
npm ci --ignore-scripts
npm run test
npm run typecheck
npm run lint:core
npm run build
npx playwright install chromium --only-shell
npm run test:e2e
```

`npm run dev -- --host 127.0.0.1` inicia o ambiente local. Os testes de navegador utilizam dados fictícios e interceptam requisições de autenticação/sincronização; os testes SQL de isolamento são separados em `tests/security/rls-cas.sql` e revertem todas as fixtures.

## Estado comercial

A versão web não é um aplicativo nativo publicado. GPS em segundo plano exige integração e testes em aparelhos físicos. Nenhum relatório constitui prova pericial automática. Pressão oficial dos pneus deve vir da etiqueta do veículo.

- [Validação executada](docs/VALIDATION_2026-10-08.md)
- [Checklist do MVP](docs/MVP_RELEASE_GATE.md)
- [Plano de submissão às lojas](docs/STORE_SUBMISSION_PLAN.md)

## Dados

Registros existentes e nomes das chaves locais permanecem compatíveis. Originais ficam no IndexedDB e, após envio explícito, no Storage privado. Sincronização usa revisão atômica e bloqueia operações de outra conta sobre os registros locais. Não subir coordenadas, fotografias pessoais, tokens ou chaves privadas ao GitHub.

Supabase: `pylmernfpgcwxylzcbqi`. Implantação web existente: https://driveproof-taupe.vercel.app/.
A rotina de backup a cada 12 horas foi preservada. Não limpar armazenamento local antes de confirmar a disponibilidade de registros e originais em outro aparelho.
