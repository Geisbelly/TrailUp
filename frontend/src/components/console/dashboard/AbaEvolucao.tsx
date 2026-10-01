import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  deltaDeAcertos,
  deltaDeEntregas,
  mudancasRelevantes,
  SEMANAS_DA_SERIE,
  semanasAte,
  serieSemanal,
  type Delta,
} from "./evolucao";
import { useEvolucaoDaTurma } from "./useEvolucaoDaTurma";
import type { Matricula } from "./conteudo";

const COR_DO_DELTA: Record<Delta["tom"], string> = {
  bom: "hsl(var(--success))",
  ruim: "hsl(var(--destructive))",
  neutro: "hsl(var(--muted-foreground))",
};

const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const SEM_HISTORICO = "valor atual · o banco não guarda histórico semanal";

function KpiDeEvolucao({ rotulo, valor, delta, nota }: { rotulo: string; valor: string; delta: Delta | null; nota: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-[18px]">
      <div className="console-label-sm">{rotulo}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-[26px] font-bold text-foreground">{valor}</div>
        {delta && (
          <div className="text-[12.5px] font-bold" style={{ color: COR_DO_DELTA[delta.tom] }}>
            {delta.texto}
          </div>
        )}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{nota}</div>
    </div>
  );
}

export default function AbaEvolucao({
  classIds,
  matriculas,
  conclusaoAtualPct,
  abandonoAtualPct,
}: {
  classIds: number[];
  matriculas: Matricula[];
  conclusaoAtualPct: number | null;
  abandonoAtualPct: number | null;
}) {
  const semanas = useMemo(() => semanasAte(new Date()), []);
  const alunoIds = useMemo(() => [...new Set(matriculas.map((m) => m.aluno_id))], [matriculas]);
  const { dados, carregando, erro } = useEvolucaoDaTurma(classIds, alunoIds, semanas[0]);

  const serie = useMemo(
    () => serieSemanal(dados.eventos, semanas, new Set(dados.atividadeIds), new Set(alunoIds)),
    [dados, semanas, alunoIds],
  );
  const mudancas = useMemo(() => mudancasRelevantes(dados.jobs, dados.topicos, semanas[0]), [dados, semanas]);
  // KPIs comparam as duas últimas semanas COMPLETAS: a semana atual ainda está
  // em andamento, e compará-la com uma semana cheia dá queda falsa.
  const completas = serie.slice(0, -1);
  const [anterior, atual] = completas.slice(-2);
  const semanaEmAndamento = serie[serie.length - 1]?.rotulo;
  const temRespostas = serie.some((p) => p.entregas > 0);

  if (erro) {
    return (
      <div role="alert" className="rounded-[20px] border border-destructive/50 bg-card p-6 text-sm text-foreground">
        Não foi possível carregar a evolução da turma. Detalhe: {erro}
      </div>
    );
  }
  if (carregando && dados.eventos.length === 0 && dados.jobs.length === 0) {
    return (
      <div className="flex flex-col gap-5" role="status" aria-live="polite">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="console-skeleton h-[118px]" />
          ))}
        </div>
        <div className="console-skeleton h-[340px]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiDeEvolucao
          rotulo="Entregas na semana"
          valor={String(atual?.entregas ?? 0)}
          delta={deltaDeEntregas(completas)}
          nota={`semana de ${atual?.rotulo ?? "—"} · anterior: ${anterior?.entregas ?? 0}`}
        />
        <KpiDeEvolucao
          rotulo="Acertos na semana"
          valor={atual?.acertosPct == null ? "—" : `${Math.round(atual.acertosPct)}%`}
          delta={deltaDeAcertos(completas)}
          nota={`semana de ${atual?.rotulo ?? "—"} · anterior: ${anterior?.acertosPct == null ? "sem respostas" : `${Math.round(anterior.acertosPct)}%`}`}
        />
        <KpiDeEvolucao
          rotulo="Conclusão da trilha"
          valor={conclusaoAtualPct === null ? "—" : `${Math.round(conclusaoAtualPct)}%`}
          delta={null}
          nota={SEM_HISTORICO}
        />
        <KpiDeEvolucao
          rotulo="Abandono"
          valor={abandonoAtualPct === null ? "—" : `${Math.round(abandonoAtualPct * 10) / 10}%`}
          delta={null}
          nota={SEM_HISTORICO}
        />
      </div>

      <section aria-labelledby="evolucao-da-turma" className="min-w-0 rounded-[20px] border border-border bg-card px-[26px] py-6">
        <div className="flex flex-wrap items-start gap-4">
          <div>
            <h3 id="evolucao-da-turma" className="text-lg text-foreground">Evolução da turma</h3>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Semana a semana · últimas {SEMANAS_DA_SERIE} semanas, começando na segunda · a de {semanaEmAndamento} está em andamento</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground sm:ml-auto">
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="h-[3px] w-4 rounded bg-[hsl(var(--console-violet-text))]" />
              Acertos da turma (%)
            </span>
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2 w-3 rounded-sm bg-muted-foreground/60" />
              Entregas (respostas enviadas)
            </span>
          </div>
        </div>
        {temRespostas ? (
          <div
            className="mt-4 h-[280px] text-muted-foreground"
            role="img"
            aria-label={`Evolução semanal: ${serie.map((p) => `semana de ${p.rotulo}, ${p.entregas} entregas${p.acertosPct === null ? "" : `, ${Math.round(p.acertosPct)}% de acertos`}`).join("; ")}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 8, right: 0, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="currentColor" strokeOpacity={0.15} vertical={false} />
                <XAxis dataKey="rotulo" tick={{ fill: "currentColor", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="entregas" allowDecimals={false} tick={{ fill: "currentColor", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fill: "currentColor", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  labelFormatter={(r) => `Semana de ${r}`}
                  formatter={(valor, nome) => [nome === "Acertos (%)" ? `${Math.round(Number(valor))}%` : valor, nome]}
                />
                <Bar yAxisId="entregas" dataKey="entregas" name="Entregas" fill="currentColor" fillOpacity={0.6} radius={[3, 3, 0, 0]} maxBarSize={30} isAnimationActive={false} />
                <Line
                  yAxisId="pct"
                  type="monotone"
                  dataKey="acertosPct"
                  name="Acertos (%)"
                  stroke="#c1a7ec"
                  strokeWidth={3}
                  dot={{ r: 3, fill: "#c1a7ec" }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            Nenhuma resposta registrada nas últimas {SEMANAS_DA_SERIE} semanas
          </div>
        )}
      </section>

      {mudancas.length > 0 && (
        <section aria-labelledby="mudancas-relevantes" className="rounded-[20px] border border-border bg-card px-[26px] py-6">
          <h3 id="mudancas-relevantes" className="text-lg text-foreground">Mudanças relevantes</h3>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Alterações na trilha e no material no mesmo período, registradas pelo sistema</p>
          <ul className="mt-5 flex flex-col gap-2.5">
            {mudancas.map((m, i) => (
              <li key={`${m.data}-${m.titulo}-${i}`} className="flex flex-wrap items-start gap-3.5 rounded-[14px] bg-muted px-4 py-3.5">
                <div className="w-[52px] shrink-0 text-xs font-bold text-muted-foreground">{dataCurta(m.data)}</div>
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold text-foreground"
                  style={{ background: m.etiqueta === "Material" ? "hsl(var(--info) / .16)" : "hsl(var(--console-violet) / .2)" }}
                >
                  {m.etiqueta}
                </span>
                <div className="min-w-[200px] flex-1">
                  <div className="text-sm font-semibold text-foreground">{m.titulo}</div>
                  {m.detalhe && <div className="mt-0.5 text-xs text-muted-foreground">{m.detalhe}</div>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
