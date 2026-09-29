import { cn } from "@/lib/utils";
import { chaveDoPerfil, COR_DO_PERFIL, iniciaisDe } from "./perfilCores";

// Fundo = marca do perfil a 13% (o "22" hex do protótipo), iniciais na
// variante de texto. O protótipo usa a marca sólida com iniciais escuras, mas
// em 5 dos 7 perfis nenhuma cor de iniciais chega a 7:1 sobre a marca sólida
// (docs/frontend/redesign-fase-2/01-analise-dashboard.md, seção 6).
const fundoTintado = (marca: string) => `${marca}22`;

export function PerfilAvatar({ nome, perfil, tamanho = 32 }: { nome: string; perfil: string; tamanho?: number }) {
  const chave = chaveDoPerfil(perfil);
  const cor = chave ? COR_DO_PERFIL[chave] : null;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border-[1.5px] text-[11px] font-extrabold",
        !cor && "border-border bg-muted text-foreground",
      )}
      style={{
        width: tamanho,
        height: tamanho,
        ...(cor && { background: fundoTintado(cor.marca), borderColor: cor.marca, color: cor.texto }),
      }}
    >
      {iniciaisDe(nome)}
    </div>
  );
}

export function PerfilChip({ perfil }: { perfil: string }) {
  const chave = chaveDoPerfil(perfil);
  const cor = chave ? COR_DO_PERFIL[chave] : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[7px] whitespace-nowrap rounded-full py-[5px] pl-2 pr-3 text-xs font-semibold",
        !cor && "bg-muted pl-3 text-muted-foreground",
      )}
      style={cor ? { background: fundoTintado(cor.marca), color: cor.texto } : undefined}
    >
      {cor && <span aria-hidden="true" className="h-[9px] w-[9px] rounded-full" style={{ background: cor.marca }} />}
      {perfil}
    </span>
  );
}
