import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  estadoDaAnalise,
  oQueMudou,
  podePedirRevisao,
  rotuloDaDecisao,
  type AlteracaoDaTrilha,
  type AlteracaoDoAluno,
  type DecisaoDoProfessor,
} from "./alteracoes";
import { useAlteracoesDaTrilha } from "./useAlteracoesDaTrilha";
import type { Aluno } from "./aluno/tipos";

const botao = "rounded-full border border-border px-3 py-1.5 text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60";

const TOM: Record<string, string> = {
  ia: "border-[hsl(var(--console-violet)/.4)] text-[hsl(var(--console-violet-text))]",
  neutro: "border-border text-muted-foreground",
  atencao: "border-destructive/50 text-foreground",
};

function formatarQuando(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime())
    ? ""
    : data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function CartaoDeAlteracao({
  alteracao,
  alunos,
  titulo,
  nomeDoAluno,
  onDecidir,
}: {
  alteracao: AlteracaoDaTrilha;
  alunos: AlteracaoDoAluno[];
  titulo: string;
  nomeDoAluno: (id: string) => string;
  onDecidir: (alunoId: string | null, decisao: DecisaoDoProfessor) => Promise<void>;
}) {
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const analise = estadoDaAnalise(alteracao);
  const mudou = oQueMudou(alteracao.mudancas);
  const algumDoProfessor = alunos.some((a) => a.decisao_professor != null);

  const decidir = async (chave: string, alunoId: string | null, decisao: DecisaoDoProfessor) => {
    setSalvando(chave);
    setErro(null);
    try {
      await onDecidir(alunoId, decisao);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(null);
    }
  };

  return (
    <li className="rounded-[18px] border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {alteracao.alvo_tipo === "atividade" ? "Atividade" : "Conteúdo"}
        </span>
        <span className="text-sm font-bold text-foreground">{titulo}</span>
        <span className="text-[11.5px] text-muted-foreground">{formatarQuando(alteracao.criada_em)}</span>
        <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] sm:ml-auto", TOM[analise.tom])}>{analise.rotulo}</span>
      </div>
      {mudou.length > 0 && <p className="mt-1.5 text-[12.5px] text-muted-foreground">Mudou: {mudou.join(", ")}.</p>}
      {alteracao.resumo && <p className="mt-1 text-[12.5px] text-foreground">O aluno vê: “{alteracao.resumo}”</p>}
      {alteracao.motivo && <p className="mt-1 text-[12px] text-muted-foreground">Por que, segundo a IA: {alteracao.motivo}</p>}

      <ul className="mt-3 flex flex-col divide-y divide-border">
        {alunos.map((a) => {
          const efetiva = String(a.decisao_efetiva);
          const chave = `${alteracao.id}:${a.aluno_id}`;
          const revisavel = podePedirRevisao(alteracao, a);
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
              <span className="text-[13px] text-foreground">{nomeDoAluno(a.aluno_id)}</span>
              <span className="text-[11.5px] text-muted-foreground">{a.situacao === "fez" ? "já tinha feito" : "já tinha visto"}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">
                {rotuloDaDecisao(efetiva, a.revisada_em)}
                {a.decisao_professor != null ? " (você)" : ""}
              </span>
              {a.recorrigida && <span className="text-[11px] text-muted-foreground">gabarito recorrigido, nota subiu</span>}
              {a.motivo && a.decisao_professor == null && (
                <span className="basis-full text-[11.5px] text-muted-foreground">{a.motivo}</span>
              )}
              <span className="flex gap-1.5 sm:ml-auto">
                {revisavel && efetiva !== "revisar" && (
                  <button type="button" className={botao} disabled={salvando !== null} onClick={() => void decidir(chave, a.aluno_id, "revisar")}>
                    Pedir revisão
                  </button>
                )}
                {efetiva === "revisar" && !a.revisada_em && (
                  <button type="button" className={botao} disabled={salvando !== null} onClick={() => void decidir(chave, a.aluno_id, "destacar")}>
                    Não pedir revisão
                  </button>
                )}
                {(efetiva === "cosmetica" || efetiva === "pendente_analise") && (
                  <button type="button" className={botao} disabled={salvando !== null} onClick={() => void decidir(chave, a.aluno_id, "destacar")}>
                    Avisar
                  </button>
                )}
                {a.decisao_professor != null && (
                  <button type="button" className={botao} disabled={salvando !== null} onClick={() => void decidir(chave, a.aluno_id, "ia")}>
                    Voltar à IA
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {algumDoProfessor && alunos.length > 1 && (
        <button
          type="button"
          className={cn(botao, "mt-2")}
          disabled={salvando !== null}
          onClick={() => void decidir(`${alteracao.id}:todos`, null, "ia")}
        >
          Voltar todos à decisão da IA
        </button>
      )}
      {erro && (
        <p role="alert" className="mt-2 text-xs text-[hsl(var(--destructive))]">
          Não foi possível salvar: {erro}
        </p>
      )}
    </li>
  );
}

/**
 * "Alterações na trilha": o que o professor mudou depois que algum aluno já tinha visto ou feito
 * o item, o que a IA decidiu e o botão de desfazer. Some enquanto a migração 20261101_12 não
 * estiver no banco.
 */
export default function SecaoAlteracoesDaTrilha({
  classIds,
  alunos,
  mostrarTurma,
  nomeDaTurma,
}: {
  classIds: number[];
  alunos: Aluno[];
  mostrarTurma: boolean;
  nomeDaTurma: (id: number) => string;
}) {
  const { alteracoes, alunosPorAlteracao, titulos, estado, decidir } = useAlteracoesDaTrilha(classIds);
  if (estado.tipo === "indisponivel" || estado.tipo === "carregando") return null;
  if (estado.tipo === "erro") {
    return (
      <p role="alert" className="rounded-[14px] border border-destructive/50 px-4 py-3 text-[12.5px] text-foreground">
        Não foi possível carregar as alterações da trilha. Detalhe: {estado.detalhe}
      </p>
    );
  }
  const nomeDoAluno = (id: string) => alunos.find((a) => a.id === id)?.nome ?? "Aluno";

  return (
    <section aria-labelledby="alteracoes-da-trilha" className="flex flex-col gap-3">
      <div>
        <h3 id="alteracoes-da-trilha" className="text-base font-bold text-foreground">
          Alterações na trilha ({alteracoes.length})
        </h3>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Quando você muda um conteúdo ou uma atividade que algum aluno já viu ou fez, a IA decide se a mudança merece
          aviso e quem precisa revisar. A decisão vale na hora; aqui você pode mudar. Quem revisa não perde a nota de
          antes: vale a maior.
        </p>
      </div>
      {alteracoes.length === 0 ? (
        <p className="rounded-[18px] border border-border bg-card px-5 py-6 text-center text-[12.5px] text-muted-foreground">
          Nenhuma alteração em item já visto pelos alunos.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {alteracoes.map((a) => {
            const item = titulos.get(`${a.alvo_tipo}:${a.conteudo_id ?? a.atividade_id}`) ?? "Item da trilha";
            return (
              <CartaoDeAlteracao
                key={a.id}
                alteracao={a}
                alunos={alunosPorAlteracao.get(a.id) ?? []}
                titulo={mostrarTurma ? `${item} · ${nomeDaTurma(a.classe_id)}` : item}
                nomeDoAluno={nomeDoAluno}
                onDecidir={(alunoId, decisao) => decidir(a.id, alunoId, decisao)}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
