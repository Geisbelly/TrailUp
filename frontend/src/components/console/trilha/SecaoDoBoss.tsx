import { useState } from "react";
import { ChevronDown, Swords } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { bossVisuals, normalizeBossVisual } from "@/lib/bossVisuals";
import { BossVisualPicker } from "./BossVisualPicker";
import FalasDoBoss from "./FalasDoBoss";

/**
 * Boss do conteúdo (visual + falas da IA) recolhido no fim do formulário. É ajuste
 * de acabamento: fica fechado para não empurrar o material — que é o que o
 * professor edita quase sempre — para baixo da dobra. O resumo no cabeçalho diz
 * qual boss está escolhido sem precisar abrir.
 */
export function SecaoDoBoss({
  conteudoId,
  value,
  onChange,
  disabled,
}: {
  conteudoId: number | null;
  value?: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const [aberta, setAberta] = useState(false);
  const escolhido = normalizeBossVisual(value);
  const rotulo = escolhido ? (bossVisuals.find((b) => b.id === escolhido)?.label ?? escolhido) : "Automático";

  return (
    <Collapsible open={aberta} onOpenChange={setAberta} className="rounded-[14px] border border-border bg-background">
      <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-[14px] p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {escolhido ? (
          <img src={`${import.meta.env.BASE_URL}bosses/${escolhido}.png`} alt="" className="h-10 w-10 flex-none rounded-full border border-border bg-card object-contain" />
        ) : (
          <span aria-hidden="true" className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary/20 text-primary">
            <Swords className="h-4 w-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">Boss deste conteúdo</span>
          <span className="block truncate text-xs text-muted-foreground">Visual: {rotulo} · falas geradas pela IA</span>
        </span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 flex-none text-muted-foreground transition-transform ${aberta ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-5 px-4 pb-4 pt-1">
        <BossVisualPicker value={value} onChange={onChange} disabled={disabled} />
        {/* O Radix desmonta o conteúdo fechado: as falas só são lidas no Supabase quando a seção abre. */}
        <FalasDoBoss conteudoId={conteudoId} />
      </CollapsibleContent>
    </Collapsible>
  );
}
