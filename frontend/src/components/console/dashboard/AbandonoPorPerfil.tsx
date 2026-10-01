import { useMemo } from "react";
import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { TurmaPerfilMetricas } from "../useTurmaKpis";
import { abandonoPorPerfil, type SegmentoPerfil } from "./graficos";
import { COR_DO_PERFIL } from "./perfilCores";
import SegmentedPills from "./SegmentedPills";

const SEGMENTOS: { value: SegmentoPerfil; label: string }[] = [
  { value: "majoritario", label: "Majoritário" },
  { value: "segundo", label: "2º perfil" },
  { value: "afinidade_20_plus", label: "Afinidade ≥ 20%" },
];

const pct = (v: number) => `${Math.round(v * 10) / 10}%`;

type Ponto = { perfil: keyof typeof COR_DO_PERFIL; nome: string; valor: number | null; altura: number };

function RotuloDoPerfil({ x, y, payload, pontos }: { x?: number; y?: number; payload?: { index: number }; pontos: Ponto[] }) {
  const ponto = payload ? pontos[payload.index] : undefined;
  if (x === undefined || y === undefined || !ponto) return null;
  return (
    <g transform={`translate(${x},${y})`}>
      <circle cy={10} r={5} fill={COR_DO_PERFIL[ponto.perfil].marca} />
      <text y={32} textAnchor="middle" fontSize={11} style={{ fill: "hsl(var(--muted-foreground))" }}>
        {ponto.nome}
      </text>
    </g>
  );
}

export default function AbandonoPorPerfil({
  linhas,
  segmento,
  onSegmentoChange,
  media,
}: {
  linhas: TurmaPerfilMetricas[];
  segmento: SegmentoPerfil;
  onSegmentoChange: (s: SegmentoPerfil) => void;
  media: number | null;
}) {
  const pontos: Ponto[] = useMemo(
    () => abandonoPorPerfil(linhas, segmento).map((p) => ({ ...p, altura: p.valor ?? 0 })),
    [linhas, segmento],
  );
  const temDados = pontos.some((p) => p.valor !== null);
  const teto = Math.max(...pontos.map((p) => p.altura), media ?? 0, 1) * 1.2;
  const resumo = pontos.map((p) => `${p.nome} ${p.valor === null ? "sem dado" : pct(p.valor)}`).join(", ");

  return (
    <div className="min-w-0 rounded-[20px] border border-border bg-card px-[26px] pb-5 pt-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0">
          <h3 className="text-lg text-foreground">Abandono por perfil</h3>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Percentual de atividades abandonadas, por perfil BrainHex</p>
          {media !== null && temDados && (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span aria-hidden="true" className="w-4 border-t border-dashed border-current" />
              média da turma: {pct(media)}
            </p>
          )}
        </div>
        <SegmentedPills
          className="ml-auto"
          ariaLabel="Segmento de perfil"
          opcoes={SEGMENTOS}
          valor={segmento}
          onChange={onSegmentoChange}
        />
      </div>

      {temDados ? (
        <div className="mt-5 overflow-x-auto text-muted-foreground" role="img" aria-label={`Abandono por perfil: ${resumo}`}>
          <div className="h-[240px] min-w-[520px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pontos} margin={{ top: 24, right: 8, bottom: 0, left: 8 }}>
                <XAxis dataKey="nome" axisLine={false} tickLine={false} interval={0} height={44} tick={<RotuloDoPerfil pontos={pontos} />} />
                <YAxis hide domain={[0, teto]} />
                {media !== null && (
                  <ReferenceLine y={media} stroke="currentColor" strokeOpacity={0.6} strokeDasharray="4 4" />
                )}
                <Bar dataKey="altura" radius={[8, 8, 3, 3]} maxBarSize={44} isAnimationActive={false}>
                  {pontos.map((p) => (
                    // Contorno na variante de texto: a marca oficial de Survivor,
                    // Mastermind e Conqueror fica abaixo de 3:1 contra o card.
                    <Cell key={p.perfil} fill={COR_DO_PERFIL[p.perfil].marca} stroke={COR_DO_PERFIL[p.perfil].texto} strokeWidth={1} />
                  ))}
                  <LabelList
                    dataKey="valor"
                    position="top"
                    content={({ x, y, width, index }) => {
                      const ponto = index === undefined ? undefined : pontos[index];
                      if (!ponto || x === undefined || y === undefined || width === undefined) return null;
                      return (
                        <text
                          x={Number(x) + Number(width) / 2}
                          y={Number(y) - 7}
                          textAnchor="middle"
                          fontSize={12.5}
                          fontWeight={700}
                          style={{ fill: "hsl(var(--foreground))" }}
                        >
                          {ponto.valor === null ? "—" : pct(ponto.valor)}
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">Sem dados suficientes ainda</div>
      )}
    </div>
  );
}
