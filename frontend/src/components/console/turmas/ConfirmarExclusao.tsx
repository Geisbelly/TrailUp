import { useRef } from "react";
import { Trash2 } from "lucide-react";
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

/**
 * Confirmação de excluir turma (protótipo 378-402; revisões 01 e 03).
 * AlertDialog do Radix: o foco começa em "Cancelar", Esc cancela e o foco
 * fica preso no diálogo. O botão destrutivo usa texto escuro sobre
 * --destructive (8,7:1) — o branco sobre #e2574c do protótipo dá 3,68:1.
 */
export function ConfirmarExclusao({
  nome,
  aberto,
  excluindo,
  onConfirmar,
  onCancelar,
}: {
  nome: string;
  aberto: boolean;
  excluindo: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  // Durante a animação de fechar, a tela já limpou a turma: sem isto o
  // diálogo piscaria com o nome vazio.
  const ultimoNome = useRef(nome);
  if (nome) ultimoNome.current = nome;
  const nomeVisivel = ultimoNome.current;

  return (
    <AlertDialog open={aberto} onOpenChange={(v) => !v && !excluindo && onCancelar()}>
      <AlertDialogContent className="max-w-[460px] rounded-[20px] border-[hsl(var(--destructive)/.5)] bg-card">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-destructive/50 bg-destructive/15">
              <Trash2 className="h-[15px] w-[15px] text-[hsl(var(--destructive))]" />
            </span>
            <AlertDialogTitle className="text-[19px]">Excluir turma</AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-2 pt-2 text-left">
              <p className="text-sm font-semibold text-foreground">Excluir “{nomeVisivel}”?</p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Isso remove permanentemente a turma, sua trilha, as matrículas, o histórico de desempenho dos alunos nela e os dados de guilda. Esta ação não
                pode ser desfeita.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-3 sm:justify-between">
          <AlertDialogCancel disabled={excluindo} className="mt-0 rounded-full">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={excluindo}
            onClick={(e) => {
              // Fica aberto até a RPC responder; quem fecha é a tela.
              e.preventDefault();
              onConfirmar();
            }}
            className="rounded-full bg-destructive font-bold text-destructive-foreground hover:bg-destructive/90"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            {excluindo ? "Excluindo…" : "Excluir turma"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
