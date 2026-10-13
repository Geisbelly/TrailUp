import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { plural } from "./conta";
import type { ContaEmNumeros } from "./useContaEmNumeros";

const PALAVRA = "EXCLUIR";

/** Modal de exclusão de conta (protótipo "Meus dados"): lista o que sai e só libera o botão com a palavra exata. */
export function ExcluirContaDialog({
  aberto,
  numeros,
  onFechar,
  onConfirmar,
}: {
  aberto: boolean;
  numeros: ContaEmNumeros | null;
  onFechar: () => void;
  onConfirmar: () => void;
}) {
  const [digitado, setDigitado] = useState("");
  useEffect(() => {
    if (!aberto) setDigitado("");
  }, [aberto]);
  const liberado = digitado === PALAVRA;

  const itens = [
    numeros ? `${plural(numeros.turmas, "turma", "turmas")} e ${plural(numeros.alunos, "matrícula", "matrículas")}` : "suas turmas e matrículas",
    numeros ? `${plural(numeros.topicos, "tópico", "tópicos")}, atividades e questões` : "seus tópicos, atividades e questões",
    "todo o material personalizado gerado pela IA",
  ];

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-[520px] rounded-[20px] border-destructive/50 bg-card">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-destructive/50 bg-destructive/15">
              <AlertTriangle className="h-[15px] w-[15px] text-destructive" />
            </span>
            <DialogTitle className="text-[19px]">Excluir a sua conta</DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-left text-[13.5px]">Isto remove permanentemente:</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {itens.map((t) => (
            <li key={t} className="flex items-center gap-2.5 rounded-[14px] bg-muted px-3.5 py-2.5 text-[12.5px] text-foreground">
              <span aria-hidden="true" className="h-[7px] w-[7px] flex-none rounded-full bg-destructive" />
              {t}
            </li>
          ))}
        </ul>
        <div className="space-y-2">
          <label htmlFor="confirmar-exclusao" className="text-[12.5px] text-muted-foreground">
            Para confirmar, digite <strong className="text-foreground">{PALAVRA}</strong> no campo abaixo.
          </label>
          <Input
            id="confirmar-exclusao"
            value={digitado}
            onChange={(e) => setDigitado(e.target.value)}
            placeholder={`digite ${PALAVRA}`}
            autoComplete="off"
            className="rounded-[14px] font-bold tracking-[0.12em]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="rounded-full" onClick={onFechar}>
            Manter minha conta
          </Button>
          <Button variant="destructive" className="ml-auto rounded-full font-bold" disabled={!liberado} onClick={onConfirmar}>
            Excluir conta permanentemente
          </Button>
        </div>
        <p className="text-[11.5px] text-muted-foreground">
          {liberado
            ? "O botão está liberado. A exclusão não pode ser desfeita."
            : "O botão de confirmar só é liberado depois que a palavra estiver digitada corretamente."}
        </p>
      </DialogContent>
    </Dialog>
  );
}
