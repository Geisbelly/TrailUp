import { useEffect, useRef, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";

/** Mantém o último nome para o diálogo não piscar vazio durante a animação de fechar. */
function useUltimoNome(nome: string) {
  const ultimo = useRef(nome);
  if (nome) ultimo.current = nome;
  return ultimo.current;
}

/** Duplicar tópico (protótipo 742-755): cópia com conteúdos, cards e questões, sem progresso de aluno. */
export function ConfirmarDuplicarTopico({
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
  const visivel = useUltimoNome(nome);
  return (
    <AlertDialog open={aberto} onOpenChange={(v) => !v && !duplicando && onCancelar()}>
      <AlertDialogContent className="max-w-[460px] rounded-[20px] bg-card">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[19px]">Duplicar tópico</AlertDialogTitle>
          <AlertDialogDescription className="text-left text-[13px] leading-relaxed">
            Cria uma cópia de “{visivel}” com os mesmos conteúdos, cards e questões associados. A cópia entra sem nenhum progresso de aluno vinculado e
            sem as ligações de sequência e pré-requisito.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-3 sm:justify-between">
          <AlertDialogCancel disabled={duplicando} className="mt-0 rounded-full">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={duplicando}
            onClick={(e) => {
              e.preventDefault();
              onConfirmar();
            }}
            className="rounded-full font-bold"
          >
            <Copy className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            {duplicando ? "Duplicando…" : "Duplicar tópico"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Excluir tópico (protótipo 756-769). Mantém a regra que o código já tinha —
 * digitar o nome do tópico —, só que dentro do diálogo em vez de `window.prompt`:
 * a exclusão leva conteúdos, cards, questões e a personalização gerada.
 */
export function ConfirmarExcluirTopico({
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
  const visivel = useUltimoNome(nome);
  const [digitado, setDigitado] = useState("");
  useEffect(() => {
    if (!aberto) setDigitado("");
  }, [aberto]);
  const liberado = digitado.trim() === visivel.trim() && visivel !== "";

  return (
    <AlertDialog open={aberto} onOpenChange={(v) => !v && !excluindo && onCancelar()}>
      <AlertDialogContent className="max-w-[460px] rounded-[20px] border-[hsl(var(--destructive)/.5)] bg-card">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-destructive/50 bg-destructive/15">
              <Trash2 className="h-[15px] w-[15px] text-destructive" />
            </span>
            <AlertDialogTitle className="text-[19px]">Excluir tópico</AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-2 text-left">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Excluir “{visivel}” remove permanentemente seus conteúdos, cards e questões associados. Esta ação não pode ser desfeita.
              </p>
              <label className="block text-[12.5px] text-muted-foreground" htmlFor="confirmar-nome-topico">
                Para confirmar, digite o nome do tópico: <strong className="text-foreground">{visivel}</strong>
              </label>
              <Input
                id="confirmar-nome-topico"
                value={digitado}
                onChange={(e) => setDigitado(e.target.value)}
                autoComplete="off"
                className="rounded-[14px]"
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-3 sm:justify-between">
          <AlertDialogCancel disabled={excluindo} className="mt-0 rounded-full">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={excluindo || !liberado}
            onClick={(e) => {
              e.preventDefault();
              onConfirmar();
            }}
            className="rounded-full bg-destructive font-bold text-destructive-foreground hover:bg-destructive/90"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            {excluindo ? "Excluindo…" : "Excluir tópico"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
