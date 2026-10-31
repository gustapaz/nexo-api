# Arquitetura e objetivo de aprendizado

Nexo explora grafos direcionados, detecção de ciclos, Critical Path Method e escalonamento com capacidade limitada. O motor é Rust, sem crates externos, compilado para WebAssembly no servidor. Não é um executor de jobs.

HTTP → validação/ABI → instância WASM isolada → motor Rust → JSON.

- `engine/src/lib.rs`: topologia de Kahn, CPM e simulação por eventos.
- `server/planner.mjs`: validação HTTP-domain, normalização determinística e ponte ABI.
- `server/runtime.mjs`: importa o módulo WASM e conecta o handler ao runtime.
- `server/http.mjs`: rotas Web Standard, stream limitado, erros e headers.
- `server/openapi.mjs`: contrato público.
- `app/api/[[...route]]/route.ts`: adaptador Vinext/Worker.
- `app/playground.tsx`: cliente técnico, sem algoritmo de planejamento local.
- `tests/`: testes do binário WASM e HTTP real; 100 DAGs gerados com seed fixo.

## Algoritmos

IDs são ordenados em ASCII antes de codificar o grafo. Kahn seleciona a menor tarefa disponível por ID. Se não processar todos os nós, o motor retorna os nós bloqueados: integrantes de ciclos e seus descendentes, sem afirmar que todos participam do ciclo.

O CPM faz passagens de ida e volta para obter tempos mais cedo, mais tarde e folgas. Isso supõe trabalhadores ilimitados. Um caminho crítico é reconstruído com predecessores determinísticos; vários caminhos podem ser igualmente críticos.

O cronograma usa list scheduling: maior duração restante até uma saída primeiro (bottom level), desempate pelo menor ID; trabalhadores livres são escolhidos pelo menor número. Tarefas não preemptivas ocupam um trabalhador até terminar. Todos os términos no mesmo instante são processados antes de iniciar novas tarefas.

O limite inferior reportado é max(caminho crítico, ceil(trabalho/trabalhadores)). Pode não ser alcançável. A heurística não garante solução ótima nem monotonicidade ao aumentar a capacidade. A API devolve a simulação realmente calculada, sem ajustar os números para aparentar melhoria.

## ABI e isolamento

Entrada u32: n, durações e matriz de adjacência. Saída u32: status, prazo, duração crítica e fim de um caminho crítico; depois tempos CPM, folga, ordem, cronograma, trabalhador e predecessor por tarefa. O Rust revalida dimensões, durações, quantidade de arestas e capacidade.

Os únicos blocos unsafe ficam na fronteira de alocação/leitura/liberação. O adaptador controla os ponteiros e libera entrada e saída em finally. A API pública aceita apenas JSON validado, nunca ponteiros. Cada cálculo recebe uma instância WASM nova, sem compartilhar memória entre planos.

Não existe banco, cron, arquivo persistido, fila ou sessão. Os planos são funções da entrada. Não há promessa de persistência ou execução externa. Vinext/React fornece apenas o adaptador de hospedagem e a documentação técnica; os algoritmos estão no Rust.
