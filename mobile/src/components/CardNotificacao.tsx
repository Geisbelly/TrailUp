import { useUsuario } from "@/context/SessaoContext";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { formatSmartTime, TimeInput } from "@/utils/Formatacoes";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { useRouter } from "expo-router";
import * as React from "react";
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

const NotificationItem: React.FC<Props> = React.memo(
  ({
    id,
    title,
    description = "",
    time,
    read = false,
    href,
    onPress,
    testID = "notification-item",
    relativeThresholdHours,
  }) => {
    const router = useRouter();
    const { usuario } = useUsuario();
    const palette = React.useMemo(
      () => getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null),
      [usuario?.perfis],
    );

    const handlePress = React.useCallback(() => {
      if (onPress) return onPress();
      const target = href ?? (id ? `/notificacoes/${id}` : undefined);
      if (target) router.push(target as never);
    }, [href, id, onPress, router]);

    const formattedTime = React.useMemo(
      () => formatSmartTime(time, { thresholdHours: relativeThresholdHours }),
      [time, relativeThresholdHours],
    );

    return (
      <Pressable
        onPress={handlePress}
        android_ripple={{
          color: "rgba(228, 161, 161, 0.05)",
          foreground: true,
        }}
        accessibilityRole="button"
        accessibilityLabel={`${read ? "Lido" : "Não lido"}: ${title}`}
        accessibilityHint="Abrir detalhes da notificação"
        style={({ pressed }) => [
          styles.container,
          {
            backgroundColor: read
              ? palette.accentMuted
              : palette.surfaceElevated,
            borderColor: read ? palette.border : palette.borderStrong,
          },
          pressed && styles.pressed,
        ]}
        testID={testID}
      >
        <View style={styles.row}>
          <View
            style={[
              styles.statusDot,
              read
                ? {
                    borderColor: Color.colorWhite20,
                    backgroundColor: "transparent",
                  }
                : {
                    backgroundColor: Color.colorWhite,
                    borderColor: Color.colorWhite,
                  },
            ]}
          />
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[
              styles.title,
              { color: read ? palette.textSubtle : palette.text },
            ]}
          >
            {title}
          </Text>
          <Text
            style={[
              styles.time,
              { color: read ? palette.textSubtle : palette.textMuted },
            ]}
            numberOfLines={1}
          >
            {formattedTime}
          </Text>
        </View>

        {description ? (
          <Text
            numberOfLines={2}
            ellipsizeMode="tail"
            style={[
              styles.description,
              { color: read ? palette.textSubtle : palette.textMuted },
            ]}
          >
            {description}
          </Text>
        ) : null}
      </Pressable>
    );
  },
);

NotificationItem.displayName = "NotificationItem";

const styles = StyleSheet.create({
  container: {
    alignSelf: "stretch",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
  },
  pressed: { opacity: 0.92 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    alignSelf: "center",
    borderWidth: 2,
  },
  title: {
    flex: 1,
    fontFamily: FontFamily.inikaBold,
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: -0.24,
  },
  description: {
    marginTop: 4,
    fontFamily: FontFamily.inikaBold,
    fontWeight: "400",
    fontSize: 13,
    lineHeight: 18,
  },
  time: {
    textAlign: "right",
    minWidth: 64,
    fontFamily: FontFamily.inikaBold,
    fontWeight: "700",
    fontSize: 13,
  },
});

export default NotificationItem;
