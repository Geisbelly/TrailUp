import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Título + subtítulo + ação principal, o cabeçalho que as telas novas do console repetem (protótipo V9). */
export function CabecalhoDePagina({ titulo, subtitulo, acao }: { titulo: string; subtitulo?: string; acao?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-[32px] font-bold leading-tight">{titulo}</h2>
        {subtitulo && <p className="mt-2 text-[14.5px] text-muted-foreground">{subtitulo}</p>}
      </div>
      {acao}
    </div>
  );
}

export function EstadoVazioDaPagina({
  icone: Icone,
  titulo,
  texto,
  acao,
}: {
  icone: LucideIcon;
  titulo: string;
  texto: string;
  acao?: { rotulo: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[20px] border bg-card px-6 py-20 text-center sm:px-10">
      <Icone className="h-[46px] w-[46px] text-muted-foreground" strokeWidth={1.4} aria-hidden="true" />
      <h3 className="text-2xl">{titulo}</h3>
      <p className="max-w-[480px] text-[15px] leading-relaxed text-muted-foreground">{texto}</p>
      {acao && (
        <Button onClick={acao.onClick} className="mt-1.5 rounded-full px-6">
          {acao.rotulo}
        </Button>
      )}
    </div>
  );
}

/** Erro de carga: nunca cai no estado vazio quando a leitura falhou (o professor acharia que perdeu os dados). */
export function ErroDaPagina({ titulo, detalhe, onTentarNovamente }: { titulo: string; detalhe?: string; onTentarNovamente: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-[20px] border border-destructive/50 bg-card px-6 py-16 text-center">
      <h3 className="text-xl font-bold">{titulo}</h3>
      <p className="max-w-md text-sm text-muted-foreground">Isto não significa que não há nada cadastrado. Tente de novo em alguns segundos.</p>
      {detalhe && <p className="break-words text-xs text-muted-foreground/80">Detalhe: {detalhe}</p>}
      <Button variant="outline" className="rounded-full" onClick={onTentarNovamente}>
        Tentar de novo
      </Button>
    </div>
  );
}

export type TomDoSelo = "ativo" | "neutro" | "alerta" | "perigo";

const TONS: Record<TomDoSelo, string> = {
  ativo: "bg-success/15 text-success",
  neutro: "border text-muted-foreground",
  alerta: "bg-warning/15 text-warning",
  perigo: "bg-destructive/15 text-destructive",
};

export function SeloDeStatus({ tom, children }: { tom: TomDoSelo; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold ${TONS[tom]}`}>{children}</span>;
}
