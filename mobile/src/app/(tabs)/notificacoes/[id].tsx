import { OrnamentDivider } from "@/components/HallTheme";
import { LoadingState } from "@/components/LoadingState";
import { useDialog } from "@/context/DialogContext";
import { useNotifications } from "@/context/NotificacaoContext";
import { useUsuario } from "@/context/SessaoContext";
import { useLoading } from "@/context/LoadingContext";
import { Notificacao } from "@/models/Notificacoes";
import { FontFamily } from "@/styles/GlobalStyle";
import { formatAbsoluteFrom, formatSmartTime } from "@/utils/Formatacoes";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import tinycolor from "tinycolor2";

export default function NotificacaoDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { itens, deletar } = useNotifications();
  const { showConfirm, showDialog } = useDialog();
  const { usuario } = useUsuario();
  const { setLoading: setGlobalLoading } = useLoading();
  const palette = React.useMemo(
    () => getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfis]
  );

  const gold = tinycolor(palette.accent).lighten(10).toHexString();
  const goldDim = tinycolor(palette.accent).setAlpha(0.5).toRgbString();
  const goldFaint = tinycolor(palette.accent).setAlpha(0.1).toRgbString();

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

  if (loading) {
    return (
      <View style={[s.outer, { backgroundColor: palette.background }]}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          <LoadingState title="Carregando notificação" message="Buscando detalhes..." />
        </SafeAreaView>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[s.outer, { backgroundColor: palette.background }]}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          <View style={s.notFound}>
            <Ionicons name="mail-unread-outline" size={48} color={palette.textMuted} />
            <Text style={[s.notFoundTitle, { color: palette.text }]}>Nada por aqui</Text>
            <Text style={[s.notFoundSub, { color: palette.textMuted }]}>
              Esta notificação não foi encontrada.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[s.outer, { backgroundColor: palette.background }]}>
      {/* Gradiente candelabro */}
      <LinearGradient
        colors={[
          tinycolor(palette.accent).setAlpha(0.2).toRgbString(),
          "transparent",
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, { height: "40%" }]}
        pointerEvents="none"
      />

      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        {/* Card de cabeçalho */}
        <View
          style={[
            s.headerCard,
            {
              backgroundColor: tinycolor(palette.surfaceElevated).setAlpha(0.92).toRgbString(),
              borderColor: goldDim,
            },
          ]}
        >
          {/* Cantos ornamentais */}
          <View style={[s.corner, s.cornerTL, { borderColor: gold }]} />
          <View style={[s.corner, s.cornerTR, { borderColor: gold }]} />
          <View style={[s.corner, s.cornerBL, { borderColor: gold }]} />
          <View style={[s.corner, s.cornerBR, { borderColor: gold }]} />

          <Text style={[s.title, { color: isRead ? palette.textMuted : gold }]}>
            {item.titulo}
          </Text>

          {!!when && (
            <View style={s.timeWrap}>
              <View style={s.timeRow}>
                <Ionicons name="time-outline" size={14} color={goldDim} />
                <Text style={[s.timePrimary, { color: palette.text }]}>{timePrimary}</Text>
              </View>
              <Text style={[s.timeFull, { color: palette.textSubtle }]}>{timeFull}</Text>
            </View>
          )}
        </View>

        {/* Ornamento divisor */}
        <View style={s.ornamentRow}>
          <OrnamentDivider color={gold} />
        </View>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View
            style={[
              s.bodyCard,
              {
                backgroundColor: tinycolor(palette.surface).setAlpha(0.88).toRgbString(),
                borderColor: tinycolor(palette.border).setAlpha(0.4).toRgbString(),
              },
            ]}
          >
            <Text style={[s.body, { color: palette.text }]}>{item.corpo}</Text>
          </View>
        </ScrollView>

        {/* Footer de ações */}
        <View
          style={[
            s.footerBar,
            {
              backgroundColor: tinycolor(palette.background).setAlpha(0.95).toRgbString(),
              borderTopColor: goldDim,
            },
          ]}
        >
          {isRead ? (
            <Pressable
              style={[
                s.footerBtn,
                {
                  backgroundColor: goldFaint,
                  borderColor: goldDim,
                },
              ]}
              onPress={onMarkUnread}
            >
              <Ionicons name="mail-unread-outline" size={18} color={gold} />
              <Text style={[s.btnText, { color: gold }]}>Marcar como não lida</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[
              s.footerBtn,
              {
                backgroundColor: "rgba(127, 29, 29, 0.9)",
                borderColor: "rgba(248, 113, 113, 0.35)",
              },
            ]}
            onPress={onDelete}
          >
            <Ionicons name="trash" size={18} color="#fff" />
            <Text style={[s.btnText, { color: "#fff" }]}>Excluir</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const CORNER_SIZE = 14;
const CORNER_OFFSET = 8;

const s = StyleSheet.create({
  outer: {
    flex: 1,
  },
  headerCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  // Cantos ornamentais
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    top: CORNER_OFFSET,
    left: CORNER_OFFSET,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    opacity: 0.7,
  },
  cornerTR: {
    top: CORNER_OFFSET,
    right: CORNER_OFFSET,
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
    opacity: 0.7,
  },
  cornerBL: {
    bottom: CORNER_OFFSET,
    left: CORNER_OFFSET,
    borderBottomWidth: 1.5,
    borderLeftWidth: 1.5,
    opacity: 0.7,
  },
  cornerBR: {
    bottom: CORNER_OFFSET,
    right: CORNER_OFFSET,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
    opacity: 0.7,
  },
  title: {
    fontFamily: FontFamily.inikaBold,
    fontWeight: "700",
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: 0.2,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  timeWrap: { marginTop: 8, gap: 2 },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  timePrimary: {
    fontFamily: FontFamily.inikaBold,
    fontWeight: "700",
    fontSize: 13,
  },
  timeFull: { fontSize: 12, fontFamily: FontFamily.interMedium },
  ornamentRow: {
    paddingHorizontal: 16,
    marginTop: 4,
    opacity: 0.7,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 110,
  },
  bodyCard: {
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
  },
  body: {
    fontFamily: FontFamily.interMedium,
    fontSize: 16,
    lineHeight: 26,
    letterSpacing: 0.2,
  },
  footerBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
  },
  footerBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
  },
  btnText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 13,
  },
  notFound: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  notFoundTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 20,
  },
  notFoundSub: {
    textAlign: "center",
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
  },
});
