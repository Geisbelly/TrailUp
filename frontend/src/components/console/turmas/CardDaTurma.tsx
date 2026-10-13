import { Link } from "react-router-dom";
import { CalendarCheck, Copy, Pencil, Plus, Route, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { caminhoDaTrilha, formatarConclusao, siglaDaTurma, situacaoDaTurma, type ResumoDaTurma } from "./resumo";

const TOM = {
  success: "bg-[hsl(var(--success)/.16)] text-[hsl(var(--success))]",
  warning: "bg-[hsl(var(--warning)/.16)] text-[hsl(var(--console-warning-text))]",
};

// Círculo de 44px no celular (alvo de toque) e 30px a partir do sm, como no protótipo.
const ICONE =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:h-[30px] sm:w-[30px]";

function Numero({ rotulo, valor, apagado }: { rotulo: string; valor: string; apagado?: boolean }) {
  return (
    <div>
      <div className="console-label-sm text-[10.5px]">{rotulo}</div>
      <div className={cn("mt-[5px] text-xl font-bold", apagado ? "text-muted-foreground" : "text-foreground")}>{valor}</div>
    </div>
  );
}

export type TurmaDoCard = { id: number; descricao: string | null; materiaNome: string | null };

export function CardDaTurma({
  turma,
  resumo,
  ocupado,
  onMatriculas,
  onPresenca,
  onEditar,
  onDuplicar,
  onExcluir,
}: {
  turma: TurmaDoCard;
  resumo: ResumoDaTurma;
  ocupado: boolean;
  onMatriculas: () => void;
  onPresenca: () => void;
  onEditar: () => void;
  onDuplicar: () => void;
  onExcluir: () => void;
}) {
  const nome = turma.descricao?.trim() || `Turma ${turma.id}`;
  const situacao = situacaoDaTurma(resumo.topicos);
  const comTrilha = resumo.topicos > 0;

  return (
    <article
      aria-label={nome}
      className="flex min-h-[230px] min-w-0 flex-col rounded-[20px] border border-border bg-card px-[26px] py-6 transition-colors focus-within:border-[hsl(var(--console-violet))] hover:border-[hsl(var(--console-violet)/.6)]"
    >
      <div className="flex items-start gap-3.5">
        <div
          aria-hidden="true"
          className={cn(
            "flex h-10 w-10 flex-none items-center justify-center rounded-full text-[13px] font-extrabold",
            comTrilha ? "bg-[hsl(var(--console-violet)/.16)] text-[hsl(var(--console-violet-text))]" : "bg-muted text-muted-foreground",
          )}
        >
          {siglaDaTurma(turma.descricao)}
        </div>
        <div className="min-w-0 flex-1">
          {/* Duas linhas antes de cortar: o fim do nome costuma ser o período ("… 2026/2"). */}
          <h3 className="line-clamp-2 break-words text-xl leading-tight text-foreground" title={nome}>
            {nome}
          </h3>
          <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">{turma.materiaNome?.trim() || "Geral"}</p>
        </div>
        <span className={cn("whitespace-nowrap rounded-full px-3 py-[5px] text-[10.5px] font-bold", TOM[situacao.tom])}>{situacao.rotulo}</span>
      </div>

      <div className="mt-5 flex flex-wrap gap-5">
        <Numero rotulo="Alunos" valor={String(resumo.alunos)} />
        <Numero rotulo="Tópicos" valor={String(resumo.topicos)} apagado={!comTrilha} />
        <Numero rotulo="Conclusão" valor={formatarConclusao(resumo.conclusaoPct)} apagado={resumo.conclusaoPct === null} />
      </div>

      {/* Empurra o rodapé para baixo em cards de altura diferente, com no mínimo 18px. */}
      <div aria-hidden="true" className="min-h-[18px] flex-1" />
      <div className="flex flex-wrap items-center gap-[9px] border-t border-border pt-4">
        <button
          type="button"
          onClick={onMatriculas}
          className="rounded-full border border-[hsl(var(--console-violet))] bg-[hsl(var(--console-violet)/.16)] px-4 py-[9px] text-[12.5px] font-semibold text-[hsl(var(--console-violet-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Matrículas
        </button>
        <button
          type="button"
          onClick={onPresenca}
          className="flex items-center gap-1.5 rounded-full border border-border px-4 py-[9px] text-[12.5px] font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CalendarCheck className="h-[13px] w-[13px]" aria-hidden="true" /> Presença
        </button>
        {/* Link de verdade: abre em nova aba e sobrevive ao refresh. */}
        <Link
          to={caminhoDaTrilha(turma.id)}
          aria-label={`${comTrilha ? "Abrir a trilha" : "Montar a trilha"} da turma ${nome}`}
          className="flex items-center gap-1.5 rounded-full border border-border px-4 py-[9px] text-[12.5px] font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Route className="h-[13px] w-[13px]" aria-hidden="true" /> {comTrilha ? "Abrir trilha" : "Montar trilha"}
        </Link>
        <div className="ml-auto flex flex-none items-center gap-1.5">
          <button type="button" onClick={onEditar} aria-label={`Editar a turma ${nome}`} title="Editar" className={ICONE}>
            <Pencil className="h-[13px] w-[13px]" aria-hidden="true" />
          </button>
          <button type="button" onClick={onDuplicar} disabled={ocupado} aria-label={`Duplicar a turma ${nome}`} title="Duplicar" className={ICONE}>
            <Copy className="h-[13px] w-[13px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onExcluir}
            aria-label={`Excluir a turma ${nome}`}
            title="Excluir"
            className={cn(ICONE, "text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))] hover:border-destructive/60")}
          >
            <Trash2 className="h-[13px] w-[13px]" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}

export function CardNovaTurma({ onCriar }: { onCriar: () => void }) {
  return (
    <button
      type="button"
      onClick={onCriar}
      className="flex min-h-[230px] flex-col items-center justify-center gap-2.5 rounded-[20px] border border-dashed border-[hsl(var(--console-violet)/.45)] bg-[hsl(var(--console-violet)/.05)] p-6 text-center transition-colors hover:bg-[hsl(var(--console-violet)/.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span aria-hidden="true" className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[hsl(var(--console-violet)/.18)]">
        <Plus className="h-[18px] w-[18px] text-[hsl(var(--console-violet-text))]" />
      </span>
      <span className="text-[13.5px] font-semibold text-[hsl(var(--console-violet-text))]">Nova turma</span>
      <span className="text-[11.5px] text-muted-foreground">nome e matéria</span>
    </button>
  );
}
