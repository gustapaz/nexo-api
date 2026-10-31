"use client";
import { useState } from "react";
import { examples } from "../server/examples.mjs";
type Summary = {
  workers: number;
  makespan: number;
  critical_duration: number;
  lower_bound: number;
  total_work: number;
  utilization: number;
  meets_lower_bound: boolean;
};
type Task = {
  id: string;
  label: string;
  duration: number;
  depends_on: string[];
  start: number;
  finish: number;
  worker: number;
  slack: number;
  critical: boolean;
  earliest_start: number;
  latest_start: number;
};
type Plan = {
  summary: Summary;
  tasks: Task[];
  critical_path: string[];
  engine: string;
};
type Problem = {
  title?: string;
  code?: string;
  details?: { blocked_tasks?: string[] };
};
export default function Playground() {
  const [tasks, setTasks] = useState(
      JSON.stringify(examples.release.request.tasks, null, 2),
    ),
    [workers, setWorkers] = useState(2),
    [result, setResult] = useState<Plan | null>(null),
    [comparison, setComparison] = useState<Summary[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("Pronto para calcular no servidor."),
    [payload, setPayload] = useState("");
  function clear() {
    setResult(null);
    setComparison([]);
    setPayload("");
    setMessage("Entrada alterada. Calcule novamente.");
  }
  function load(id: keyof typeof examples) {
    const example = examples[id].request;
    setTasks(JSON.stringify(example.tasks, null, 2));
    setWorkers(example.workers);
    clear();
  }
  async function run(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    clear();
    try {
      const body = JSON.stringify({ tasks: JSON.parse(tasks), workers });
      const response = await fetch("/api/v1/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const value = (await response.json()) as Plan & Problem;
      if (!response.ok)
        throw new Error(
          `${response.status} · ${value.title} ${value.details?.blocked_tasks ? "Bloqueadas: " + value.details.blocked_tasks.join(", ") : ""}`,
        );
      setResult(value);
      setPayload(body);
      setMessage(
        `Plano calculado em Rust/WASM: ${value.summary.makespan} unidades de tempo, ${value.summary.workers} trabalhadores.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao consultar API.");
    } finally {
      setBusy(false);
    }
  }
  async function compare() {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      const value = (await response.json()) as {
        comparisons: Summary[];
      } & Problem;
      if (!response.ok) throw new Error(value.title ?? "Falha na comparação.");
      setComparison(value.comparisons);
      setMessage(
        "Cenários calculados no servidor, de 1 até " +
          workers +
          " trabalhadores.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha na comparação.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="lab-title" className="laboratory">
      <div className="request-panel">
        <div className="panel-title">
          <span>ENTRADA / JSON</span>
          <span>POST /api/v1/plan</span>
        </div>
        <h2 id="lab-title">Defina o grafo.</h2>
        <div className="presets">
          <button disabled={busy} onClick={() => load("release")}>
            Pipeline
          </button>
          <button disabled={busy} onClick={() => load("bottleneck")}>
            Gargalo
          </button>
          <button disabled={busy} onClick={() => load("cycle")}>
            Ciclo inválido
          </button>
        </div>
        <form onSubmit={run}>
          <label htmlFor="workers">Trabalhadores simultâneos</label>
          <select
            id="workers"
            value={workers}
            disabled={busy}
            onChange={(e) => {
              setWorkers(Number(e.target.value));
              clear();
            }}
          >
            {Array.from({ length: 8 }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
          <label htmlFor="tasks">Tarefas · id, duration e depends_on</label>
          <textarea
            id="tasks"
            spellCheck={false}
            rows={20}
            value={tasks}
            disabled={busy}
            onChange={(e) => {
              setTasks(e.target.value);
              clear();
            }}
          />
          <button className="primary" disabled={busy} type="submit">
            {busy ? "Calculando…" : "Calcular plano →"}
          </button>
        </form>
        <p className="small">
          Apenas dados sintéticos. O código Rust roda no servidor; nenhum job é
          executado e nenhum plano é armazenado.
        </p>
      </div>
      <div className="response-panel">
        <div className="panel-title">
          <span>SAÍDA / RUST → WASM</span>
          <span>UNIDADES DE TEMPO</span>
        </div>
        <p role="status" aria-live="polite" className="status">
          {message}
        </p>
        {!result ? (
          <div className="empty">
            <span aria-hidden="true">↳</span>
            <h3>Dependências antes de velocidade.</h3>
            <p>
              Envie um plano para calcular caminho crítico, folgas e um
              cronograma que respeita o limite de trabalhadores.
            </p>
            <p>
              O exemplo “Ciclo inválido” retorna um diagnóstico 409 com as
              tarefas bloqueadas.
            </p>
          </div>
        ) : (
          <>
            <div className="metrics">
              <div>
                <span>Prazo do cronograma</span>
                <strong>{result.summary.makespan}</strong>
              </div>
              <div>
                <span>Caminho crítico</span>
                <strong>{result.summary.critical_duration}</strong>
              </div>
              <div>
                <span>Ocupação da capacidade</span>
                <strong>
                  {Math.round(result.summary.utilization * 100)}
                  <small>%</small>
                </strong>
              </div>
            </div>
            <p className="path">{result.critical_path.join(" → ")}</p>
            <h3>Cronograma por trabalhador</h3>
            <div className="timeline">
              {Array.from({ length: result.summary.workers }, (_, i) => (
                <div className="lane" key={i}>
                  <span>T{i + 1}</span>
                  <div className="track">
                    {result.tasks
                      .filter((t) => t.worker === i + 1)
                      .map((t) => (
                        <div
                          className={"bar " + (t.critical ? "critical" : "")}
                          key={t.id}
                          title={`${t.label}: ${t.start}–${t.finish}`}
                          style={{
                            left: `${(100 * t.start) / result.summary.makespan}%`,
                            width: `${(100 * t.duration) / result.summary.makespan}%`,
                          }}
                        >
                          <span>{t.id}</span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
              <div className="axis">
                <span>0</span>
                <span>{result.summary.makespan}</span>
              </div>
            </div>
            <p className="small">
              Laranja: folga zero no CPM, calculado sem limite de trabalhadores.
              O cronograma usa uma heurística; o menor prazo global não é
              garantido.
            </p>
            <button disabled={busy} onClick={compare}>
              Comparar 1 a {workers} trabalhadores →
            </button>
            {comparison.length > 0 && (
              <div className="comparison">
                <table>
                  <caption>Simulações reais usando a mesma heurística</caption>
                  <thead>
                    <tr>
                      <th>Trabalhadores</th>
                      <th>Prazo</th>
                      <th>Limite inferior</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map((s) => (
                      <tr key={s.workers}>
                        <td>{s.workers}</td>
                        <td>{s.makespan}</td>
                        <td>{s.lower_bound}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <details>
              <summary>Tempos e folgas por tarefa</summary>
              <div className="table-wrap">
                <table>
                  <caption>CPM e cronograma calculados pelo motor Rust</caption>
                  <thead>
                    <tr>
                      <th>Tarefa</th>
                      <th>Início</th>
                      <th>Fim</th>
                      <th>Folga CPM</th>
                      <th>Trabalhador</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.tasks.map((t) => (
                      <tr key={t.id}>
                        <th scope="row">{t.id}</th>
                        <td>{t.start}</td>
                        <td>{t.finish}</td>
                        <td>{t.slack}</td>
                        <td>{t.worker}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <details>
              <summary>Resposta JSON completa</summary>
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
