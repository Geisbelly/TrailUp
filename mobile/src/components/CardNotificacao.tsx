import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import { formatSmartTime, type TimeInput } from "@/utils/Formatacoes";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

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
    usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome,
  );
  const open = () => {
    if (onPress) return onPress();
    const target = href ?? (id ? `/notificacoes/${id}` : undefined);
    if (target) router.push(target as never);
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${read ? "Lida" : "Não lida"}: ${title}`}
      onPress={open}
      testID={testID}
      style={({ pressed }) => [
        s.row,
        {
          backgroundColor: read ? palette.background : palette.surface,
          borderLeftColor: read ? "transparent" : palette.accent,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View
        style={[
          s.icon,
          {
            borderColor: palette.border,
            backgroundColor: palette.surfaceElevated,
          },
        ]}
      >
        <MaterialCommunityIcons
          name={read ? "email-open-outline" : "email-outline"}
          size={21}
          color="#ffffff"
        />
      </View>
      <View style={s.content}>
        <View style={s.meta}>
          <Text
            style={[
              s.state,
              { color: read ? palette.textSubtle : palette.accent },
            ]}
          >
            {read ? "LIDA" : "NOVA"}
          </Text>
          <Text style={[s.time, { color: palette.textMuted }]}>
            {formatSmartTime(time, { thresholdHours: relativeThresholdHours })}
          </Text>
        </View>
        <Text numberOfLines={2} style={[s.title, { color: palette.text }]}>
          {title}
        </Text>
        {description ? (
          <Text
            numberOfLines={2}
            style={[s.description, { color: palette.textMuted }]}
          >
            {description}
          </Text>
        ) : null}
      </View>
      <MaterialCommunityIcons
        name="chevron-right"
        size={18}
        color={palette.textSubtle}
      />
    </Pressable>
  );
});

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 12,
    borderLeftWidth: 3,
  },
  icon: {
    width: 40,
    height: 44,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { flex: 1, minWidth: 0 },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 5,
  },
  state: { fontSize: 9, fontWeight: "700" },
  time: { fontSize: 11 },
  title: { fontFamily: FontFamily.inikaBold, fontSize: 17, lineHeight: 23 },
  description: { fontSize: 13, lineHeight: 19, marginTop: 5 },
});
export default NotificationItem;
