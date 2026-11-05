import { Link } from "react-router-dom";
import { CalendarCheck, Copy, Pencil, Route, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TurmaDaLista } from "./listaDeTurmas";
import { caminhoDaTrilha, formatarConclusao, situacaoDaTurma } from "./resumo";

type Acoes = { onMatriculas: () => void; onPresenca: () => void; onEditar: () => void; onDuplicar: () => void; onExcluir: () => void };

const TOM = {
  success: "text-[hsl(var(--success))]",
  warning: "text-[hsl(var(--console-warning-text))]",
};
const ICONE = "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const NUM = "px-3 py-3 text-right tabular-nums";

/** A mesma turma do cartão, em uma linha: para comparar muitas de uma vez. Todas as ações ficam à vista, sem menu. */
export function TabelaDeTurmas({ turmas, ocupado, acoes }: { turmas: TurmaDaLista[]; ocupado: boolean; acoes: (id: number) => Acoes }) {
  return (
    <div className="overflow-x-auto rounded-[20px] border border-border bg-card">
      <table className="w-full min-w-[820px] text-left text-[13px]">
        <caption className="sr-only">Turmas do professor</caption>
        <thead className="border-b border-border text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
          <tr>
            <th scope="col" className="px-5 py-3 font-semibold">Turma</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Alunos</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Tópicos</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Conclusão</th>
            <th scope="col" className="px-3 py-3 font-semibold">Situação</th>
            <th scope="col" className="px-5 py-3"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {turmas.map((t) => {
            const a = acoes(t.id);
            const situacao = situacaoDaTurma(t.resumo.topicos);
            const comTrilha = t.resumo.topicos > 0;
            return (
              <tr key={t.id} className="border-b border-border transition-colors last:border-b-0 hover:bg-muted/40">
                <th scope="row" className="max-w-[320px] px-5 py-3 font-normal">
                  <div className="truncate font-semibold text-foreground" title={t.nome}>{t.nome}</div>
                  <div className="truncate text-[11.5px] text-muted-foreground">{t.materia ?? "Geral"}</div>
                </th>
                <td className={NUM}>{t.resumo.alunos}</td>
                <td className={cn(NUM, !comTrilha && "text-muted-foreground")}>{t.resumo.topicos}</td>
                <td className={cn(NUM, t.resumo.conclusaoPct === null && "text-muted-foreground")}>{formatarConclusao(t.resumo.conclusaoPct)}</td>
                <td className={cn("whitespace-nowrap px-3 py-3 text-[12px] font-semibold", TOM[situacao.tom])}>{situacao.rotulo}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button type="button" data-tutorial="turma-matriculas" onClick={a.onMatriculas} aria-label={`Matrículas da turma ${t.nome}`} className="whitespace-nowrap rounded-full border border-[hsl(var(--console-violet))] bg-[hsl(var(--console-violet)/.16)] px-3 py-1.5 text-[12px] font-semibold text-[hsl(var(--console-violet-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Matrículas
                    </button>
                    <button type="button" data-tutorial="turma-presenca" onClick={a.onPresenca} aria-label={`Presença da turma ${t.nome}`} title="Presença" className={ICONE}>
                      <CalendarCheck className="h-[13px] w-[13px]" aria-hidden="true" />
                    </button>
                    <Link to={caminhoDaTrilha(t.id)} aria-label={`${comTrilha ? "Abrir a trilha" : "Montar a trilha"} da turma ${t.nome}`} title={comTrilha ? "Abrir trilha" : "Montar trilha"} className={ICONE}>
                      <Route className="h-[13px] w-[13px]" aria-hidden="true" />
                    </Link>
                    <button type="button" onClick={a.onEditar} aria-label={`Editar a turma ${t.nome}`} title="Editar" className={ICONE}>
                      <Pencil className="h-[13px] w-[13px]" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={a.onDuplicar} disabled={ocupado} aria-label={`Duplicar a turma ${t.nome}`} title="Duplicar" className={ICONE}>
                      <Copy className="h-[13px] w-[13px]" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={a.onExcluir} aria-label={`Excluir a turma ${t.nome}`} title="Excluir" className={cn(ICONE, "text-[hsl(var(--destructive))] hover:border-destructive/60 hover:text-[hsl(var(--destructive))]")}>
                      <Trash2 className="h-[13px] w-[13px]" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
