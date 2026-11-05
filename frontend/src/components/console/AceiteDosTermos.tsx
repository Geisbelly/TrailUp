import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { aceitarTermosDoProfessor, lerMeuAceite } from "@/lib/aceiteDoProfessor";

/**
 * Pede o aceite a quem não tem prova gravada: quem se cadastrou antes de 20261105_27, quem teve o aceite revogado
 * e quem entra numa versão nova. Se a leitura falhar, não pede: banco fora do ar não pode travar o console.
 */
export function AceiteDosTermos({ onSair }: { onSair: () => void }) {
  const [pedir, setPedir] = useState(false);
  const [gravando, setGravando] = useState(false);

  useEffect(() => {
    let ativo = true;
    lerMeuAceite()
      .then((aceite) => {
        if (ativo && aceite && !aceite.vigente) setPedir(true);
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, []);

  const aceitar = async () => {
    setGravando(true);
    try {
      await aceitarTermosDoProfessor("console");
      setPedir(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar o aceite.");
    } finally {
      setGravando(false);
    }
  };

  return (
    <AlertDialog open={pedir}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Termos do TrailUp para professores</AlertDialogTitle>
          <AlertDialogDescription>
            Para seguir usando o console, leia os{" "}
            <a href="/termos" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              termos de uso
            </a>{" "}
            e a{" "}
            <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              política de privacidade
            </a>{" "}
            e confirme que aceita. Guardamos a data e a versão aceita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button type="button" variant="outline" disabled={gravando} onClick={onSair}>
            Sair
          </Button>
          <Button type="button" disabled={gravando} onClick={() => void aceitar()}>
            {gravando ? "Registrando…" : "Li e aceito"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
