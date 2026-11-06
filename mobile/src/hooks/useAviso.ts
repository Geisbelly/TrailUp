import { useCallback } from "react";

import { useDialog } from "@/context/DialogContext";

/**
 * Aviso e confirmação do app: sempre o diálogo com a paleta do perfil BrainHex do
 * aluno, nas duas plataformas. Nada de `Alert` do sistema: no aparelho ele é a
 * caixa crua do Android, e no `react-native-web` é `static alert() {}`, que não
 * faz nada e não levanta.
 *
 * As duas funções são memoizadas porque entram em `useCallback`/`useEffect` de
 * quem chama. `showDialog`/`showConfirm` já são estáveis.
 */
export function useAviso() {
  const { showDialog, showConfirm } = useDialog();

  /** Mensagem de mão única ("deu erro", "pronto"). */
  const avisar = useCallback(
    (
      titulo: string,
      texto?: string,
      tone: "info" | "success" | "warning" | "error" = "info"
    ) => {
      showDialog({ title: titulo, description: texto, tone });
    },
    [showDialog]
  );

  /** Pergunta com confirmar/cancelar. `destrutivo` pinta o botão de perigo. */
  const confirmar = useCallback(
    ({
      titulo,
      texto,
      rotuloConfirmar = "Confirmar",
      rotuloCancelar = "Cancelar",
      destrutivo = false,
      onConfirmar,
    }: {
      titulo: string;
      texto?: string;
      rotuloConfirmar?: string;
      rotuloCancelar?: string;
      destrutivo?: boolean;
      onConfirmar: () => void | Promise<void>;
    }) => {
      showConfirm({
        title: titulo,
        description: texto,
        confirmLabel: rotuloConfirmar,
        cancelLabel: rotuloCancelar,
        confirmVariant: destrutivo ? "danger" : "primary",
        tone: destrutivo ? "warning" : "info",
        onConfirm: onConfirmar,
      });
    },
    [showConfirm]
  );

  return { avisar, confirmar };
}
