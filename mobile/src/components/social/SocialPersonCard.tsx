import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { SocialPerson } from "@/services/social/socialModel";

type Props = { person: SocialPerson; accent: string; actionLabel?: string; onAction?: () => void; secondaryLabel?: string; onSecondary?: () => void };
export function SocialPersonCard({ person, accent, actionLabel, onAction, secondaryLabel, onSecondary }: Props) {
  return <View style={s.card}><View style={[s.avatar, { borderColor: accent }]}>{person.fotoUrl ? <Image source={{ uri: person.fotoUrl }} style={s.avatarImage} /> : <MaterialCommunityIcons name="account" size={26} color={accent} />}</View><View style={s.info}><Text style={s.name}>{person.apelido || person.nome}</Text><Text style={s.profile}>{person.perfilAtivo || "Perfil de jornada"}</Text></View>{secondaryLabel && onSecondary ? <Pressable accessibilityRole="button" onPress={onSecondary} style={s.secondary}><Text style={s.secondaryText}>{secondaryLabel}</Text></Pressable> : null}{actionLabel && onAction ? <Pressable accessibilityRole="button" onPress={onAction} style={[s.action, { backgroundColor: accent }]}><Text style={s.actionText}>{actionLabel}</Text></Pressable> : null}</View>;
}
const s = StyleSheet.create({ card: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, backgroundColor: "rgba(242,247,250,.08)", marginBottom: 8 }, avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: "center", justifyContent: "center", overflow: "hidden" }, avatarImage: { width: "100%", height: "100%" }, info: { flex: 1 }, name: { color: "#f2f7fa", fontSize: 15, fontWeight: "700" }, profile: { color: "rgba(242,247,250,.62)", fontSize: 11, marginTop: 3 }, action: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 }, actionText: { color: "#fff", fontSize: 11, fontWeight: "800" }, secondary: { padding: 6 }, secondaryText: { color: "rgba(242,247,250,.62)", fontSize: 10 } });

