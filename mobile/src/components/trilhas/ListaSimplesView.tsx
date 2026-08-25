import { useUsuario } from "@/context/SessaoContext";
import { useTrilha } from "@/context/TrilhaContext";
import { Color, FontFamily, FontSize } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import tinycolor from "tinycolor2";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import {
  FlatList,
  Image,
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
};

export const TrilhaLinearList: React.FC = () => {
  const { grafo } = useTrilha();
  const { usuario } = useUsuario();
  const palette = getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null);
  const { width: winW } = useWindowDimensions();

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
      })),
    [grafo.nodes],
  );

  const keyExtractor = useCallback((r: Row) => r.id, []);

  return (
    <View
      style={[
        s.screen,
        {
          width: winW,

          backgroundColor: palette.background,
        },
      ]}
    >
      <FlatList
        contentContainerStyle={s.listContent}
        data={data}
        keyExtractor={keyExtractor}
        renderItem={({ item }) => <ItemCard row={item} palette={palette} />}
        showsVerticalScrollIndicator={false}
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
  palette,
}: {
  row: Row;
  palette: ReturnType<typeof getProfileShellPalette>;
}) => {
  const router = useRouter();
  const disabled = row.estado === "bloqueado";
  const gold = tinycolor(palette.accent).lighten(10).toHexString();
  const goldDim = tinycolor(palette.accent).setAlpha(0.5).toRgbString();

  // base da paleta sem verde
  const bg =
    row.estado === "concluido"
      ? palette.surface
      : row.estado === "bloqueado"
        ? Color.colorDarkslategray // cinza-azulado fechado
        : palette.surfaceElevated;

  const border =
    row.estado === "concluido"
      ? gold
      : row.estado === "bloqueado"
        ? "#3b3e55"
        : goldDim;

  // tons do hex
  const hexFill =
    row.estado === "concluido"
      ? palette.accentStrong
      : row.estado === "bloqueado"
        ? "#292c44"
        : palette.accent;

  const hexStroke =
    row.estado === "concluido"
      ? gold
      : row.estado === "bloqueado"
        ? "#3b435e"
        : gold;

  const statusText =
    row.estado === "concluido"
      ? "Concluído"
      : row.estado === "bloqueado"
        ? "Bloqueado"
        : "Disponível";

  const onPress = useCallback(() => {
    if (disabled) return;
    router.push({ pathname: "/(tabs)/trilha/[id]", params: { id: row.id } });
  }, [router, row.id, disabled]);

  const FallbackIcon = () => {
    if (row.estado === "bloqueado")
      return <MaterialCommunityIcons name="lock" size={18} color="#e8f5ff" />;
    if (row.estado === "concluido")
      return (
        <MaterialCommunityIcons name="check-bold" size={18} color="#e8f5ff" />
      );
    return <MaterialCommunityIcons name="gift" size={18} color="#e8f5ff" />;
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={disabled ? undefined : { color: Color.colorAliceblue200 }}
      style={({ pressed }) => [
        s.card,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
          shadowColor: row.estado === "disponivel" ? gold : "#000",
          shadowOpacity: row.estado === "disponivel" ? 0.28 : 0.18,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
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
            <Image
              source={{ uri: row.icon }}
              style={s.iconImg}
              resizeMode="contain"
            />
          ) : row.icon ? (
            <MaterialCommunityIcons
              name={row.icon as any}
              size={18}
              color="#e8f5ff"
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
        <Text numberOfLines={1} style={[s.title, { color: palette.text }]}>
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

      {!disabled && (
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
    height: "109%",
    backgroundColor: Color.background,
  },
  listContent: {
    padding: 12,
    paddingBottom: 20,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    marginVertical: 6,
    borderWidth: 2,
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
    fontSize: FontSize.fs_20,
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
    borderRadius: 999,
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
