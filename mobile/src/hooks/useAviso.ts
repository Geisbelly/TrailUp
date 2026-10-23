import { useCallback } from "react";
import { Alert, Platform } from "react-native";

import { useDialog } from "@/context/DialogContext";

/**
 * Aviso e confirmação que aparecem nas DUAS plataformas.
 *
 * No `react-native-web` o `Alert` é, literalmente:
 *
 *     class Alert { static alert() {} }
 *
 * Chamar não faz nada e **não levanta** — então todo `Alert.alert` é invisível
 * na web: o aluno aciona o controle, nada acontece, e nem a mensagem de erro
 * aparece. Era o caso do relatório (#28): o `catch` avisava por `Alert.alert`,
 * ou seja, a falha era engolida duas vezes.
 *
 * O diálogo do app (`DialogProvider`, montado em `src/app/_layout.tsx`)
 * funciona em qualquer plataforma e largura e já usa a paleta do perfil
 * BrainHex do aluno. Duas telas (`perfil/info.tsx`, `bag/BagModal.tsx`) já
 * faziam esse desvio à mão, mas decidindo por **largura de tela**
 * (`desktop`/`embutido`) — então na web em janela estreita continuavam caindo
 * no `Alert` que não faz nada. A decisão é de PLATAFORMA, não de largura.
 *
 * No nativo o caminho continua sendo o `Alert` do sistema, idêntico ao de
 * antes: a correção é só para a web, e tela do app que já funcionava não muda.
 *
 * As duas funções são memoizadas porque entram em `useCallback`/`useEffect` de
 * quem chama. `showDialog`/`showConfirm` já são estáveis (o `DialogContext` os
 * envolve em `useCallback` e memoiza o value), então estas também podem ser.
 */
export function useAviso() {
  const { showDialog, showConfirm } = useDialog();
  const naWeb = Platform.OS === "web";

  /** Mensagem de mão única ("deu erro", "pronto"). */
  const avisar = useCallback(
    (
      titulo: string,
      texto?: string,
      tone: "info" | "success" | "warning" | "error" = "info"
    ) => {
      if (naWeb) showDialog({ title: titulo, description: texto, tone });
      else Alert.alert(titulo, texto);
    },
    [naWeb, showDialog]
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
      if (naWeb) {
        showConfirm({
          title: titulo,
          description: texto,
          confirmLabel: rotuloConfirmar,
          cancelLabel: rotuloCancelar,
          confirmVariant: destrutivo ? "danger" : "primary",
          tone: destrutivo ? "warning" : "info",
          onConfirm: onConfirmar,
        });
        return;
      }
      Alert.alert(titulo, texto, [
        { text: rotuloCancelar, style: "cancel" },
        {
          text: rotuloConfirmar,
          style: destrutivo ? "destructive" : "default",
          onPress: () => void onConfirmar(),
        },
      ]);
    },
    [naWeb, showConfirm]
  );

  return { avisar, confirmar };
}
