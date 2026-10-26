import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { plural } from "./conta";
import { APAGADO_COM_AS_TURMAS, FICA_COM_OS_ALUNOS, SAI_DA_CONTA } from "./exclusaoConta";
import type { ContaEmNumeros } from "./useContaEmNumeros";

const PALAVRA = "EXCLUIR";

/** Modal de exclusão de conta: diz que as turmas são apagadas para sempre (com quantas turmas e alunos), o que fica, e só libera o botão com a palavra exata. */
export function ExcluirContaDialog({
  aberto,
  numeros,
  onFechar,
  onConfirmar,
  ocupado = false,
}: {
  aberto: boolean;
  numeros: ContaEmNumeros | null;
  onFechar: () => void;
  onConfirmar: () => void;
  ocupado?: boolean;
}) {
  const [digitado, setDigitado] = useState("");
  useEffect(() => {
    if (!aberto) setDigitado("");
  }, [aberto]);
  const liberado = digitado === PALAVRA;

  const turmas = numeros ? plural(numeros.turmas, "turma", "turmas") : "suas turmas";
  const alunos = numeros ? plural(numeros.alunos, "aluno", "alunos") : "todos os alunos";
  const listas = [
    { titulo: "Isto é apagado para sempre:", cor: "bg-destructive", itens: [...SAI_DA_CONTA, ...APAGADO_COM_AS_TURMAS(turmas, alunos)] },
    { titulo: "Isto fica:", cor: "bg-success", itens: FICA_COM_OS_ALUNOS },
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
          <DialogDescription className="pt-2 text-left text-[13.5px]">
            A exclusão não pode ser desfeita. As suas turmas são apagadas para sempre, com as trilhas, as matrículas e as notas
            dos alunos. Ninguém consegue recuperar depois.
          </DialogDescription>
        </DialogHeader>
        <p role="alert" className="rounded-[14px] border border-destructive/50 bg-destructive/10 px-3.5 py-3 text-[13px] font-semibold text-destructive">
          {numeros
            ? `Serão apagadas ${turmas}, com ${alunos} matriculados.`
            : "Todas as suas turmas serão apagadas, com os alunos matriculados nelas."}
        </p>
        {listas.map((l) => (
          <div key={l.titulo} className="space-y-2">
            <p className="text-[12.5px] font-semibold text-foreground">{l.titulo}</p>
            <ul className="space-y-2">
              {l.itens.map((t) => (
                <li key={t} className="flex items-center gap-2.5 rounded-[14px] bg-muted px-3.5 py-2.5 text-[12.5px] text-foreground">
                  <span aria-hidden="true" className={`h-[7px] w-[7px] flex-none rounded-full ${l.cor}`} />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        ))}
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
          <Button variant="outline" className="rounded-full" onClick={onFechar} disabled={ocupado}>
            Manter minha conta
          </Button>
          <Button variant="destructive" className="ml-auto rounded-full font-bold" disabled={!liberado || ocupado} onClick={onConfirmar}>
            {ocupado ? "Excluindo…" : "Excluir conta permanentemente"}
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
