import { FramedProfileImage } from "@/components/FramedProfileImage";
import {
  getBrainHexConfig,
  normalizeBrainHexProfile,
} from "@/constants/profileImages";
import type { SocialPerson } from "@/services/social/socialModel";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { FontFamily } from "@/styles/GlobalStyle";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { buildProfileShellPaletteFromAccent, getProfileShellPalette } from "@/utils/profileShellTheme";
import { useState } from "react";
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
  /** Só na web em tela larga: "Desafiar" o amigo para um duelo 1x1 na Arena (#508). */
  onDesafiar?: () => void;
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
  onDesafiar,
}: Props) {
  const canChat = person.status === "friend" || person.status === "candidate";
  const profile = normalizeBrainHexProfile(person.perfilAtivo);
  const palette = buildProfileShellPaletteFromAccent(accent);
  // Web em tela larga (#346, protótipo v4 06-social): cartão compacto; as ações que
  // desfazem ou bloqueiam ficam no menu "…", não à mostra.
  const desktop = useDesktopWeb();
  const [menuAberto, setMenuAberto] = useState(false);
  const nome = person.apelido || person.nome;

  if (desktop) {
    const amigo = person.status === "friend";
    return (
      <View style={[s.card, s.cardLargo, { borderColor: palette.border, backgroundColor: palette.surface }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Abrir perfil de ${nome}`}
          onPress={onPressProfile}
          style={s.identity}
        >
          <View>
            {person.fotoUrl || profile ? (
              <FramedProfileImage profile={profile} source={person.fotoUrl ? { uri: person.fotoUrl } : undefined} size={40} />
            ) : (
              <View style={[s.avatar, s.avatarLargo, { borderColor: accent }]}>
                <MaterialCommunityIcons name="account-outline" size={20} color="#ffffff" />
              </View>
            )}
            <View
              accessibilityLabel={person.online ? "Online" : "Offline"}
              style={[s.pontoOnline, { borderColor: palette.surface, backgroundColor: person.online ? "#62db9b" : "#90949d" }]}
            />
          </View>
          <View style={s.info}>
            <Text numberOfLines={1} style={[s.name, s.nameLargo]}>{nome}</Text>
            <Text numberOfLines={1} style={[s.guild, s.subLargo]}>
              {person.guildaNome ?? (profile ? getBrainHexConfig(profile).label : person.online ? "Online" : "Offline")}
            </Text>
          </View>
        </Pressable>

        {amigo ? (
          <View style={s.linhaAcoes}>
            {canChat ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Conversar com ${nome}`}
                onPress={onPressChat ?? onPressProfile}
                style={[s.botaoRedondo, { borderColor: palette.borderStrong }]}
              >
                <MaterialCommunityIcons name="message-text-outline" size={16} color={palette.text} />
              </Pressable>
            ) : null}
            {onDesafiar && !menuAberto ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Desafiar ${nome} para um duelo`}
                onPress={onDesafiar}
                style={[s.pilulaMenu, s.pilulaDesafio, { borderColor: palette.borderStrong }]}
              >
                <MaterialCommunityIcons name="sword-cross" size={14} color={palette.text} />
                <Text style={[s.actionText, { color: palette.text }]}>Desafiar</Text>
              </Pressable>
            ) : null}
            <View style={s.espaco} />
            {menuAberto ? (
              <>
                {secondaryLabel && onSecondary ? (
                  <Pressable accessibilityRole="button" onPress={onSecondary} style={[s.pilulaMenu, { borderColor: palette.border }]}>
                    <Text style={[s.secondaryText, { color: palette.textMuted }]}>{secondaryLabel}</Text>
                  </Pressable>
                ) : null}
                {actionLabel ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={!onAction || actionLabel === "..."}
                    onPress={onAction}
                    style={[s.pilulaMenu, { borderColor: accent }]}
                  >
                    <Text style={[s.actionText, { color: accent }]}>{actionLabel}</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={menuAberto ? "Fechar mais ações" : `Mais ações para ${nome}`}
              accessibilityState={{ expanded: menuAberto }}
              onPress={() => setMenuAberto((aberto) => !aberto)}
              style={[s.botaoRedondo, { borderColor: palette.borderStrong }]}
            >
              <MaterialCommunityIcons name={menuAberto ? "close" : "dots-horizontal"} size={16} color={palette.text} />
            </Pressable>
          </View>
        ) : actionLabel ? (
          <Pressable
            accessibilityRole="button"
            disabled={!onAction || actionLabel === "..."}
            accessibilityState={{ disabled: !onAction || actionLabel === "..." }}
            onPress={onAction}
            style={[s.botaoCheio, { backgroundColor: onAction ? accent : palette.surfaceElevated }]}
          >
            <Text style={[s.actionText, { color: onAction ? palette.background : palette.textMuted }]}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

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
  cardLargo: { padding: 12, gap: 10 },
  avatarLargo: { width: 40, height: 40, borderRadius: 20 },
  pontoOnline: { position: "absolute", right: -1, bottom: -1, width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  nameLargo: { fontFamily: FontFamily.interMedium, fontSize: 14.5, fontWeight: "700", lineHeight: 20 },
  subLargo: { marginTop: 1, fontSize: 12 },
  linhaAcoes: { flexDirection: "row", alignItems: "center", gap: 8 },
  espaco: { flex: 1 },
  botaoRedondo: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pilulaMenu: { minHeight: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  pilulaDesafio: { flexDirection: "row", alignItems: "center", gap: 6 },
  botaoCheio: { minHeight: 36, borderRadius: 999, alignItems: "center", justifyContent: "center" },
});
