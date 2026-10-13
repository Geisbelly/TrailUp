import { useRef } from "react";
import { Copy } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Confirmação antes de duplicar (protótipo 363-376; revisão 04, item 09). */
export function ConfirmarDuplicacao({
  nome,
  aberto,
  duplicando,
  onConfirmar,
  onCancelar,
}: {
  nome: string;
  aberto: boolean;
  duplicando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  // Durante a animação de fechar, a tela já limpou a turma: sem isto o
  // diálogo piscaria com o nome vazio.
  const ultimoNome = useRef(nome);
  if (nome) ultimoNome.current = nome;
  const nomeVisivel = ultimoNome.current;

  return (
    <AlertDialog open={aberto} onOpenChange={(v) => !v && !duplicando && onCancelar()}>
      <AlertDialogContent className="max-w-[460px] rounded-[20px] border-[hsl(var(--console-violet))] bg-card">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[19px]">Duplicar turma</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 pt-2 text-left">
              <p className="text-sm font-semibold text-foreground">Duplicar “{nomeVisivel}”?</p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Uma cópia será criada com a mesma trilha, sem alunos matriculados e sem histórico da turma original.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-3 sm:justify-between">
          <AlertDialogCancel disabled={duplicando} className="mt-0 rounded-full">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={duplicando}
            onClick={(e) => {
              // Fica aberto até o banco responder; quem fecha é a tela.
              e.preventDefault();
              onConfirmar();
            }}
            className="rounded-full font-bold"
          >
            <Copy className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            {duplicando ? "Duplicando…" : "Duplicar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Faixa azul depois de duplicar (protótipo 88-99), com o nome que o banco deu à cópia. */
export function FaixaTurmaDuplicada({ nome, onFechar }: { nome: string; onFechar: () => void }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-3.5 rounded-2xl border border-[hsl(var(--info)/.4)] bg-[hsl(var(--info)/.14)] px-5 py-4">
      <span aria-hidden="true" className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[hsl(var(--info))] text-background">
        <Copy className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-foreground">Turma duplicada como uma nova entidade</div>
        <p className="mt-0.5 text-[12.5px] text-foreground">
          “{nome}” foi criada com a mesma trilha, sem alunos matriculados e sem histórico da turma original.
        </p>
      </div>
      <button
        type="button"
        onClick={onFechar}
        className="rounded-full px-3 py-2 text-[13px] font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Fechar
      </button>
    </div>
  );
}
