import { LoadingState } from "@/components/LoadingState";
import { NotificacaoDetalheView, NotificacaoNaoEncontrada } from "@/components/NotificacaoDetalhe";
import {
  SectionGuideButton,
  SectionGuideStep,
} from "@/components/SectionGuideButton";
import { useDialog } from "@/context/DialogContext";
import { useNotifications } from "@/context/NotificacaoContext";
import { useUsuario } from "@/context/SessaoContext";
import { useLoading } from "@/context/LoadingContext";
import { Notificacao } from "@/models/Notificacoes";
import { podeSilenciar, silenciarTipo, TIPOS_SILENCIAVEIS } from "@/services/notificacoesDb";
import { formatAbsoluteFrom, formatSmartTime } from "@/utils/Formatacoes";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { getProfileGuideEmphasis } from "@/utils/profileSectionGuide";
import { Stack, router, useLocalSearchParams } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { perfilVisualDoAluno } from "@/utils/brainHex";

export default function NotificacaoDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { itens, deletar } = useNotifications();
  const { showConfirm, showDialog } = useDialog();
  const { usuario } = useUsuario();
  const { setLoading: setGlobalLoading } = useLoading();
  const palette = React.useMemo(
    () => getProfileShellPalette(perfilVisualDoAluno(usuario)),
    [usuario]
  );
  const activeProfile = perfilVisualDoAluno(usuario);
  const profileEmphasis = getProfileGuideEmphasis(activeProfile, "notifications");
  const headerGuideRef = React.useRef<View | null>(null);
  const bodyGuideRef = React.useRef<View | null>(null);
  const actionsGuideRef = React.useRef<View | null>(null);

  const fromCtx = itens.find((n) => n.id === Number(id)) || null;
  const [item, setItem] = React.useState<Notificacao | null>(fromCtx);
  const [loading, setLoading] = React.useState(!fromCtx);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      if (fromCtx) {
        setItem(fromCtx);
        setLoading(false);
        setGlobalLoading(false);
        return;
      }
      setLoading(true);
      setGlobalLoading(true);
      try {
        const fetched = await Notificacao.findById(Number(id));
        if (mounted) setItem(fetched);
      } catch (e) {
        console.warn("[Detalhe] erro buscando notificacao:", e);
      } finally {
        if (mounted) setLoading(false);
        setGlobalLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [fromCtx, id, setGlobalLoading]);

  const isRead = !!(item?.read ?? item?.status === "lida");
  const when = item?.horario_envio ?? item?.created_at ?? null;
  const timePrimary = React.useMemo(
    () => (when ? formatSmartTime(when, { thresholdHours: 24 }) : ""),
    [when]
  );
  const timeFull = React.useMemo(
    () => (when ? formatAbsoluteFrom(when) : ""),
    [when]
  );
  const detailGuideSteps = React.useMemo<SectionGuideStep[]>(
    () => [
      {
        id: "notification-detail-title",
        target: "notification_detail_header",
        title: "Título e estado",
        description: `O título identifica o assunto. Esta notificação está ${isRead ? "lida" : "não lida"}; o selo ao lado do ícone (Nova ou Lida) e a cor do título acompanham esse estado. ${profileEmphasis}`,
        icon: isRead ? "email-open-outline" : "email-alert-outline",
      },
      ...(when
        ? [{
            id: "notification-detail-time",
            target: "notification_detail_header",
            title: "Quando foi enviada",
            description:
              "A primeira linha usa um horário fácil de ler, como “há 1 h”. A segunda mantém a data e o horário completos para consulta precisa.",
            icon: "clock-outline" as const,
          }]
        : []),
      {
        id: "notification-detail-body",
        target: "notification_detail_body",
        title: "Conteúdo do aviso",
        description:
          "Este cartão contém a mensagem completa enviada pela plataforma. O conteúdo pode informar progresso, pausas, retorno à trilha, conquistas ou atualizações acadêmicas.",
        icon: "text-box-outline",
      },
      {
        id: "notification-detail-actions",
        target: "notification_detail_actions",
        title: "Ações disponíveis",
        description: isRead
          ? "Você pode marcar novamente como não lida para devolver o aviso ao filtro de pendentes, ou excluir definitivamente a notificação."
          : "Ao abrir, a notificação é registrada como lida. Você também pode excluí-la definitivamente pelo botão disponível.",
        icon: "gesture-tap-button",
      },
    ],
    [isRead, profileEmphasis, when],
  );
  const detailGuideTargets = React.useMemo(
    () => ({
      notification_detail_header: headerGuideRef,
      notification_detail_body: bodyGuideRef,
      notification_detail_actions: actionsGuideRef,
    }),
    [],
  );

  const onMarkUnread = React.useCallback(async () => {
    if (!item || !isRead) return;
    try {
      await item.updateRead();
      router.back();
    } catch {
      showDialog({
        title: "Erro",
        description: "Não foi possível alterar o status.",
        tone: "error",
      });
    }
  }, [isRead, item, showDialog]);

  const onDelete = React.useCallback(() => {
    if (!item) return;
    showConfirm({
      title: "Excluir notificação",
      description: "Tem certeza de que deseja excluir esta notificação?",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      confirmVariant: "danger",
      onConfirm: async () => {
        try {
          await deletar(item.id);
          router.back();
        } catch {
          showDialog({
            title: "Erro",
            description: "Não foi possível excluir.",
            tone: "error",
          });
        }
      },
    });
  }, [deletar, item, showConfirm, showDialog]);

  const tipoSilenciavel = podeSilenciar(item?.tipo) ? item?.tipo ?? null : null;
  const onSilenciar = React.useCallback(() => {
    if (!item || !tipoSilenciavel) return;
    showConfirm({
      title: "Silenciar este tipo de aviso?",
      description: `Você deixa de receber “${TIPOS_SILENCIAVEIS[tipoSilenciavel]}”. Dá para voltar a receber em Configurações › Modo foco e avisos.`,
      confirmLabel: "Silenciar",
      cancelLabel: "Cancelar",
      onConfirm: async () => {
        const r = await silenciarTipo({ tipo: tipoSilenciavel, silenciar: true, notificacaoId: item.id });
        showDialog(
          r
            ? { title: "Aviso silenciado", description: "Você não recebe mais avisos deste tipo.", tone: "success" }
            : { title: "Erro", description: "Não foi possível silenciar.", tone: "error" },
        );
      },
    });
  }, [item, showConfirm, showDialog, tipoSilenciavel]);

  if (loading) {
    return (
      <View style={[s.outer, { backgroundColor: palette.background }]}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          <LoadingState title="Carregando notificação" message="Buscando detalhes..." palette={palette} />
        </SafeAreaView>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[s.outer, { backgroundColor: palette.background }]}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          <NotificacaoNaoEncontrada perfil={activeProfile} />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[s.outer, { backgroundColor: palette.background }]}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        {/* Guia no cabecalho da tela: mesmo lugar em toda pagina com header,
            sem flutuar sobre o conteudo nem depender de offset por pagina. */}
        <Stack.Screen
          options={{
            headerRight: () => (
              <SectionGuideButton
                profile={activeProfile}
                sectionTitle="Notificação"
                steps={detailGuideSteps}
                targetRefs={detailGuideTargets}
                style={s.guideButton}
              />
            ),
          }}
        />
        <NotificacaoDetalheView
          perfil={activeProfile}
          titulo={item.titulo}
          corpo={item.corpo}
          tipo={item.tipo}
          lida={isRead}
          quando={timePrimary}
          quandoCompleto={timeFull}
          onMarcarNaoLida={onMarkUnread}
          onExcluir={onDelete}
          onSilenciar={tipoSilenciavel ? onSilenciar : undefined}
          cabecalhoRef={headerGuideRef}
          corpoRef={bodyGuideRef}
          acoesRef={actionsGuideRef}
        />
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  outer: {
    flex: 1,
  },
  guideButton: {
    marginRight: 12,
  },
});
