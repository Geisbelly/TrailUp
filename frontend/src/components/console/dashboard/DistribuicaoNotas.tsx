import { useMemo } from "react";
import { Cell, Pie, PieChart } from "recharts";
import type { TurmaDistribuicao } from "../useTurmaKpis";
import { distribuicaoDeNotas, type TomDaFaixa } from "./graficos";

// style em vez do atributo `fill`: var() só resolve dentro de CSS.
const corDoTom = (tom: TomDaFaixa | null) => (tom ? `hsl(var(--${tom}))` : "hsl(var(--muted-foreground))");

const primeiraMaiuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

export default function DistribuicaoNotas({
  linhas,
  mediaNotas,
  observacao = null,
}: {
  linhas: TurmaDistribuicao[];
  mediaNotas: number | null;
  observacao?: string | null;
}) {
  const faixas = useMemo(() => distribuicaoDeNotas(linhas), [linhas]);
  const total = faixas.reduce((soma, f) => soma + f.total, 0);

  return (
    <div className="min-w-0 rounded-[20px] border border-border bg-card px-[26px] py-6">
      <h3 className="text-lg text-foreground">Distribuição de notas</h3>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        {total > 0 ? `${total} ${total === 1 ? "aluno" : "alunos"} por faixa de nota` : "Alunos por faixa de nota"}
      </p>

      {total > 0 ? (
        <div className="mt-[22px] flex flex-wrap items-center gap-[22px]">
          <div
            className="relative h-[150px] w-[150px] shrink-0"
            role="img"
            aria-label={`Distribuição de notas: ${faixas.map((f) => `${f.faixa} ${f.total}`).join(", ")}`}
          >
            <PieChart width={150} height={150}>
              <Pie
                data={faixas}
                dataKey="total"
                nameKey="faixa"
                innerRadius={53}
                outerRadius={75}
                startAngle={90}
                endAngle={-270}
                stroke="none"
                isAnimationActive={false}
              >
                {faixas.map((f) => (
                  <Cell key={f.faixa} style={{ fill: corDoTom(f.tom) }} />
                ))}
              </Pie>
            </PieChart>
            {mediaNotas !== null && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-[26px] font-extrabold leading-none text-foreground">{mediaNotas.toFixed(1)}</div>
                <div className="console-label-sm mt-1 !text-[10px]">média</div>
              </div>
            )}
          </div>
          <ul className="flex min-w-[160px] flex-1 flex-col gap-3">
            {faixas.map((f) => (
              <li key={f.faixa} className="flex items-center gap-[9px]">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: corDoTom(f.tom) }} />
                <span className="text-[12.5px] text-muted-foreground">{primeiraMaiuscula(f.faixa)}</span>
                <span className="ml-auto text-[13.5px] font-bold text-foreground">{f.total}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex h-[172px] items-center justify-center text-sm text-muted-foreground">Sem dados suficientes ainda</div>
      )}
      {observacao && total > 0 && (
        <p className="mt-5 rounded-xl bg-muted px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">{observacao}</p>
      )}
    </div>
  );
}
