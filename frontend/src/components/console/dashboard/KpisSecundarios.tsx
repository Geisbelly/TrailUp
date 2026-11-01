import type { LucideIcon } from "lucide-react";
import { AlertCircle, Check, Clock, MessageSquare, Repeat, Timer } from "lucide-react";
import type { TurmaResumo } from "@/lib/turmaResumo";
import { CHAVE, estadoDoCard, TEXTO_DO_ESTADO, type ChaveDoCatalogo, type Disponibilidade, type EstadoDoCard } from "./disponibilidade";
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
  estado: EstadoDoCard;
};

function KpiSecundarioCard({ kpi }: { kpi: KpiSecundario }) {
  const Icon = kpi.icon;
  const cor = COR_DO_TOM[kpi.tom];
  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-[18px]">
      <div className="flex items-center justify-between gap-3">
        <div className="console-label-sm">{kpi.label}</div>
        <Icon className="h-[15px] w-[15px] shrink-0" style={{ color: kpi.estado === "valor" ? cor : undefined }} strokeWidth={2} aria-hidden="true" />
      </div>
      {kpi.estado !== "valor" || kpi.valor === null ? (
        <p className="mt-3 text-sm text-muted-foreground" role={kpi.estado === "erro" ? "alert" : undefined}>
          {TEXTO_DO_ESTADO[kpi.estado === "valor" ? "sem_dado" : kpi.estado]}
        </p>
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
  erroTurma,
  disponibilidade,
}: {
  mediaAcertos: number | null;
  turmaResumo: TurmaResumo;
  temDadosTurma: boolean;
  /** A leitura das views da turma falhou: os cards que dependem dela mostram erro, não vazio. */
  erroTurma: string | null;
  disponibilidade: Map<string, Disponibilidade>;
}) {
  const tomAcertos = tomDaMetrica(mediaAcertos ?? 0, META_ACERTOS_PCT, "maior_melhor");
  const daTurma = (valor: number | null, chave?: ChaveDoCatalogo) => {
    const v = temDadosTurma ? valor : null;
    return { valor: v, estado: estadoDoCard({ valor: v, erro: erroTurma, chave, disponibilidade }) };
  };
  const retorno = daTurma(turmaResumo.retorno_semanal_pct, CHAVE.retornoSemanal);
  const tempoAtivo = daTurma(
    turmaResumo.tempo_ativo_medio_seg === null ? null : turmaResumo.tempo_ativo_medio_seg / 60,
    CHAVE.tempoAtivo,
  );
  const chat = daTurma(turmaResumo.uso_chat_apos_erro_pct);
  const abandono = daTurma(turmaResumo.taxa_risco_abandono_pct, CHAVE.riscoAbandono);
  const tomAbandono = tomDaMetrica(abandono.valor ?? 0, META_ABANDONO_PCT, "menor_melhor");
  const tempoUso = daTurma(turmaResumo.tempo_medio_uso_seg === null ? null : turmaResumo.tempo_medio_uso_seg / 60);

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
      estado: mediaAcertos === null ? "sem_dado" : "valor",
    },
    {
      // Taxa de abandono pelo modelo de evasão do core (F5): % dos alunos com dado em risco alto.
      label: "Abandono médio",
      icon: AlertCircle,
      valor: abandono.valor,
      casas: 1,
      unidade: "%",
      tom: tomAbandono,
      nota: fraseDoTom(tomAbandono, META_ABANDONO_PCT, "menor_melhor"),
      barra: true,
      estado: abandono.estado,
    },
    {
      label: "Retorno semanal",
      icon: Repeat,
      valor: retorno.valor,
      casas: 0,
      unidade: "%",
      tom: "informativo",
      nota: "dos que estudaram numa semana voltaram na seguinte (últimas 8 semanas)",
      barra: true,
      estado: retorno.estado,
    },
    {
      label: "Chat após erro",
      icon: MessageSquare,
      valor: chat.valor,
      casas: 1,
      unidade: "%",
      tom: "informativo",
      nota: "Informativo · uso do chat logo depois de um erro",
      barra: true,
      estado: chat.estado,
    },
    {
      // App aberto, por aluno. Sem o fan-out da view antiga (F5, I16).
      label: "Tempo médio de uso",
      icon: Timer,
      valor: tempoUso.valor,
      casas: 1,
      unidade: "min",
      tom: "neutro",
      barra: false,
      estado: tempoUso.estado,
    },
    {
      // D-1: tempo de estudo é tempo ativo, ao lado do tempo de uso.
      label: "Tempo ativo médio",
      icon: Clock,
      valor: tempoAtivo.valor,
      casas: 1,
      unidade: "min",
      tom: "neutro",
      nota: "por aluno, só o tempo interagindo com o material",
      barra: false,
      estado: tempoAtivo.estado,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {kpis.map((kpi) => (
        <KpiSecundarioCard key={kpi.label} kpi={kpi} />
      ))}
    </div>
  );
}
