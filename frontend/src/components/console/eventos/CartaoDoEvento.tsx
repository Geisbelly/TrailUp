import { CalendarDays, Lock, Medal, Pencil, PlayCircle, StopCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeloDeStatus } from "../comum/PaginaDoConsole";
import { rotuloDaJanela, rotuloDasPecas, rotuloDoStatus, situacaoDoEvento } from "./evento";
import type { Evento } from "./eventosApi";

const TOM = { rascunho: "neutro", aberto: "ativo", encerrado: "alerta" } as const;

/** Cartão da lista de eventos: o que é, quando, o que inclui e as ações que o estado permite. */
export function CartaoDoEvento({
  evento,
  topicoNome,
  onEditar,
  onAbrir,
  onEncerrar,
  onExcluir,
}: {
  evento: Evento;
  topicoNome?: string;
  onEditar: () => void;
  onAbrir: () => void;
  onEncerrar: () => void;
  onExcluir: () => void;
}) {
  const rascunho = evento.status === "rascunho";
  return (
    <li className="rounded-[20px] border bg-card p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[16.5px] font-bold">{evento.titulo}</h3>
            <SeloDeStatus tom={TOM[evento.status]}>{rotuloDoStatus(evento.status)}</SeloDeStatus>
          </div>
          <p className="mt-1 text-[12.5px] text-muted-foreground">{situacaoDoEvento(evento)}</p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" className="rounded-full" onClick={onEditar} aria-label={`${rascunho ? "Editar" : "Editar título de"} ${evento.titulo}`}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          {rascunho && (
            <Button variant="ghost" size="sm" className="rounded-full text-destructive hover:text-destructive" onClick={onExcluir} aria-label={`Excluir ${evento.titulo}`}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      {evento.descricao && <p className="mt-3 line-clamp-2 text-[13px] text-muted-foreground">{evento.descricao}</p>}

      <dl className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))]">
        <div>
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Janela</dt>
          <dd className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            {rotuloDaJanela(evento.inicio, evento.fim)}
          </dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Modalidades</dt>
          <dd className="mt-1 text-sm font-semibold">
            {evento.modalidadeGuilda ? `Individual + guilda (até ${evento.guildaTamanhoMax ?? "?"})` : "Individual"}
          </dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Pontos</dt>
          <dd className="mt-1 text-sm font-semibold">{evento.pontos} pts</dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Escopo</dt>
          <dd className="mt-1 truncate text-sm font-semibold">{topicoNome ?? "Turma toda"}</dd>
        </div>
      </dl>

      <p className="mt-3 text-[12.5px] text-muted-foreground">
        <span className="font-semibold text-foreground">Inclui:</span> {rotuloDasPecas(evento.pecas)}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {rascunho && (
          <Button size="sm" className="rounded-full font-bold" onClick={onAbrir}>
            <PlayCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Abrir evento
          </Button>
        )}
        {evento.status === "aberto" && (
          <Button size="sm" variant="outline" className="rounded-full" onClick={onEncerrar}>
            <StopCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Encerrar evento
          </Button>
        )}
        {!rascunho && (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
            <Lock className="h-3 w-3" aria-hidden="true" />
            Regras travadas
          </span>
        )}
        {evento.status === "encerrado" && (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
            <Medal className="h-3 w-3" aria-hidden="true" />
            Resultado e medalhas: em breve
          </span>
        )}
      </div>
    </li>
  );
}
