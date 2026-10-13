import { GraduationCap, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TurmasCarregando() {
  return (
    <div role="status" aria-live="polite" className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr))]">
      <span className="sr-only">Carregando turmas…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="console-skeleton h-[230px]" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

export function TurmasVazio({ onCriar }: { onCriar: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[20px] border border-border bg-card px-6 py-[88px] text-center sm:px-10">
      <GraduationCap className="h-[46px] w-[46px] text-muted-foreground" strokeWidth={1.4} aria-hidden="true" />
      <h3 className="text-2xl text-foreground">Nenhuma turma ainda</h3>
      <p className="max-w-[480px] text-[15px] leading-relaxed text-muted-foreground">
        A turma é o ponto de partida: é dela que saem a trilha de conteúdo, as matrículas e o dashboard de desempenho.
      </p>
      <Button onClick={onCriar} className="mt-1.5 rounded-full px-6">
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Criar primeira turma
      </Button>
    </div>
  );
}

/** Mesmo padrão do erro do dashboard: nunca cair no estado vazio quando a leitura falhou. */
export function TurmasErro({ detalhe, onTentarNovamente }: { detalhe: string; onTentarNovamente: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-5 rounded-[20px] border border-destructive/50 p-[30px]"
      style={{ background: "linear-gradient(hsl(var(--destructive) / .1), hsl(var(--destructive) / .1)), hsl(var(--card))" }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-destructive text-lg font-extrabold text-foreground" aria-hidden="true">
        !
      </div>
      <div className="min-w-0">
        <h3 className="mb-2 text-xl text-foreground">Não foi possível carregar as turmas</h3>
        <p className="max-w-[600px] text-sm leading-relaxed text-foreground">
          Não conseguimos buscar suas turmas agora. Nada foi perdido — tente de novo em alguns segundos.
        </p>
        <p className="mt-2 break-words text-xs text-foreground/80">Detalhe: {detalhe}</p>
        <Button className="mt-4 bg-foreground text-background hover:bg-foreground/90" onClick={onTentarNovamente}>
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}
