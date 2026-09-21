import { FramedProfileImage } from "@/components/FramedProfileImage";
import {
  getBrainHexConfig,
  normalizeBrainHexProfile,
} from "@/constants/profileImages";
import type { SocialPerson } from "@/services/social/socialModel";
import { FontFamily } from "@/styles/GlobalStyle";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { buildProfileShellPaletteFromAccent, getProfileShellPalette } from "@/utils/profileShellTheme";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  person: SocialPerson;
  accent: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onPressProfile?: () => void;
  onPressChat?: () => void;
};
export function SocialPersonCard({
  person,
  accent,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  onPressProfile,
  onPressChat,
}: Props) {
  const canChat = person.status === "friend" || person.status === "candidate";
  const profile = normalizeBrainHexProfile(person.perfilAtivo);
  const palette = buildProfileShellPaletteFromAccent(accent);
  return (
    <View style={[s.card, { borderColor: palette.border, backgroundColor: palette.surface }]}>
      <View style={s.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Abrir perfil de ${person.apelido || person.nome}`}
          onPress={onPressProfile}
          style={s.identity}
        >
          {person.fotoUrl || profile ? (
            <FramedProfileImage
              profile={profile}
              source={person.fotoUrl ? { uri: person.fotoUrl } : undefined}
              size={56}
            />
          ) : (
            <View style={[s.avatar, { borderColor: accent }]}>
              <MaterialCommunityIcons
                name="account-outline"
                size={28}
                color="#ffffff"
              />
            </View>
          )}
          <View style={s.info}>
            <Text style={s.name}>{person.apelido || person.nome}</Text>
            <Text style={[s.profile, { color: profile ? getProfileShellPalette(profile).accent : palette.textMuted }]}>
              {profile ? getBrainHexConfig(profile).label : "Aluno"}
            </Text>
            {person.guildaNome ? (
              <Text style={s.guild}>{person.guildaNome}</Text>
            ) : null}
          </View>
        </Pressable>
        {canChat ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Conversar com ${person.apelido || person.nome}`}
            onPress={onPressChat ?? onPressProfile}
            style={[s.chat, { borderColor: `${accent}70` }]}
          >
            <MaterialCommunityIcons
              name="message-text-outline"
              size={20}
              color="#ffffff"
            />
          </Pressable>
        ) : null}
      </View>
      <View style={s.actions}>
        <View style={s.presence}>
          <View
            style={[
              s.dot,
              { backgroundColor: person.online ? "#62db9b" : "#90949d" },
            ]}
          />
          <Text style={s.presenceText}>
            {person.online ? "Online" : "Offline"}
          </Text>
        </View>
        {secondaryLabel && onSecondary ? (
          <Pressable
            accessibilityRole="button"
            onPress={onSecondary}
            style={s.secondary}
          >
            <Text style={s.secondaryText}>{secondaryLabel}</Text>
          </Pressable>
        ) : null}
        {actionLabel ? (
          <Pressable
            accessibilityRole="button"
            disabled={!onAction || actionLabel === "..."}
            accessibilityState={{
              disabled: !onAction || actionLabel === "...",
            }}
            onPress={onAction}
            style={[s.action, { borderColor: accent }]}
          >
            <Text style={[s.actionText, { color: accent }]}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { padding: 14, borderWidth: 1, borderRadius: 12 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  identity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  avatar: {
    width: 56,
    height: 56,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1, minWidth: 0 },
  name: {
    color: "#f7f7fa",
    fontFamily: FontFamily.inikaBold,
    fontSize: 18,
    lineHeight: 24,
  },
  profile: { fontSize: 12, marginTop: 4 },
  guild: { color: "#d2d4df", fontSize: 11, marginTop: 4 },
  chat: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  presence: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginRight: "auto",
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  presenceText: { color: "#d2d4df", fontSize: 12 },
  action: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: "center",
  },
  actionText: { fontSize: 12, fontWeight: "700" },
  secondary: { minHeight: 44, paddingHorizontal: 4, justifyContent: "center" },
  secondaryText: { color: "#d2d4df", fontSize: 12 },
});
