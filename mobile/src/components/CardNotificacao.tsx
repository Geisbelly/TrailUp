import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import { formatSmartTime, type TimeInput } from "@/utils/Formatacoes";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { perfilVisualDoAluno } from "@/utils/brainHex";

type Props = {
  id?: string;
  title: string;
  description?: string;
  time: TimeInput;
  read?: boolean;
  href?: string;
  onPress?: () => void;
  testID?: string;
  relativeThresholdHours?: number;
};

const NotificationItem = memo(function NotificationItem({
  id,
  title,
  description = "",
  time,
  read = false,
  href,
  onPress,
  testID = "notification-item",
  relativeThresholdHours,
}: Props) {
  const router = useRouter();
  const { usuario } = useUsuario();
  const palette = getProfileShellPalette(
    perfilVisualDoAluno(usuario),
  );
  const open = () => {
    if (onPress) return onPress();
    const target = href ?? (id ? `/notificacoes/${id}` : undefined);
    if (target) router.push(target as never);
  };
  // Visual do protótipo (mobile-v1, 07-notificacoes.html: .item/.cab/.ic/.linha1/.nova/.desc).
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${read ? "Lida" : "Não lida"}: ${title}`}
      onPress={open}
      testID={testID}
      style={({ pressed }) => [s.row, { backgroundColor: palette.background, opacity: pressed ? 0.7 : 1 }]}
    >
      {read ? null : (
        <>
          <LinearGradient
            colors={[palette.accentMuted, palette.background]}
            locations={[0, 0.7]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}
          />
          <View style={[s.barra, { backgroundColor: palette.accent }]} />
        </>
      )}
      <View style={[s.icon, { backgroundColor: palette.surfaceElevated }]}>
        <MaterialCommunityIcons name={read ? "email-open-outline" : "email-outline"} size={19} color={palette.accent} />
      </View>
      <View style={s.content}>
        <View style={s.linha1}>
          <Text
            numberOfLines={2}
            style={[s.title, read ? { fontWeight: "600", color: palette.textMuted } : { color: palette.text }]}
          >
            {title}
          </Text>
          <Text style={[s.time, { color: palette.textSubtle }]}>
            {formatSmartTime(time, { thresholdHours: relativeThresholdHours })}
          </Text>
        </View>
        {read ? null : (
          <Text style={[s.nova, { backgroundColor: palette.accent, color: palette.background }]}>NOVA</Text>
        )}
        {description ? (
          <Text numberOfLines={2} style={[s.description, { color: palette.textSubtle }]}>
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: 72,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 16,
    paddingRight: 14,
    gap: 12,
    overflow: "hidden",
  },
  barra: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  content: { flex: 1, minWidth: 0 },
  linha1: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  title: { flex: 1, fontFamily: FontFamily.interMedium, fontSize: 14.5, fontWeight: "700", lineHeight: 19 },
  time: { fontFamily: FontFamily.interMedium, fontSize: 11.5 },
  nova: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
    fontFamily: FontFamily.interMedium,
    fontSize: 10,
    fontWeight: "800",
  },
  description: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 18, marginTop: 3 },
});
export default NotificationItem;
