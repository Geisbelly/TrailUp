import { useTrilha } from "@/context/TrilhaContext";
import { LockedNodeModal } from "@/components/trilhas/LockedNodeModal";
import { ProfileArtwork } from "@/components/ProfileArtwork";
import { Color, FontFamily, FontSize } from "@/styles/GlobalStyle";
import { Design } from "@/styles/design";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsFocused } from '@react-navigation/native';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Polygon } from "react-native-svg";

type Row = {
  id: string;
  titulo: string;
  estado: "concluido" | "bloqueado" | "disponivel";
  seq: number;
  icon?: string | null;
  resumo?: string | null;
  badgeLabel?: string | null;
  prerequisiteTitles: string[];
};

export const TrilhaLinearList: React.FC<{
  currentTopicId: string | null;
  tourTargetRef?: React.RefObject<View | null>;
}> = ({ currentTopicId, tourTargetRef }) => {
  const { grafo, perfil } = useTrilha();
  const palette = getProfileShellPalette(perfil);
  const { width: winW } = useWindowDimensions();
  const [lockedRow, setLockedRow] = useState<Row | null>(null);
  const list = useRef<FlatList<Row>>(null);
  const focused = useIsFocused();
  const [ready, setReady] = useState(false);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);

  const data: Row[] = useMemo(
    () =>
      grafo.nodes.map((n) => ({
        id: n.id,
        titulo: n.titulo,
        estado: n.completed
          ? "concluido"
          : n.locked
            ? "bloqueado"
            : "disponivel",
        seq: n.sequence,
        icon: (n as any).icon ?? null,
        resumo: (n as any).resumo ?? null,
        badgeLabel: (n as any).badgeLabel ?? null,
        prerequisiteTitles: grafo.edges
          .filter((edge) => String(edge.to) === String(n.id))
          .map((edge) => grafo.nodes.find((parent) => String(parent.id) === String(edge.from))?.titulo)
          .filter((title): title is string => Boolean(title)),
      })),
    [grafo.edges, grafo.nodes],
  );

  const keyExtractor = useCallback((r: Row) => r.id, []);
  const currentIndex = data.findIndex((row) => String(row.id) === currentTopicId);
  useEffect(() => {
    if (!focused || !ready || currentIndex < 0) return;
    attempts.current = 0;
    const frame = requestAnimationFrame(() => list.current?.scrollToIndex({ index: currentIndex, viewPosition: 0.5, animated: false }));
    return () => { cancelAnimationFrame(frame); if (retry.current) clearTimeout(retry.current); };
  }, [currentIndex, currentTopicId, focused, ready]);

  return (
    <View
      style={[
        s.screen,
        {
          width: winW,

          backgroundColor: "transparent",
        },
      ]}
    >
      <FlatList
        ref={list}
        onLayout={() => setReady(true)}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          if (!focused || attempts.current++ >= 5) return;
          list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
          retry.current = setTimeout(() => list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false }), 120);
        }}
        contentContainerStyle={s.listContent}
        data={data}
        keyExtractor={keyExtractor}
        renderItem={({ item, index }) => (
          <ItemCard
            row={item}
            current={String(item.id) === currentTopicId}
            palette={palette}
            targetRef={index === 0 ? tourTargetRef : undefined}
            onLockedPress={() => setLockedRow(item)}
          />
        )}
        showsVerticalScrollIndicator={false}
      />
      <LockedNodeModal
        visible={lockedRow !== null}
        nodeTitle={lockedRow?.titulo ?? "Conteúdo"}
        prerequisiteTitles={lockedRow?.prerequisiteTitles}
        profile={perfil}
        onClose={() => setLockedRow(null)}
      />
    </View>
  );
};

/* ==== Item ==== */

const HEX_SIZE = 26;
const hexPoints = (cx: number, cy: number, r: number) => {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
  }
  return pts.join(" ");
};

const ItemCard = ({
  row,
  current,
  palette,
  targetRef,
  onLockedPress,
}: {
  row: Row;
  current: boolean;
  palette: ReturnType<typeof getProfileShellPalette>;
  targetRef?: React.RefObject<View | null>;
  onLockedPress: () => void;
}) => {
  const router = useRouter();
  const disabled = row.estado === "bloqueado";
  const iconColor = disabled ? palette.textMuted : palette.background;
  const gold = palette.accent;
  const goldDim = palette.borderStrong;

  // base da paleta sem verde
  const bg =
    row.estado === "concluido"
      ? palette.surface
      : row.estado === "bloqueado"
        ? palette.surface
        : palette.surfaceElevated;

  const border =
    row.estado === "concluido"
      ? gold
      : row.estado === "bloqueado"
        ? palette.border
        : goldDim;

  // tons do hex
  const hexFill =
    row.estado === "concluido"
      ? palette.accentStrong
      : row.estado === "bloqueado"
        ? palette.surface
        : palette.accent;

  const hexStroke =
    row.estado === "concluido"
      ? gold
      : row.estado === "bloqueado"
        ? palette.border
        : gold;

  const statusText = current ? "Você parou aqui · Continuar" :
    row.estado === "concluido"
      ? "Concluído"
      : row.estado === "bloqueado"
        ? "Bloqueado"
        : "Disponível";

  const onPress = useCallback(() => {
    if (disabled) {
      onLockedPress();
      return;
    }
    router.push({ pathname: "/(tabs)/trilha/[id]", params: { id: row.id } });
  }, [router, row.id, disabled, onLockedPress]);

  const FallbackIcon = () => {
    if (row.estado === "bloqueado")
      return <MaterialCommunityIcons name="lock" size={18} color={iconColor} />;
    if (row.estado === "concluido")
      return (
        <MaterialCommunityIcons name="check-bold" size={18} color={iconColor} />
      );
    return <MaterialCommunityIcons name="gift" size={18} color={iconColor} />;
  };

  return (
    <Pressable
      ref={targetRef}
      collapsable={false}
      onPress={onPress}
      android_ripple={{ color: Color.colorAliceblue200 }}
      style={({ pressed }) => [
        s.card,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: pressed ? 0.85 : 1,
          borderLeftColor: disabled ? palette.border : palette.accent,
        },
      ]}
      accessibilityRole="button"
      accessibilityHint={disabled ? "Toque para saber como desbloquear" : "Abre o conteúdo"}
      accessibilityLabel={
        disabled ? `${row.titulo} bloqueado` : `Abrir ${row.titulo}`
      }
      testID={`trilha-item-${row.id}`}
    >
      {/* Hex com ícone */}
      <View style={s.hexWrap}>
        <Svg width={HEX_SIZE * 2} height={HEX_SIZE * 2}>
          <Polygon
            points={hexPoints(HEX_SIZE, HEX_SIZE, HEX_SIZE - 2)}
            fill={hexFill}
            stroke={hexStroke}
            strokeWidth={2.5}
          />
        </Svg>
        <View style={s.hexIcon}>
          {row.icon?.startsWith?.("http") ? (
            <ProfileArtwork
              source={{ uri: row.icon }}
              profile={palette.profile}
              width={30}
            />
          ) : row.icon ? (
            <MaterialCommunityIcons
              name={row.icon as any}
              size={18}
              color={iconColor}
            />
          ) : (
            <FallbackIcon />
          )}
        </View>
      </View>

      {/* texto */}
      <View style={{ flex: 1, minWidth: 0 }}>
        {row.badgeLabel ? (
          <View
            style={[
              s.badge,
              {
                backgroundColor: palette.accentSoft,
                borderColor: palette.border,
              },
            ]}
          >
            <Text style={[s.badgeText, { color: palette.accent }]}>
              {row.badgeLabel}
            </Text>
          </View>
        ) : null}
        <Text style={[s.title, { color: palette.text }]}>
          {row.titulo}
        </Text>
        <Text style={[s.sub, { color: palette.textSubtle }]}>{statusText}</Text>
        {row.resumo ? (
          <Text
            numberOfLines={2}
            style={[s.summary, { color: palette.textMuted }]}
          >
            {row.resumo}
          </Text>
        ) : null}
      </View>

      {disabled ? (
        <MaterialCommunityIcons name="lock-outline" size={21} color={palette.textMuted} />
      ) : (
        <MaterialCommunityIcons
          name="chevron-right"
          size={22}
          color={palette.textMuted}
        />
      )}
    </Pressable>
  );
};

/* ==== estilos ==== */

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Color.background,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: Design.radius,
    marginVertical: 6,
    borderWidth: 1,
    borderLeftWidth: 3,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  hexWrap: {
    width: HEX_SIZE * 2,
    height: HEX_SIZE * 2,
    justifyContent: "center",
    alignItems: "center",
  },
  hexIcon: {
    position: "absolute",
    width: HEX_SIZE * 1.2,
    height: HEX_SIZE * 1.2,
    justifyContent: "center",
    alignItems: "center",
  },
  iconImg: { width: "100%", height: "100%" },
  title: {
    color: Color.colorAliceblue,
    fontFamily: FontFamily.inikaBold,
    fontSize: FontSize.fs_18,
    lineHeight: 24,
  },
  sub: {
    color: Color.colorSlategray,
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    marginTop: 3,
  },
  summary: {
    marginTop: 5,
    color: Color.colorAliceblue300,
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  badge: {
    alignSelf: "flex-start",
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    backgroundColor: "rgba(164, 141, 255, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(164, 141, 255, 0.35)",
  },
  badgeText: {
    color: Color.colorBlueviolet100,
    fontFamily: FontFamily.inikaBold,
    fontSize: 10,
  },
});
