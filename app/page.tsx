import Playground from "./playground";
export default function Home() {
  return (
    <main>
      <header>
        <a className="brand" href="/">
          NEXO<span>DEPENDENCY ENGINE</span>
        </a>
        <nav aria-label="Documentação">
          <a href="/docs.html">Swagger ↗</a>
          <a href="/api/openapi.json">OpenAPI ↗</a>
          <a href="https://github.com/gustapaz/nexo-api">GitHub ↗</a>
        </nav>
      </header>
      <section className="intro">
        <p className="eyebrow">BACK-END / RUST + WEBASSEMBLY</p>
        <h1>
          O que precisa terminar
          <br />
          antes de começar?
        </h1>
        <p>
          Um grafo de dependências vira um plano executável. Nexo calcula
          caminho crítico, detecta ciclos e distribui tarefas entre
          trabalhadores — com um motor Rust real, executado no servidor.
        </p>
        <div className="badges">
          <span>CPM / DAG</span>
          <span>CRONOGRAMA DETERMINÍSTICO</span>
          <span>SEM ESTADO</span>
        </div>
      </section>
      <Playground />
      <section className="notes">
        <div>
          <h2>Planejar não é executar.</h2>
          <p>
            A API simula tarefas não preemptivas, trabalhadores idênticos e
            início em zero. As durações usam unidades abstratas; não há
            calendário, fusos, feriados ou execução de jobs externos.
          </p>
        </div>
        <div>
          <h2>Limites, sem surpresas.</h2>
          <p>
            Até 64 tarefas, 256 dependências, 8 trabalhadores e 32 KiB por JSON.
            Serviço público, sem login, banco, arquivos guardados ou efeitos
            externos. Use apenas dados sintéticos. A disponibilidade depende da
            hospedagem.
          </p>
          <a href="/api/health">Verificar motor Rust →</a>
        </div>
      </section>
      <footer>
        <span>Nexo API · Gustavo Paz</span>
        <span>Rust no núcleo. HTTP na borda.</span>
      </footer>
    </main>
  );
}
