import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useCallback } from "react";
import { Linking } from "react-native";

import { useDialog } from "@/context/DialogContext";
import { useUsuario } from "@/context/SessaoContext";
import { buildFirstAccessTourStorageKey } from "@/utils/firstAccessTour";

/**
 * Ações das Configurações que não abrem tela: sair, rever o tutorial e abrir
 * um link externo. Usadas pela lista do app e pelas Configurações da web em
 * tela larga (#346).
 */
export function useAcoesConta() {
  const { showDialog } = useDialog();
  const { usuario, sair } = useUsuario();

  const sairDoAparelho = useCallback(async () => {
    // `sair()` derruba o estado de sessao mesmo quando o Supabase nao responde.
    // Antes daqui saia um `supabase.auth.signOut()` cru, e a tela dependia do
    // evento `SIGNED_OUT` para a guarda de rota liberar a saida -- evento que
    // nao vem quando o POST /logout falha ou o refresh token ja venceu. O
    // `router.replace` ate rodava, e a guarda devolvia o aluno para as abas.
    const { remotoOk } = await sair();
    router.replace("/(auth)/login");

    if (!remotoOk) {
      // A sessao deste aparelho ja caiu; o que pode ter sobrado e o token vivo
      // no servidor, valido nos outros aparelhos do aluno.
      showDialog({
        title: "Você saiu deste aparelho",
        description:
          "Não deu para avisar o servidor, então a sua sessão pode continuar aberta em outros aparelhos.",
        tone: "warning",
      });
    }
  }, [sair, showDialog]);

  const abrirLink = useCallback(
    (url: string, fallbackMsg: string) => {
      Linking.openURL(url).catch(() =>
        showDialog({
          title: "Aviso",
          description: fallbackMsg,
          tone: "warning",
        }),
      );
    },
    [showDialog],
  );

  /**
   * Apaga a marca de "tutorial concluido" deste aluno.
   *
   * A conclusao vive numa chave do AsyncStorage que inclui a versao do
   * roteiro; a alternativa seria subir `FIRST_ACCESS_TOUR_VERSION` a cada
   * teste, o que reapresentaria o tutorial para TODOS os alunos e exigiria um
   * deploy por rodada de teste.
   */
  const reverTutorial = useCallback(async () => {
    if (!usuario?.id) return;
    try {
      await AsyncStorage.removeItem(buildFirstAccessTourStorageKey(usuario.id));
      showDialog({
        title: "Tutorial reiniciado",
        description:
          "Ele aparece de novo na proxima vez que voce abrir a Trilha.",
        tone: "success",
      });
    } catch {
      showDialog({
        title: "Aviso",
        description: "Nao foi possivel reiniciar o tutorial agora.",
        tone: "warning",
      });
    }
  }, [showDialog, usuario?.id]);

  return { sairDoAparelho, abrirLink, reverTutorial };
}
