import { Link } from "react-router-dom";
import { ClipboardCheck, Copy, ListChecks, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { percentualDeEntrega, resumoDeEntregas, rotuloDoPrazo } from "./missao";
import type { Missao } from "./missoesApi";

/** Cartão da lista de missões (protótipo V9): título, tópico, prazo, pontos e quantos já entregaram. */
export function CartaoDaMissao({
  missao,
  onEditar,
  onDuplicar,
  onExcluir,
}: {
  missao: Missao;
  onEditar: () => void;
  onDuplicar: () => void;
  onExcluir: () => void;
}) {
  const pct = percentualDeEntrega(missao.entregues, missao.total);
  return (
    <li className="rounded-[20px] border bg-card p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16.5px] font-bold">{missao.titulo}</h3>
          <p className="mt-1 text-[12.5px] text-muted-foreground">{missao.topicoNome}</p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" className="rounded-full" onClick={onEditar} aria-label={`Editar ${missao.titulo}`}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" className="rounded-full" onClick={onDuplicar} aria-label={`Duplicar ${missao.titulo}`}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" className="rounded-full text-destructive hover:text-destructive" onClick={onExcluir} aria-label={`Excluir ${missao.titulo}`}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {missao.objetivo && <p className="mt-3 line-clamp-2 text-[13px] text-muted-foreground">{missao.objetivo}</p>}

      <dl className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(110px,1fr))]">
        <div>
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Prazo</dt>
          <dd className="mt-1 text-sm font-semibold">{rotuloDoPrazo(missao.prazo)}</dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Pontuação</dt>
          <dd className="mt-1 text-sm font-semibold">{missao.pontos} pts</dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Entregas</dt>
          <dd className="mt-1 text-sm font-semibold">{resumoDeEntregas(missao.entregues, missao.total)}</dd>
        </div>
      </dl>
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
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link to={`/console/trilha/${missao.topicoId}/editar`}>
            <ListChecks className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Editar itens no tópico
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link to="/console/notas">
            <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Corrigir entregas
          </Link>
        </Button>
      </div>
    </li>
  );
}
