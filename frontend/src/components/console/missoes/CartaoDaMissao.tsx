import { Link } from "react-router-dom";
import { Check, ClipboardCheck, Copy, ListChecks, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aguardaDecisao, origemDe, podeEditar, rotuloDaOrigem, rotuloDoEscopo } from "./aprovacao";
import { percentualDeEntrega, resumoDeEntregas, rotuloDoPrazo } from "./missao";
import type { Missao } from "./missoesApi";

/**
 * Cartão da lista de missões.
 *
 * Dois caminhos, duas caras: `entrega` mostra nota, entregas e os atalhos para o tópico e para
 * a correção; `meta` mostra o critério e nada disso — ela não tem atividade atrás, então
 * `topicoId` é nulo e um link para `/console/trilha/null/editar` levaria a lugar nenhum.
 *
 * Missão que não é do professor (IA, sistema) não tem "Editar": `trg_missoes_guarda` descarta
 * a mudança sem erro, e o botão seria uma escrita fantasma. Para mudar, duplica — a cópia nasce
 * do professor. Pendente ganha Aprovar e Recusar quando quem monta passa os dois callbacks.
 */
export function CartaoDaMissao({
  missao,
  onEditar,
  onDuplicar,
  onExcluir,
  onAprovar,
  onRecusar,
  decidindo = false,
}: {
  missao: Missao;
  onEditar: () => void;
  onDuplicar: () => void;
  onExcluir: () => void;
  onAprovar?: () => void;
  onRecusar?: () => void;
  decidindo?: boolean;
}) {
  const editavel = podeEditar(missao);
  const decidir = aguardaDecisao(missao) && onAprovar && onRecusar;
  const pct = percentualDeEntrega(missao.entregues, missao.total);
  const entrega = missao.caminho === "entrega";
  return (
    <li className="rounded-[20px] border bg-card p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[16.5px] font-bold">{missao.titulo}</h3>
            {missao.aprovacao === "pendente" && (
              <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Aguarda você
              </span>
            )}
            {!editavel && (
              <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-400">
                {rotuloDaOrigem(origemDe(missao.origem))}
              </span>
            )}
            {missao.aprovacao === "recusada" && (
              <span className="rounded-full bg-destructive/15 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-destructive">
                Recusada
              </span>
            )}
            {!missao.ativa && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                Desativada
              </span>
            )}
          </div>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {entrega ? missao.topicoNome : missao.criterioRotulo}
          </p>
        </div>
        <div className="flex gap-1.5">
          {editavel && (
            <Button variant="ghost" size="sm" className="rounded-full" onClick={onEditar} aria-label={`Editar ${missao.titulo}`}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}
          <Button variant="ghost" size="sm" className="rounded-full" onClick={onDuplicar} aria-label={`Duplicar ${missao.titulo}`}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" className="rounded-full text-destructive hover:text-destructive" onClick={onExcluir} aria-label={`Excluir ${missao.titulo}`}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {missao.objetivo && <p className="mt-3 line-clamp-2 text-[13px] text-muted-foreground">{missao.objetivo}</p>}
      {missao.aprovacao === "recusada" && missao.motivoRecusa && (
        <p className="mt-2 text-[12.5px] text-destructive">Motivo da recusa: {missao.motivoRecusa}</p>
      )}
      {!editavel && (
        <p className="mt-2 text-[11.5px] text-muted-foreground">O texto é de quem propôs. Para mudar, duplique: a cópia passa a ser sua.</p>
      )}

      <dl className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(110px,1fr))]">
        <div>
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Quem cumpre</dt>
          <dd className="mt-1 text-sm font-semibold">{rotuloDoEscopo(missao.escopo)}</dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Prazo</dt>
          <dd className="mt-1 text-sm font-semibold">{rotuloDoPrazo(missao.prazo)}</dd>
        </div>
        {entrega ? (
          <>
            <div>
              <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Nota</dt>
              <dd className="mt-1 text-sm font-semibold">{missao.pontos} pts{missao.moedas > 0 && ` · ${missao.moedas} moedas`}</dd>
            </div>
            <div>
              <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Entregas</dt>
              <dd className="mt-1 text-sm font-semibold">{resumoDeEntregas(missao.entregues, missao.total)}</dd>
            </div>
          </>
        ) : (
          <div>
            <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Critério</dt>
            <dd className="mt-1 text-sm font-semibold">{missao.criterioRotulo}</dd>
          </div>
        )}
      </dl>

      {decidir && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" className="rounded-full font-bold" onClick={onAprovar} disabled={decidindo} aria-label={`Aprovar ${missao.titulo}`}>
            <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Aprovar
          </Button>
          <Button size="sm" variant="outline" className="rounded-full" onClick={onRecusar} disabled={decidindo} aria-label={`Recusar ${missao.titulo}`}>
            <X className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Recusar
          </Button>
        </div>
      )}

      {entrega && (
        <>
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Entregas de ${missao.titulo}: ${pct}%`}
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {missao.topicoId != null && (
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link to={`/console/trilha/${missao.topicoId}/editar`}>
                  <ListChecks className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Editar itens no tópico
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/console/notas">
                <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Corrigir entregas
              </Link>
            </Button>
          </div>
        </>
      )}
    </li>
  );
}
