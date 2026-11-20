import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  explicacaoDe,
  FRASE_DO_SELO,
  ROTULO_DO_SELO,
  type ChaveMetrica,
  type ExplicacaoMetrica,
} from "@/lib/metricas/explicacoes";

/** O ícone fica dentro de linhas e cards clicáveis: o clique nele abre só a explicação. */
export function pararPropagacao(e: { stopPropagation(): void }): void {
  e.stopPropagation();
}

// O conteúdo vai num portal, fora do `.console-shell`, então as classes `console-label*` não chegam
// aqui: os títulos usam as utilitárias direto, com os mesmos tokens AAA do tema.
const TITULO = "text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground";

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={TITULO}>{titulo}</div>
      <div className="mt-1 text-[13px] leading-snug text-foreground">{children}</div>
    </div>
  );
}

export function ConteudoDaExplicacao({ explicacao }: { explicacao: ExplicacaoMetrica }) {
  const { nome, selo, oQueMede, comoColeta, atualiza, limites, naoSignifica } = explicacao;
  return (
    <div className="space-y-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-foreground">{nome}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">{ROTULO_DO_SELO[selo]}</span>
        </div>
        <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{FRASE_DO_SELO[selo]}</p>
      </div>
      <Secao titulo="O que mede">{oQueMede}</Secao>
      <Secao titulo="Como é coletado">{comoColeta}</Secao>
      <Secao titulo="Atualiza">{atualiza}</Secao>
      {limites && limites.length > 0 && (
        <Secao titulo="Limites">
          <ul className="list-disc space-y-1 pl-4">
            {limites.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Secao>
      )}
      <Secao titulo="O que não significa">{naoSignifica}</Secao>
    </div>
  );
}

export default function ExplicacaoDaMetrica({ chave, className }: { chave: ChaveMetrica; className?: string }) {
  const explicacao = explicacaoDe(chave);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Como funciona: ${explicacao.nome}`}
          onClick={pararPropagacao}
          className={cn(
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <Info className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={16}
        className="w-80 max-w-[calc(100vw-32px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain border-border bg-popover"
        onClick={pararPropagacao}
      >
        <ConteudoDaExplicacao explicacao={explicacao} />
      </PopoverContent>
    </Popover>
  );
}
