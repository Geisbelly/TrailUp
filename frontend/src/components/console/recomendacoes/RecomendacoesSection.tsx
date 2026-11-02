import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Lightbulb } from "lucide-react";
import CartaoDeInsight from "../dashboard/CartaoDeInsight";
import SegmentedPills from "../dashboard/SegmentedPills";
import { textoDaAceitacao, type Insight } from "../dashboard/insights";
import { useTurmasDoProfessor } from "../comum/useTurmasDoProfessor";
import { consolePathForView } from "@/pages/consoleSections";
import {
  aceitacaoDasDecididas,
  contarPendentes,
  decididas,
  filtrar,
  pendentesDeDecisao,
  type FiltroDeEscopo,
} from "./recomendacoes";
import MissoesSugeridas from "./MissoesSugeridas";
import { useRecomendacoesDaIA } from "./useRecomendacoesDaIA";
import { avisarQueRecomendacoesMudaram } from "./eventoRecomendacoes";

const FILTROS: { value: FiltroDeEscopo; label: string }[] = [
  { value: "tudo", label: "Tudo" },
  { value: "turma", label: "Turma" },
  { value: "alunos", label: "Alunos" },
];

export default function RecomendacoesSection({ professorId }: { professorId: string | undefined }) {
  const { turmas, carregando: carregandoTurmas, erro: erroTurmas } = useTurmasDoProfessor(professorId);
  const classIds = useMemo(() => turmas.map((t) => t.id), [turmas]);
  const { linhas, nomes, estado, decidir } = useRecomendacoesDaIA(classIds);
  const [filtro, setFiltro] = useState<FiltroDeEscopo>("tudo");
  const [turmaId, setTurmaId] = useState<number | null>(null);
  const [verDecididas, setVerDecididas] = useState(false);

  const nomeDaTurma = (id: number) => turmas.find((t) => t.id === id)?.descricao ?? `Turma ${id}`;
  const mostrarTurma = turmas.length > 1;
  const alvoDe = (i: Insight) => {
    const quem = i.escopo === "turma" ? "Turma" : (i.aluno_id && nomes[i.aluno_id]) || "Aluno";
    return mostrarTurma ? `${quem} · ${nomeDaTurma(i.classe_id)}` : quem;
  };

  const contagem = useMemo(() => contarPendentes(linhas), [linhas]);
  const pendentes = useMemo(() => filtrar(pendentesDeDecisao(linhas), filtro, turmaId), [linhas, filtro, turmaId]);
  const historico = useMemo(() => filtrar(decididas(linhas), filtro, turmaId), [linhas, filtro, turmaId]);
  const taxa = useMemo(() => aceitacaoDasDecididas(linhas, new Date()), [linhas]);

  if (carregandoTurmas || estado.tipo === "carregando") {
    return (
      <div className="flex flex-col gap-4" role="status" aria-live="polite">
        <div className="console-skeleton h-[62px]" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="console-skeleton h-[130px]" />
        ))}
      </div>
    );
  }
  if (erroTurmas || estado.tipo === "erro") {
    return (
      <div role="alert" className="rounded-[20px] border border-destructive/50 bg-card p-6 text-sm text-foreground">
        Não foi possível carregar as recomendações. Detalhe: {erroTurmas ?? (estado.tipo === "erro" ? estado.detalhe : "")}
      </div>
    );
  }
  if (estado.tipo === "indisponivel") {
    return (
      <div className="rounded-[20px] border border-border bg-card px-[30px] py-[50px] text-center">
        <h3 className="text-lg text-foreground">Recomendações ainda não disponíveis</h3>
        <p className="mx-auto mt-3 max-w-[420px] text-[13px] leading-relaxed text-muted-foreground">
          O banco deste ambiente ainda não tem a estrutura das sínteses da IA. Assim que ela for instalada, as recomendações aparecem aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <header className="flex flex-col gap-1.5">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-foreground">
          <Lightbulb className="h-6 w-6 text-[hsl(var(--console-violet-text))]" aria-hidden="true" />
          Recomendações da IA
        </h1>
        <p className="max-w-[640px] text-[13px] leading-relaxed text-muted-foreground">
          O que a IA sugeriu e espera a sua decisão: aceite o que fizer sentido ou ignore, com o motivo. Para pedir sínteses novas, use{" "}
          <Link className="underline" to={consolePathForView("dashboard")}>
            Atualizar agora
          </Link>{" "}
          na aba Insights da Visão geral.
        </p>
      </header>

      <MissoesSugeridas turmas={turmas} />

      <h2 className="text-base font-bold text-foreground">Sugestões da IA sobre a turma e os alunos {contagem.total > 0 && `(${contagem.total})`}</h2>

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-2xl border border-[hsl(var(--console-violet)/.3)] bg-[hsl(var(--console-violet)/.08)] px-5 py-4">
        <div className="text-[12.5px] font-semibold text-[hsl(var(--console-violet-text))]">
          {contagem.total === 0
            ? "Nenhuma recomendação aguardando decisão"
            : `${contagem.total} aguardando decisão · ${contagem.turma} da turma, ${contagem.alunos} de alunos`}
        </div>
        <div className="text-[11.5px] text-muted-foreground">{textoDaAceitacao(taxa)}</div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedPills ariaLabel="Filtrar recomendações" opcoes={FILTROS} valor={filtro} onChange={(f) => setFiltro(f)} className="w-fit" />
        {mostrarTurma && (
          <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            Turma
            <select
              value={turmaId ?? ""}
              onChange={(e) => setTurmaId(e.target.value === "" ? null : Number(e.target.value))}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-[13px] text-foreground"
            >
              <option value="">Todas</option>
              {turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  {nomeDaTurma(t.id)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {pendentes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[20px] border border-border bg-card px-[30px] py-[50px] text-center">
          <h3 className="text-lg text-foreground">{contagem.total === 0 ? "Nada aguardando a sua decisão" : "Nenhuma recomendação neste filtro"}</h3>
          <p className="max-w-[420px] text-[13px] leading-relaxed text-muted-foreground">
            {contagem.total === 0
              ? "Quando a IA propuser algo para a turma ou para um aluno, aparece aqui, de qualquer geração, até você decidir."
              : "Troque o filtro de escopo ou de turma para ver as outras."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Recomendações aguardando decisão">
          {pendentes.map((i) => (
            <CartaoDeInsight
              key={i.id}
              insight={i}
              alvo={alvoDe(i)}
              aluno={null}
              onAbrirAluno={() => undefined}
              onDecidir={async (status, motivo) => {
                await decidir(i.id, status, motivo);
                avisarQueRecomendacoesMudaram();
              }}
            />
          ))}
        </ul>
      )}

      {historico.length > 0 && (
        <section aria-labelledby="recomendacoes-decididas" className="flex flex-col gap-3">
          <button
            type="button"
            id="recomendacoes-decididas"
            aria-expanded={verDecididas}
            onClick={() => setVerDecididas((v) => !v)}
            className="w-fit rounded-full border border-border px-[15px] py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {verDecididas ? "Ocultar" : "Ver"} decididas nos últimos 30 dias ({historico.length})
          </button>
          {verDecididas && (
            <ul className="flex flex-col gap-3">
              {historico.map((i) => (
                <CartaoDeInsight
                  key={i.id}
                  insight={i}
                  alvo={alvoDe(i)}
                  aluno={null}
                  onAbrirAluno={() => undefined}
                  onDecidir={(status, motivo) => decidir(i.id, status, motivo)}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
