# Nexo API

Planejamento de tarefas com dependências, **Rust + WebAssembly no servidor**. Caminho crítico, folgas, detecção de ciclos e cronograma com trabalhadores limitados.

[Demo](https://nexo-api-gustapaz.starrylinen.chatgpt.site) · [Swagger](https://nexo-api-gustapaz.starrylinen.chatgpt.site/docs.html) · [OpenAPI](https://nexo-api-gustapaz.starrylinen.chatgpt.site/api/openapi.json)

## O que funciona

- Grafo direcionado com validação de IDs e dependências.
- Ordem topológica determinística e diagnóstico de ciclos.
- Critical Path Method: início/fim mais cedo e mais tarde, folgas e um caminho crítico.
- Cronograma não preemptivo, respeitando precedências e limite de trabalhadores.
- Comparação de capacidade de 1 até o número solicitado.
- Instância WASM isolada por cálculo, sem estado compartilhado.
- Health check que executa um plano mínimo no motor Rust.

Os exemplos são sintéticos; algoritmos e processamento são reais. O serviço **planeja**, sem executar jobs, compilar seus projetos ou chamar serviços externos. Não guarda planos.

## Executar localmente

Node.js 24, npm e Rust via rustup. O arquivo rust-toolchain.toml fixa Rust 1.99.1, rustfmt e wasm32-unknown-unknown. O motor não tem crates externos.

```sh
rustup toolchain install 1.99.1 --profile minimal --target wasm32-unknown-unknown --component rustfmt
npm ci
npm run build
npm start -- --port 5203
```

Abra http://127.0.0.1:5203 e /docs.html. Não precisa de conta cloud, cartão, token, banco ou migração. No Windows, compilar para WASM não exige Visual Studio; testes Rust nativos requerem o linker do host. A CI Linux executa os testes nativos.

```sh
npm run build:wasm
npm run check
npm run typecheck
npm test
npm run smoke -- http://127.0.0.1:5203
```

São 40 testes do binário WASM e HTTP real. Um deles verifica 100 DAGs com seed fixa, invariantes de cronograma e um oráculo recursivo independente para o caminho crítico. A CI instala do lockfile, executa cargo fmt e cargo test nativo, compila WASM, verifica tipos/formatação, testa e constrói o Worker. Os tipos cobrem o adaptador e a interface; o núcleo é compilado e testado em Rust/WASM.

## API

```sh
curl https://nexo-api-gustapaz.starrylinen.chatgpt.site/api/health
curl -X POST https://nexo-api-gustapaz.starrylinen.chatgpt.site/api/v1/plan -H 'Content-Type: application/json' --data-binary @examples/requests/release.json
curl -X POST https://nexo-api-gustapaz.starrylinen.chatgpt.site/api/v1/compare -H 'Content-Type: application/json' --data-binary @examples/requests/bottleneck.json
```

O pipeline de exemplo tem caminho crítico e cronograma de 15 unidades com 2 trabalhadores. O gargalo tem caminho crítico de 10, mas exige 12 unidades com 2 trabalhadores ou 19 com 1.

GET /api/v1/examples retorna três contratos executáveis, incluindo ciclo. Ciclos retornam 409 com blocked_tasks: tarefas nos ciclos **e descendentes bloqueados**. Contrato inválido retorna 422; JSON/UTF-8 inválido, 400; tamanho excedido, 413; mídia incorreta, 415. Erros usam application/problem+json e request_id.

## Semântica

Unidades de tempo abstratas, início em zero, durações inteiras positivas, trabalhadores idênticos e tarefas não preemptivas. Não há calendário, fuso, feriado ou prazo real.

CPM ignora o limite de trabalhadores. O cronograma prioriza maior caminho restante até uma saída, com desempate pelo ID ASCII e menor trabalhador livre. É uma heurística determinística, sem garantia de prazo global ótimo ou monotonicidade ao aumentar a capacidade.

O limite inferior é max(caminho crítico, ceil(trabalho/trabalhadores)); pode ser inalcançável. A API informa se o cronograma o atingiu. Limites: 64 tarefas, 256 dependências, 8 trabalhadores, 32 KiB JSON e duração de 1 a 86400 por tarefa.

## Arquitetura, segurança e hospedagem

[Arquitetura e ABI](docs/architecture.md) · [Segurança e limites](docs/security.md)

Rust contém os algoritmos; JavaScript valida e traduz JSON/ABI. Vinext/React serve como adaptador Worker e cliente técnico. O módulo WASM é importado no servidor, sem cálculo local no navegador. Não há persistência, credenciais de demonstração ou integrações externas.

Hospedagem integrada Sites, sem cartão, faturamento, trial ou plano pago ativado. GitHub hospeda código e CI; Pages não executa a API. A disponibilidade depende das cotas da hospedagem, sem SLA ou promessa de gratuidade permanente. O trabalho por chamada é limitado, mas não há rate limit global próprio. Use somente planos sintéticos.

Credenciais de publicação ficam fora do Git. Nenhuma variável secreta é obrigatória; veja .env.example.

## Licença

Código do projeto sob MIT. Dependências mantêm suas licenças. Swagger UI conserva LICENSE e NOTICE em public/swagger. O tooling Sites/Vinext preserva avisos em vendor e scripts/vite/sites-vite-plugin.LICENSE.
