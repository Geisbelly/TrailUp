import { Search, X } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";

/** Busca instantânea das listas do console. O resultado aparece enquanto se digita, sem botão de filtrar. */
export function CampoDeBusca({
  valor,
  onChange,
  rotulo,
  placeholder,
  contagem,
  className,
}: {
  valor: string;
  onChange: (valor: string) => void;
  rotulo: string;
  placeholder: string;
  /** Anunciado ao leitor de tela a cada mudança, como "3 resultados". */
  contagem?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5 rounded-[14px] border border-border bg-muted px-3.5 py-2.5 focus-within:border-[hsl(var(--console-violet))] focus-within:ring-2 focus-within:ring-ring", className)}>
      <Search className="h-3.5 w-3.5 flex-none text-muted-foreground" aria-hidden="true" />
      <input
        id={id}
        type="search"
        aria-label={rotulo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground placeholder:text-muted-foreground focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {contagem && (
        <span aria-live="polite" className="flex-none whitespace-nowrap text-[11.5px] text-muted-foreground">
          {contagem}
        </span>
      )}
      {valor && (
        <button type="button" onClick={() => onChange("")} aria-label="Limpar busca" className="flex-none rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export type OpcaoDeFiltro<T extends string> = { value: T; label: string; contagem?: number; destaque?: boolean };

/** Filtros de um clique, sempre à vista e com a contagem de cada um (nunca escondidos num menu). */
export function FiltrosRapidos<T extends string>({ rotulo, opcoes, valor, onChange, className }: { rotulo: string; opcoes: OpcaoDeFiltro<T>[]; valor: T; onChange: (valor: T) => void; className?: string }) {
  return (
    <div role="group" aria-label={rotulo} className={cn("flex flex-wrap gap-1.5", className)}>
      {opcoes.map((o) => {
        const ativo = o.value === valor;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={ativo}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ativo ? "border-[hsl(var(--console-violet))] bg-[hsl(var(--console-violet)/.16)] text-[hsl(var(--console-violet-text))]" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
            {o.contagem !== undefined && <span className={cn("font-bold", o.destaque && o.contagem > 0 && !ativo ? "text-[hsl(var(--console-warning-text))]" : "")}>{o.contagem}</span>}
          </button>
        );
      })}
    </div>
  );
}
