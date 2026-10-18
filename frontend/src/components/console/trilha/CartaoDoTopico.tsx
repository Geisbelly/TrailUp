import { Copy, Pencil, Trash2 } from "lucide-react";

/**
 * Cartão de tópico do mapa (protótipo V9, Trilhas). Só desenha: o arraste, os
 * conectores D/N e o clique ficam no invólucro do TopicsManager. As três ações
 * ficam sempre visíveis (não escondidas atrás de hover) e param o ponteiro para
 * não iniciar o arraste do cartão.
 */
export function CartaoDoTopico({
  numero,
  nome,
  descricao,
  dependeDe,
  proximos,
  onEditar,
  onDuplicar,
  onExcluir,
}: {
  numero: number;
  nome: string;
  descricao: string | null;
  dependeDe: string[];
  proximos: string[];
  onEditar: () => void;
  onDuplicar: () => void;
  onExcluir: () => void;
}) {
  const parar = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();
  const acao = (rotulo: string, Icone: typeof Pencil, onClick: () => void, perigo = false) => (
    <button
      type="button"
      title={rotulo}
      aria-label={`${rotulo}: ${nome}`}
      onPointerDown={parar}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex h-7 w-7 items-center justify-center rounded-full bg-background text-muted-foreground transition-colors ${
        perigo ? "hover:bg-destructive/15 hover:text-destructive" : "hover:bg-primary/15 hover:text-primary"
      }`}
    >
      <Icone className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card shadow-lg" style={{ cursor: "grab" }}>
      <span className="absolute right-3 top-2.5 text-[10px] font-bold tracking-wider text-muted-foreground">#{numero}</span>
      <div className="flex items-start gap-3 px-3.5 pb-2.5 pt-3.5">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 flex-none items-center justify-center bg-primary/20 text-[13px] font-extrabold text-primary"
          style={{ clipPath: "polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0 50%)" }}
        >
          {numero}
        </span>
        <div className="min-w-0 flex-1 pr-6">
          <p className="line-clamp-2 text-sm font-bold leading-tight">{nome}</p>
          {descricao && <p className="mt-0.5 line-clamp-1 text-[10.5px] text-muted-foreground">{descricao}</p>}
        </div>
      </div>

      {(dependeDe.length > 0 || proximos.length > 0) && (
        <div className="flex flex-wrap gap-1.5 px-3.5 pb-2.5">
          {dependeDe.map((n) => (
            <span key={`d-${n}`} title={n} className="max-w-[120px] truncate rounded-full bg-info/15 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-info">
              dep {n}
            </span>
          ))}
          {proximos.map((n) => (
            <span key={`n-${n}`} title={n} className="max-w-[120px] truncate rounded-full bg-primary/15 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-primary">
              next {n}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t px-3.5 py-2">
        <button
          type="button"
          onPointerDown={parar}
          onClick={(e) => {
            e.stopPropagation();
            onEditar();
          }}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-primary hover:bg-primary/15"
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
          Editar tópico
        </button>
        <span className="ml-auto flex gap-1.5">
          {acao("Duplicar tópico", Copy, onDuplicar)}
          {acao("Excluir tópico", Trash2, onExcluir, true)}
        </span>
      </div>
    </div>
  );
}
