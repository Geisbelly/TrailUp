import type { LucideIcon } from "lucide-react";
import { Target, TrendingUp, Users } from "lucide-react";

type KpiPrincipal = {
  label: string;
  icon: LucideIcon;
  valor: string | null;
  unidade: string;
  progresso?: number;
};

function KpiPrincipalCard({ kpi }: { kpi: KpiPrincipal }) {
  const Icon = kpi.icon;
  return (
    <div className="rounded-[20px] border border-border bg-card px-[26px] py-6">
      <div className="flex items-start justify-between gap-3">
        <div className="console-label">{kpi.label}</div>
        <Icon className="h-[18px] w-[18px] shrink-0 text-[hsl(var(--console-violet-text))]" strokeWidth={1.6} aria-hidden="true" />
      </div>
      {kpi.valor === null ? (
        <p className="mt-4 text-sm text-muted-foreground">Sem dados ainda</p>
      ) : (
        <>
          <div className="mt-3.5 flex items-end gap-2.5">
            <div className="text-[44px] font-extrabold leading-none text-foreground">{kpi.valor}</div>
            <div className="pb-1.5 text-[13px] text-muted-foreground">{kpi.unidade}</div>
          </div>
          {kpi.progresso !== undefined && (
            <div
              className="mt-[18px] h-[7px] overflow-hidden rounded-full bg-[hsl(var(--border))]"
              role="progressbar"
              aria-label={kpi.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(kpi.progresso)}
            >
              <div className="h-full rounded-full bg-[hsl(var(--console-violet))]" style={{ width: `${Math.min(100, Math.max(0, kpi.progresso))}%` }} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function KpisPrincipais({
  totalAlunos,
  mediaNotas,
  mediaConclusao,
  temDados,
}: {
  totalAlunos: number;
  mediaNotas: number | null;
  mediaConclusao: number;
  temDados: boolean;
}) {
  const kpis: KpiPrincipal[] = [
    { label: "Total de alunos", icon: Users, valor: String(totalAlunos), unidade: "com acesso liberado" },
    { label: "Média de notas", icon: Target, valor: mediaNotas === null ? null : mediaNotas.toFixed(1), unidade: "de 10" },
    {
      label: "Conclusão média",
      icon: TrendingUp,
      valor: temDados ? `${mediaConclusao.toFixed(0)}%` : null,
      unidade: "da trilha",
      progresso: temDados ? mediaConclusao : undefined,
    },
  ];

  return (
    <div className="grid gap-5 md:grid-cols-3">
      {kpis.map((kpi) => (
        <KpiPrincipalCard key={kpi.label} kpi={kpi} />
      ))}
    </div>
  );
}
