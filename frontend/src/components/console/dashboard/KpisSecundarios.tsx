import type { LucideIcon } from "lucide-react";
import { AlertCircle, Check, Clock, MessageSquare } from "lucide-react";
import type { TurmaResumo } from "@/lib/turmaResumo";
import { fraseDoTom, META_ABANDONO_PCT, META_ACERTOS_PCT, tomDaMetrica, type TomMetrica } from "./metas";

const COR_DO_TOM: Record<TomMetrica, string> = {
  bom: "hsl(var(--success))",
  atencao: "hsl(var(--warning))",
  informativo: "hsl(var(--info))",
  neutro: "hsl(var(--muted-foreground))",
};

type KpiSecundario = {
  label: string;
  icon: LucideIcon;
  valor: number | null;
  casas: number;
  unidade: string;
  tom: TomMetrica;
  nota?: string;
  barra: boolean;
};

function KpiSecundarioCard({ kpi }: { kpi: KpiSecundario }) {
  const Icon = kpi.icon;
  const cor = COR_DO_TOM[kpi.tom];
  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-[18px]">
      <div className="flex items-center justify-between gap-3">
        <div className="console-label-sm">{kpi.label}</div>
        <Icon className="h-[15px] w-[15px] shrink-0" style={{ color: kpi.valor === null ? undefined : cor }} strokeWidth={2} aria-hidden="true" />
      </div>
      {kpi.valor === null ? (
        <p className="mt-3 text-sm text-muted-foreground">Sem dados ainda</p>
      ) : (
        <>
          <div className="mt-2 text-[26px] font-bold text-foreground">
            {kpi.valor.toFixed(kpi.casas)}
            <span className="ml-1 text-[13px] font-semibold text-muted-foreground">{kpi.unidade}</span>
          </div>
          {kpi.barra && (
            <div className="mt-3 h-[5px] overflow-hidden rounded-full bg-[hsl(var(--border))]" aria-hidden="true">
              <div className="h-full" style={{ width: `${Math.min(100, Math.max(0, kpi.valor))}%`, background: cor }} />
            </div>
          )}
          {kpi.nota && (
            <div className="mt-2.5 text-xs font-semibold" style={{ color: cor }}>
              {kpi.nota}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function KpisSecundarios({
  mediaAcertos,
  turmaResumo,
  temDadosTurma,
}: {
  mediaAcertos: number | null;
  turmaResumo: TurmaResumo;
  temDadosTurma: boolean;
}) {
  const tomAcertos = tomDaMetrica(mediaAcertos ?? 0, META_ACERTOS_PCT, "maior_melhor");
  const abandono = turmaResumo.taxa_media_abandono_pct;
  const tomAbandono = tomDaMetrica(abandono, META_ABANDONO_PCT, "menor_melhor");

  const kpis: KpiSecundario[] = [
    {
      label: "Taxa de acertos",
      icon: Check,
      valor: mediaAcertos,
      casas: 0,
      unidade: "%",
      tom: tomAcertos,
      nota: fraseDoTom(tomAcertos, META_ACERTOS_PCT, "maior_melhor"),
      barra: true,
    },
    {
      label: "Abandono médio",
      icon: AlertCircle,
      valor: temDadosTurma ? abandono : null,
      casas: 1,
      unidade: "%",
      tom: tomAbandono,
      nota: fraseDoTom(tomAbandono, META_ABANDONO_PCT, "menor_melhor"),
      barra: true,
    },
    {
      label: "Chat após erro",
      icon: MessageSquare,
      valor: temDadosTurma ? turmaResumo.uso_chat_apos_erro_pct : null,
      casas: 1,
      unidade: "%",
      tom: "informativo",
      nota: "Informativo · uso do chat logo depois de um erro",
      barra: true,
    },
    {
      label: "Tempo médio de uso",
      icon: Clock,
      valor: temDadosTurma ? turmaResumo.tempo_medio_uso_seg / 60 : null,
      casas: 1,
      unidade: "min",
      tom: "neutro",
      barra: false,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <KpiSecundarioCard key={kpi.label} kpi={kpi} />
      ))}
    </div>
  );
}
