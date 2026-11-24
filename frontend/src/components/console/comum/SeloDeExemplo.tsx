import { FlaskConical } from "lucide-react";

/** Selo repetido em cada bloco: quem rola a página não pode perder de vista que o número é inventado. */
export function SeloDeExemplo() {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-warning/60 bg-warning/10 px-3 py-1 text-[12px] font-semibold text-foreground">
      <FlaskConical size={14} aria-hidden="true" /> Exemplo: valores ilustrativos
    </span>
  );
}

/** Aviso no topo de uma aba da turma de demonstração: o que é exemplo e o que acontece ao mexer nele. */
export function AvisoDeExemplo({ texto }: { texto: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[16px] border border-warning/50 bg-warning/5 px-4 py-3">
      <SeloDeExemplo />
      <p className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">{texto}</p>
    </div>
  );
}
