import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Numero({ rotulo, valor, destaque = false }: { rotulo: string; valor: string | number; destaque?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">{rotulo}</div>
      <div className={cn("mt-1 text-2xl font-bold", destaque ? "text-[hsl(var(--warning))]" : "text-foreground")}>{valor}</div>
    </div>
  );
}

export function Tabela({ cabecalho, linhas, vazio }: { cabecalho: string[]; linhas: (string | number)[][]; vazio: string }) {
  if (linhas.length === 0) return <p className="text-[12.5px] text-muted-foreground">{vazio}</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full text-left text-[12.5px]">
        <thead className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
          <tr>
            {cabecalho.map((c) => (
              <th key={c} scope="col" className="px-4 py-2.5 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-foreground">
          {linhas.map((l, i) => (
            <tr key={i} className="border-t border-border">
              {l.map((c, j) => (
                <td key={j} className="px-4 py-2.5">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-base font-bold text-foreground">
        {titulo}
      </h2>
      {children}
    </section>
  );
}
