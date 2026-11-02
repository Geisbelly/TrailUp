import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import SegmentedPills from "./SegmentedPills";
import {
  filtrarPorEscopo,
  formatarGeradoHa,
  geradoEm,
  taxaDeAceitacao,
  textoDaAceitacao,
  type EscopoDoFiltro,
  type Insight,
} from "./insights";
import { useInsightsDaTurma } from "./useInsightsDaTurma";
import CartaoDeInsight, { botaoDoInsight } from "./CartaoDeInsight";
import SecaoAlteracoesDaTrilha from "./SecaoAlteracoesDaTrilha";
import type { Aluno } from "./aluno/tipos";

const FILTROS: { value: EscopoDoFiltro; label: string }[] = [
  { value: "tudo", label: "Tudo" },
  { value: "turma", label: "Turma" },
  { value: "alunos", label: "Alunos" },
];

export default function AbaInsights({
  classIds,
  alunos,
  mostrarTurma,
  nomeDaTurma,
  onAbrirAluno,
}: {
  classIds: number[];
  alunos: Aluno[];
  mostrarTurma: boolean;
  nomeDaTurma: (id: number) => string;
  onAbrirAluno: (aluno: Aluno) => void;
}) {
  const { lote, recentes, alertas, estado, gerando, aviso, gerar, decidir } = useInsightsDaTurma(classIds);
  const [filtro, setFiltro] = useState<EscopoDoFiltro>("tudo");
  const agora = new Date();

  const taxa = useMemo(() => taxaDeAceitacao(recentes, new Date()), [recentes]);
  const visiveis = useMemo(() => filtrarPorEscopo(lote, filtro), [lote, filtro]);
  const alunoDe = (i: Insight) => alunos.find((a) => a.id === i.aluno_id && a.classe_id === i.classe_id) ?? null;
  const alvoDe = (i: Insight) => {
    const quem = i.escopo === "turma" ? "Turma" : alunoDe(i)?.nome ?? "Aluno";
    return mostrarTurma ? `${quem} · ${nomeDaTurma(i.classe_id)}` : quem;
  };

  if (estado.tipo === "indisponivel") {
    return (
      <div className="rounded-[20px] border border-border bg-card px-[30px] py-[50px] text-center">
        <h3 className="text-lg text-foreground">Insights ainda não disponíveis</h3>
        <p className="mx-auto mt-3 max-w-[420px] text-[13px] leading-relaxed text-muted-foreground">
          O banco deste ambiente ainda não tem a estrutura das sínteses da IA. Assim que ela for instalada, as sugestões aparecem aqui.
        </p>
      </div>
    );
  }
  if (estado.tipo === "erro") {
    return (
      <div role="alert" className="rounded-[20px] border border-destructive/50 bg-card p-6 text-sm text-foreground">
        Não foi possível carregar os insights da turma. Detalhe: {estado.detalhe}
      </div>
    );
  }
  if (estado.tipo === "carregando") {
    return (
      <div className="flex flex-col gap-4" role="status" aria-live="polite">
        <div className="console-skeleton h-[62px]" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="console-skeleton h-[130px]" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-2xl border border-[hsl(var(--console-violet)/.3)] bg-[hsl(var(--console-violet)/.08)] px-5 py-4">
        <div className="text-[12.5px] text-[hsl(var(--console-violet-text))]">
          {gerando ? "Gerando novas sínteses…" : formatarGeradoHa(geradoEm(lote), agora)}
        </div>
        <div className="text-[11.5px] text-muted-foreground">{textoDaAceitacao(taxa)}</div>
        <button
          type="button"
          disabled={gerando}
          onClick={() => void gerar()}
          className={cn(botaoDoInsight, "border border-border py-[9px] text-[12.5px] text-foreground hover:bg-muted sm:ml-auto")}
        >
          {gerando ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Gerando…
            </span>
          ) : (
            "Atualizar agora"
          )}
        </button>
      </div>

      {aviso && (
        <p
          role={aviso.tom === "erro" ? "alert" : "status"}
          className={cn(
            "rounded-[14px] border px-4 py-3 text-[12.5px]",
            aviso.tom === "erro" ? "border-destructive/50 text-foreground" : "border-border text-muted-foreground",
          )}
        >
          {aviso.texto}
        </p>
      )}

      <SegmentedPills ariaLabel="Filtrar sínteses" opcoes={FILTROS} valor={filtro} onChange={(f) => setFiltro(f)} className="w-fit" />

      {filtro !== "turma" && alertas.length > 0 && (
        <section aria-labelledby="alertas-por-aluno" className="flex flex-col gap-3">
          <div>
            <h3 id="alertas-por-aluno" className="text-base font-bold text-foreground">
              Alertas por aluno ({alertas.length})
            </h3>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Quando um aluno registra o mesmo estado difícil em vários ciclos de estudo seguidos. Surgem durante o
              estudo, não pelo botão "Atualizar agora".
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {alertas.map((i) => (
              <CartaoDeInsight
                key={i.id}
                insight={i}
                alvo={alvoDe(i)}
                aluno={alunoDe(i)}
                onAbrirAluno={onAbrirAluno}
                onDecidir={(status, motivo) => decidir(i.id, status, motivo)}
              />
            ))}
          </ul>
        </section>
      )}

      {lote.length === 0 && gerando ? (
        <div role="status" aria-live="polite" className="flex flex-col items-center gap-3.5 rounded-[20px] border border-border bg-card px-[30px] py-11 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--console-violet)/.18)]">
            <Loader2 className="h-[18px] w-[18px] animate-spin text-[hsl(var(--console-violet-text))]" aria-hidden="true" />
          </span>
          <div className="text-sm font-bold text-foreground">Gerando novas sínteses…</div>
          <p className="max-w-[340px] text-[12.5px] text-muted-foreground">
            A IA está lendo os dados mais recentes da turma para atualizar observações e sugestões.
          </p>
        </div>
      ) : lote.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[20px] border border-border bg-card px-[30px] py-[50px] text-center">
          <h3 className="text-lg text-foreground">Ainda sem sínteses geradas</h3>
          <p className="max-w-[420px] text-[13px] leading-relaxed text-muted-foreground">
            A IA ainda não processou dados suficientes desta turma para propor observações ou sugestões.
          </p>
        </div>
      ) : visiveis.length === 0 ? (
        <p className="rounded-[20px] border border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
          {filtro === "turma" ? "Nenhuma síntese sobre a turma inteira neste lote." : "Nenhuma síntese sobre alunos específicos neste lote."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visiveis.map((i) => (
            <CartaoDeInsight
              key={i.id}
              insight={i}
              alvo={alvoDe(i)}
              aluno={alunoDe(i)}
              onAbrirAluno={onAbrirAluno}
              onDecidir={(status, motivo) => decidir(i.id, status, motivo)}
            />
          ))}
        </ul>
      )}

      <SecaoAlteracoesDaTrilha classIds={classIds} alunos={alunos} mostrarTurma={mostrarTurma} nomeDaTurma={nomeDaTurma} />
    </div>
  );
}
