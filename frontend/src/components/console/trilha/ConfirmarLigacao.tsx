import { useRef } from "react";
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
 * Conflito entre ligações do mapa (já era dependência/sequência no sentido inverso).
 * Antes era um `window.confirm` dentro do hook; agora é um diálogo do console,
 * com o foco em "Manter como está" (o caminho que não altera nada).
 */
export function ConfirmarLigacao({
  mensagem,
  onConfirmar,
  onCancelar,
}: {
  mensagem: string | null;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  // Durante a animação de fechar a mensagem já voltou a null: guarda a última para o texto não sumir.
  const ultima = useRef(mensagem);
  if (mensagem) ultima.current = mensagem;
  return (
    <AlertDialog open={mensagem !== null} onOpenChange={(v) => !v && onCancelar()}>
      <AlertDialogContent className="max-w-[460px] rounded-[20px] bg-card">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[19px]">Conflito entre ligações</AlertDialogTitle>
          <AlertDialogDescription className="text-left text-[13px] leading-relaxed">{ultima.current}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-3 sm:justify-between">
          <AlertDialogCancel className="mt-0 rounded-full">Manter como está</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmar} className="rounded-full font-bold">
            Remover a ligação inversa
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
