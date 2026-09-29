import { Link } from "react-router-dom";
import { Sparkles, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { consolePathForView } from "@/pages/consoleSections";

export function DashboardCarregando() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite">
      <div className="grid gap-5 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="console-skeleton h-[150px]" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="console-skeleton h-[300px]" style={{ animationDelay: ".2s" }} />
        <div className="console-skeleton h-[300px]" style={{ animationDelay: ".35s" }} />
      </div>
      <div className="flex items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-[18px] text-sm text-muted-foreground">
        <Sparkles className="h-[18px] w-[18px] animate-pulse text-[hsl(var(--console-violet-text))]" aria-hidden="true" />
        Consultando o desempenho da turma…
      </div>
    </div>
  );
}

export function DashboardVazio({ semTurmas }: { semTurmas: boolean }) {
  const titulo = semTurmas ? "Nenhuma turma ainda" : "Nenhum aluno nesta turma ainda";
  const texto = semTurmas
    ? "Os indicadores aparecem quando você cria uma turma e os alunos começam a percorrer a trilha."
    : "Os indicadores aparecem assim que os alunos aceitarem a matrícula e começarem a percorrer a trilha. Convide sua turma para começar.";

  return (
    <div className="flex flex-col items-center gap-4 rounded-[20px] border border-border bg-card px-10 py-20 text-center">
      <UserPlus className="h-[46px] w-[46px] text-muted-foreground" strokeWidth={1.4} aria-hidden="true" />
      <h2 className="text-2xl text-foreground">{titulo}</h2>
      <p className="max-w-[480px] text-[15px] leading-relaxed text-muted-foreground">{texto}</p>
      <div className="mt-1.5 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link to={consolePathForView("classes")}>{semTurmas ? "Criar turma" : "Convidar alunos"}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to={consolePathForView("trilha")}>Montar a trilha</Link>
        </Button>
      </div>
    </div>
  );
}

export function DashboardErro({ detalhe, onTentarNovamente }: { detalhe: string; onTentarNovamente: () => void }) {
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
        <h2 className="mb-2 text-xl text-foreground">Não foi possível carregar os indicadores</h2>
        <p className="max-w-[600px] text-sm leading-relaxed text-foreground">
          Não conseguimos buscar os dados da turma agora. Nada foi perdido — tente de novo em alguns segundos.
        </p>
        <p className="mt-2 break-words text-xs text-foreground/80">Detalhe: {detalhe}</p>
        <Button className="mt-4 bg-foreground text-background hover:bg-foreground/90" onClick={onTentarNovamente}>
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}
