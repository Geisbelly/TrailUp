import { useDialog } from "@/context/DialogContext";
import { useIA } from "@/context/IAContext";
import {
  devePerguntarSeEstaAi,
  estaNaTrilhaDeEstudo,
  OCIOSIDADE_PARA_PERGUNTAR_MS,
} from "@/utils/presencaDeEstudo";
import { router, useSegments } from "expo-router";
import React, { useCallback, useEffect, useRef } from "react";
import { AppState, StyleSheet, View } from "react-native";

/**
 * De quanto em quanto tempo a ociosidade é reavaliada.
 *
 * Um minuto, e não menos: o limiar é de minutos, então mais resolução só
 * acordaria a thread de JS com mais frequência -- o oposto do que este
 * componente sugere ao aluno.
 */
const INTERVALO_DE_CHECAGEM_MS = 60_000;

/**
 * Pergunta se o aluno continua no aparelho quando o app fica aberto e parado.
 *
 * É a contrapartida do conserto do cronômetro (ver `utils/presencaDeEstudo`).
 * Antes, quem avisava nessa situação era o "Tempo esgotado" do módulo, que
 * continuava correndo depois de o aluno sair da tela de estudo: a mensagem
 * falava de um tempo de estudo que não aconteceu e o mesmo evento entrava na
 * personalização como se o material tivesse estourado o prazo.
 *
 * O app aberto e parado é uma situação real -- só não é aquela. Então aqui ele
 * é tratado pelo que é: ninguém no aparelho. Em vez de anunciar um prazo, o
 * diálogo pergunta, e oferece as duas saídas honestas -- voltar para a trilha
 * ou desligar a tela e poupar bateria.
 *
 * A contagem de ociosidade é própria, e não vem da telemetria, por dois
 * motivos: a telemetria só acumula durante uma sessão de estudo (fora do
 * módulo não há lote aberto) e ela para de gravar quando o aluno recusa a
 * coleta. A cortesia de perguntar não deveria depender desse consentimento.
 */
export function VigiaDePresenca({ children }: { children: React.ReactNode }) {
  const { showDialog, dialogoAberto } = useDialog();
  const { emitSignal } = useIA();
  const segmentos = useSegments();

  const ultimaInteracaoRef = useRef(Date.now());
  const perguntadoEmRef = useRef<number | null>(null);
  // Lidos de dentro do intervalo, que é criado uma vez só.
  const estudandoRef = useRef(false);
  const dialogoAbertoRef = useRef(false);
  const showDialogRef = useRef(showDialog);
  const emitSignalRef = useRef(emitSignal);

  const marcarInteracao = useCallback(() => {
    ultimaInteracaoRef.current = Date.now();
  }, []);

  useEffect(() => {
    showDialogRef.current = showDialog;
    emitSignalRef.current = emitSignal;
    dialogoAbertoRef.current = dialogoAberto;
  }, [dialogoAberto, emitSignal, showDialog]);

  // Dependem de um booleano e de uma string, e não do array de `useSegments`:
  // se aquele array trocar de referência a cada render, o efeito rodaria sempre
  // e o relógio de ociosidade nunca chegaria ao limiar.
  const estudando = estaNaTrilhaDeEstudo(segmentos as readonly string[]);
  const rotaAtual = segmentos.join("/");

  useEffect(() => {
    estudandoRef.current = estudando;
  }, [estudando]);

  // Trocar de tela é interação: o aluno está no aparelho.
  useEffect(() => {
    marcarInteracao();
  }, [marcarInteracao, rotaAtual]);

  // Voltar ao app também é. Sem isto, sair e voltar depois de meia hora abriria
  // a pergunta no primeiro tique -- justamente quando o aluno acabou de chegar.
  useEffect(() => {
    const assinatura = AppState.addEventListener("change", (estado) => {
      if (estado === "active") marcarInteracao();
    });
    return () => assinatura.remove();
  }, [marcarInteracao]);

  useEffect(() => {
    const tique = setInterval(() => {
      const agoraMs = Date.now();
      const ocioso = agoraMs - ultimaInteracaoRef.current;

      const perguntar = devePerguntarSeEstaAi({
        agoraMs,
        ultimaInteracaoEmMs: ultimaInteracaoRef.current,
        appEmPrimeiroPlano: AppState.currentState === "active",
        estudando: estudandoRef.current,
        dialogoAberto: dialogoAbertoRef.current,
        perguntadoEmMs: perguntadoEmRef.current,
      });

      if (!perguntar) return;

      perguntadoEmRef.current = agoraMs;

      // A personalização passa a receber a informação certa: ficou ocioso com o
      // app aberto. Antes chegava `timer_timeout`, que descreve outra coisa.
      emitSignalRef.current({
        type: "idle_detected",
        meta: {
          ocioso_ms: ocioso,
          limiar_ms: OCIOSIDADE_PARA_PERGUNTAR_MS,
          origem: "app_aberto_sem_estudo",
        },
      });

      showDialogRef.current({
        title: "Você ainda está aí?",
        description:
          "O app está aberto há alguns minutos sem nenhum toque. Se quiser retomar, levamos você de volta para a sua trilha. Se for pausar agora, desligue a tela ou feche o app — a bateria dura bem mais assim.",
        tone: "info",
        actions: [
          {
            label: "Vou pausar",
            variant: "secondary",
            onPress: marcarInteracao,
          },
          {
            label: "Voltar a estudar",
            variant: "primary",
            onPress: () => {
              marcarInteracao();
              router.push("/(tabs)/trilha");
            },
          },
        ],
      });
    }, INTERVALO_DE_CHECAGEM_MS);

    return () => clearInterval(tique);
  }, [marcarInteracao]);

  return (
    // Observa o início de cada toque sem consumi-lo: devolver `false` recusa a
    // responsabilidade pelo gesto, então ele segue para os filhos como sempre.
    // Só o `start` basta -- todo arrasto ou rolagem começa com um toque.
    //
    // Superfícies nativas que engolem o toque (WebView, PDF, vídeo) não passam
    // por aqui. Nenhuma delas está fora do módulo hoje: o mapa da trilha é
    // `MapaViewStable`, feito de ScrollView e Pressable, e as outras vivem
    // dentro do conteúdo -- onde `estudando` já impede a pergunta.
    <View
      style={styles.host}
      onStartShouldSetResponderCapture={() => {
        marcarInteracao();
        return false;
      }}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
