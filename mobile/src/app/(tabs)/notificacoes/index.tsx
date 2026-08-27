import NotificationItem from "@/components/CardNotificacao";
import CardSemDados from "@/components/CardSemDados";
import { OrnamentDivider } from "@/components/HallTheme";
import {
  SectionGuideButton,
  SectionGuideScrollable,
  SectionGuideStep,
} from "@/components/SectionGuideButton";
import { useNotifications } from "@/context/NotificacaoContext";
import { useUsuario } from "@/context/SessaoContext";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { getProfileGuideEmphasis } from "@/utils/profileSectionGuide";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useRef } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

type FilterTab = "todas" | "nao_lidas" | "lidas";

export default function PerfilHome() {
  const { itens, marcarLida, deletar, reload, carregando } = useNotifications();

  // Entregue ao guia: sem isso ele descreve itens que ficaram fora da tela.
  const listaRef = useRef<FlatList>(null);
  const { usuario } = useUsuario();
  const insets = useSafeAreaInsets();
  const palette = React.useMemo(
    () => getProfileShellPalette(usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfilAtivo, usuario?.perfis],
  );
  const profileEmphasis = getProfileGuideEmphasis(
    usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome,
    "notifications",
  );

  const [tab, setTab] = React.useState<FilterTab>("todas");
  const notificationsHeaderGuideRef = React.useRef<View | null>(null);
  const notificationsFiltersGuideRef = React.useRef<View | null>(null);
  const notificationsListGuideRef = React.useRef<View | null>(null);
  const notificationsGuideSteps = React.useMemo<SectionGuideStep[]>(
    () => [
      {
        id: "notifications-header",
        target: "notifications_header",
        title: "Central de notificações",
        description:
          `Aqui ficam avisos da plataforma, atualizações acadêmicas e eventos importantes. ${profileEmphasis}`,
        icon: "bell-outline",
      },
      {
        id: "notifications-filters",
        target: "notifications_filters",
        title: "Filtros de leitura",
        description:
          "Alterne entre todas, não lidas e lidas para encontrar rapidamente o que ainda precisa da sua atenção.",
        icon: "filter-variant",
      },
      {
        id: "notifications-list",
        target: "notifications_list",
        title: "Lista de avisos",
        description:
          "Toque em um aviso para abrir a página interna, onde o guia explica status, horário, conteúdo e ações. Na lista, arraste para a direita para marcar como lida ou para a esquerda para excluir.",
        icon: "gesture-swipe-horizontal",
      },
      {
        id: "notifications-refresh",
        target: "notifications_list",
        title: "Atualizar a caixa",
        description:
          "Puxe a lista para baixo para buscar novas notificações e sincronizar alterações de leitura ou exclusão.",
        icon: "refresh",
      },
    ],
    [profileEmphasis],
  );
  const notificationsGuideTargets = React.useMemo(
    () => ({
      notifications_header: notificationsHeaderGuideRef,
      notifications_filters: notificationsFiltersGuideRef,
      notifications_list: notificationsListGuideRef,
    }),
    [],
  );

  const handlePress = async (id: string, read?: boolean, status?: string) => {
    const isRead = read ?? status === "lida";
    if (!isRead) {
      try {
        await marcarLida(Number(id));
      } catch (e) {
        console.warn("Falha ao marcar como lida:", e);
      }
    }
    router.push(`/notificacoes/${id}`);
  };

  const data = React.useMemo(() => {
    if (tab === "todas") return itens;
    if (tab === "lidas")
      return itens.filter((n: any) => n.read ?? n.status === "lida");
    return itens.filter((n: any) => !(n.read ?? n.status === "lida"));
  }, [itens, tab]);

  const onRefresh = React.useCallback(() => reload(), [reload]);

  const LeftActions = React.useCallback(
    ({ item }: { item: any }) => {
      const isRead = item.read ?? item.status === "lida";
      return (
        <Pressable
          onPress={async () => {
            if (!isRead) await marcarLida(Number(item.id));
          }}
          style={[
            styles.swipeAction,
            {
              backgroundColor: palette.surfaceElevated,
              borderRightWidth: 1,
              borderRightColor: palette.border,
              opacity: isRead ? 0.5 : 1,
            },
          ]}
        >
          <Ionicons name="checkmark-done" size={20} color={palette.accent} />
          <Text style={[styles.swipeText, { color: palette.text }]}>
            {isRead ? "Lida" : "Marcar lida"}
          </Text>
        </Pressable>
      );
    },
    [
      marcarLida,
      palette.accent,
      palette.border,
      palette.surfaceElevated,
      palette.text,
    ],
  );

  const RightActions = React.useCallback(
    ({ item }: { item: any }) => (
      <Pressable
        onPress={async () => {
          try {
            await deletar(Number(item.id));
          } catch (e) {
            console.warn("Falha ao excluir:", e);
          }
        }}
        style={[
          styles.swipeAction,
          {
            backgroundColor: "rgba(127, 29, 29, 0.9)",
            borderLeftWidth: 1,
            borderLeftColor: "rgba(248, 113, 113, 0.35)",
          },
        ]}
      >
        <Ionicons name="trash" size={20} color={Color.colorWhite} />
        <Text style={styles.swipeText}>Excluir</Text>
      </Pressable>
    ),
    [deletar],
  );

  const renderRow = ({ item }: { item: any }) => (
    <Swipeable
      renderLeftActions={() => <LeftActions item={item} />}
      renderRightActions={() => <RightActions item={item} />}
      overshootLeft={false}
      overshootRight={false}
    >
      <NotificationItem
        id={String(item.id)}
        title={item.titulo}
        time={String(item.horario_envio)}
        description={item.corpo}
        read={item.read ?? item.status === "lida"}
        onPress={() =>
          handlePress(String(item.id), item.read, (item as any).status)
        }
        relativeThresholdHours={24}
      />
    </Swipeable>
  );

  return (
    <View style={[styles.screenOuter, { backgroundColor: palette.background }]}>
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <StatusBar style="light" translucent backgroundColor="transparent" />

        <View
          ref={notificationsHeaderGuideRef}
          collapsable={false}
          style={[styles.header, { borderBottomColor: palette.border }]}
        >
          <Text style={[styles.headerTitle, { color: Color.colorWhite }]}>
            Notificações
          </Text>
          <SectionGuideButton
            profile={usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome}
            sectionTitle="Notificações"
            steps={notificationsGuideSteps}
            targetRefs={notificationsGuideTargets}
            scrollRef={listaRef as unknown as React.RefObject<SectionGuideScrollable | null>}
          style={styles.guideButton}
          />
        </View>

        <View
          ref={notificationsFiltersGuideRef}
          collapsable={false}
          style={[styles.filters, { borderBottomColor: palette.border }]}
        >
          <FilterPill
            label="Todas"
            active={tab === "todas"}
            palette={palette}
            onPress={() => setTab("todas")}
          />
          <FilterPill
            label="Não lidas"
            active={tab === "nao_lidas"}
            palette={palette}
            onPress={() => setTab("nao_lidas")}
          />
          <FilterPill
            label="Lidas"
            active={tab === "lidas"}
            palette={palette}
            onPress={() => setTab("lidas")}
          />
        </View>

        {/* Ornamento divisor */}
        <View style={styles.ornamentRow}>
          <OrnamentDivider color={Color.colorWhite70} />
        </View>

        <View
          ref={notificationsListGuideRef}
          collapsable={false}
          style={styles.listWrap}
        >
          <FlatList
            ref={listaRef}
          data={data}
          keyExtractor={(n) => String(n.id)}
          style={{ flex: 1, alignSelf: "stretch" }}
          renderItem={renderRow}
          ItemSeparatorComponent={() => (
            <View
              style={[styles.separator, { backgroundColor: palette.border }]}
            />
          )}
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: Math.max(insets.bottom, 12),
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              tintColor={palette.accent}
              colors={[palette.accent]}
              refreshing={!!carregando}
              onRefresh={onRefresh}
            />
          }
          ListEmptyComponent={
            <CardSemDados
              title="Sem notificações"
              description="Você ainda não tem notificações por aqui."
              accentColor={palette.accent}
            />
          }
          ListFooterComponent={
            data.length > 0 ? (
              <View style={styles.footer}>
                <OrnamentDivider color={Color.colorWhite70} />
                <Text
                  style={[styles.footerText, { color: Color.colorWhite70 }]}
                >
                  Essas foram todas as notificações
                </Text>
              </View>
            ) : null
          }
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

function FilterPill({
  label,
  active,
  palette,
  onPress,
}: {
  label: string;
  active?: boolean;
  palette: ReturnType<typeof getProfileShellPalette>;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        active
          ? {
              backgroundColor: palette.accent,
              borderColor: palette.accent,
            }
          : {
              backgroundColor: palette.accentMuted,
              borderColor: palette.border,
            },
      ]}
    >
      <Text
        style={[
          active
            ? [styles.pillTextActive, { color: Color.colorWhite }]
            : [styles.pillTextInactive, { color: palette.textMuted }],
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenOuter: {
    flex: 1,
    backgroundColor: Color.background,
  },
  screen: {
    flex: 1,
  },
  header: {
    minHeight: 62,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: FontFamily.inikaBold,
    letterSpacing: 2,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  guideButton: {
    position: "absolute",
    right: 16,
  },
  listWrap: {
    flex: 1,
    alignSelf: "stretch",
  },
  ornamentRow: {
    paddingHorizontal: 16,
    opacity: 0.7,
  },
  filters: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillTextActive: {
    fontWeight: "700",
  },
  pillTextInactive: {
    fontWeight: "600",
  },
  separator: {
    height: 1.5,
  },
  swipeAction: {
    justifyContent: "center",
    alignItems: "center",
    width: 100,
  },
  swipeText: {
    marginTop: 4,
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    alignItems: "center",
    gap: 10,
  },
  footerSeparator: {
    width: "100%",
    height: 1,
  },
  footerText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
