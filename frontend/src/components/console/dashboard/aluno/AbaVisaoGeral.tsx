import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { montarSerieEvolucao } from "./calculos";
import SinalDeAtencao from "./SinalDeAtencao";
import type { AlunoAnalisado, EvolucaoAluno } from "./tipos";

// Cores de série já elevadas para >= 7:1 contra o card, porque o recharts
// reaproveita a cor da linha no texto da legenda.
const COR_ACERTOS = "hsl(221, 83%, 75%)";
const COR_PROGRESSO = "hsl(142, 76%, 44%)";
const COR_NOTA = "#f59e0b";

export default function AbaVisaoGeral({
  aluno,
  evolucaoAluno,
  evolucaoTurma,
  onVerTrilha,
}: {
  aluno: AlunoAnalisado;
  evolucaoAluno: EvolucaoAluno[];
  evolucaoTurma: EvolucaoAluno[];
  onVerTrilha: () => void;
}) {
  const serie = useMemo(() => montarSerieEvolucao(evolucaoAluno, evolucaoTurma), [evolucaoAluno, evolucaoTurma]);
  const temTurma = serie.some((p) => p.notaTurma !== null);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[2fr_1fr]">
      <div className="min-w-0 rounded-[20px] border border-border bg-card px-[26px] py-6">
        <h3 className="text-lg text-foreground">Evolução do aluno</h3>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Acertos e progresso (%) à esquerda, nota (0–10) à direita, dia a dia
          {temTurma ? " · tracejado: nota média da turma" : ""}
        </p>
        {serie.length === 0 ? (
          <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">Sem dados de evolução ainda</div>
        ) : (
          <div className="mt-4 h-72 text-muted-foreground">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serie} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="currentColor" strokeOpacity={0.15} vertical={false} />
                <XAxis dataKey="rotulo" tick={{ fill: "currentColor", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="pct" domain={[0, 100]} tick={{ fill: "currentColor", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="nota" orientation="right" domain={[0, 10]} tick={{ fill: "currentColor", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="pct" type="monotone" dataKey="acertos" name="Acertos (%)" stroke={COR_ACERTOS} strokeWidth={2.5} dot={false} connectNulls />
                <Line yAxisId="pct" type="monotone" dataKey="progresso" name="Progresso (%)" stroke={COR_PROGRESSO} strokeWidth={2.5} dot={false} connectNulls />
                <Line yAxisId="nota" type="monotone" dataKey="nota" name="Nota" stroke={COR_NOTA} strokeWidth={2.5} dot={false} connectNulls />
                {temTurma && (
                  <Line
                    yAxisId="nota"
                    type="monotone"
                    dataKey="notaTurma"
                    name="Nota média da turma"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    connectNulls
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <div className="rounded-[20px] border border-border bg-card px-6 py-[22px]">
          <h3 className="text-base text-foreground">Última atividade</h3>
          {aluno.ultimaAtividade ? (
            <div className="mt-4 flex items-center gap-2.5">
              <span aria-hidden="true" className="h-[9px] w-[9px] shrink-0 rounded-full bg-[hsl(var(--success))]" />
              <span className="text-[13.5px] font-semibold text-foreground">{aluno.ultimaAtividade}</span>
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-muted-foreground">Nenhuma atividade registrada ainda.</p>
          )}
        </div>
        {aluno.risco && (
          <SinalDeAtencao risco={aluno.risco} primeiroNome={aluno.nome.split(" ")[0]} onVerTrilha={onVerTrilha} />
        )}
      </div>
    </div>
  );
}
