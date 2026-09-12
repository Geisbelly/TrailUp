import { StoreLauncher } from "@/components/loja/StoreLauncher";
import { StoreModal } from "@/components/loja/StoreModal";
import { useUsuario } from "@/context/SessaoContext";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { carregarSocial, aceitarConvite, recusarConvite, enviarConvite, bloquear, desfazerAmizade } from "@/services/social/socialService";
import type { SocialPerson } from "@/services/social/socialModel";
import { SocialPersonCard } from "@/components/social/SocialPersonCard";
import { SocialInviteCard } from "@/components/social/SocialInviteCard";

type Section = "friends" | "invites" | "discover";
export default function SocialScreen() {
  const { usuario } = useUsuario();
  const profile = usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome ?? null;
  const palette = getProfileShellPalette(profile);
  const [section, setSection] = useState<Section>("friends");
  const [social, setSocial] = useState<Awaited<ReturnType<typeof carregarSocial>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storeVisible, setStoreVisible] = useState(false);

  const load = useCallback(async () => { setLoading(true); setError(null); try { setSocial(await carregarSocial()); } catch { setError("Não foi possível carregar o Social."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const people = useMemo(() => section === "friends" ? social?.friends ?? [] : section === "invites" ? [...(social?.incoming ?? []), ...(social?.outgoing ?? [])] : social?.candidates ?? [], [section, social]);

  async function act(key: string, operation: () => Promise<unknown>) { setBusy(key); try { await operation(); await load(); } catch { setError("A ação não pôde ser concluída."); } finally { setBusy(null); } }
  function actionFor(person: SocialPerson) {
    if (person.status === "candidate") return { label: "Convidar", fn: () => act(person.alunoId, () => enviarConvite(person.alunoId)) };
    if (person.status === "friend") return { label: "Desfazer", fn: () => act(person.alunoId, () => desfazerAmizade(person.relationshipId!)) };
    if (person.status === "outgoing") return { label: "Enviado", fn: undefined };
    return { label: "Bloquear", fn: () => act(person.alunoId, () => bloquear(person.alunoId)) };
  }

  return <View style={[s.screen, { backgroundColor: palette.background }]}><ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={loading && social !== null} onRefresh={() => void load()} tintColor={palette.accent} />}><View style={s.header}><View style={s.titleRow}><View><Text style={[s.title, { color: palette.text }]}>SOCIAL</Text><Text style={[s.subtitle, { color: palette.textSubtle }]}>Sua rede de jornada</Text></View><StoreLauncher color={palette.accent} onPress={() => setStoreVisible(true)} /></View><View style={s.tabs}>{(["friends", "invites", "discover"] as Section[]).map((key) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: section === key }} onPress={() => setSection(key)} style={[s.tab, section === key && { borderBottomColor: palette.accent }]}><Text style={[s.tabText, section === key && { color: palette.accent }]}>{key === "friends" ? "AMIGOS" : key === "invites" ? "CONVITES" : "ENCONTRAR"}</Text></Pressable>)}</View></View>{loading && !social ? <ActivityIndicator color={palette.accent} style={s.loader} /> : error ? <View style={s.empty}><Text style={s.message}>{error}</Text><Pressable onPress={() => void load()} style={[s.retry, { backgroundColor: palette.accent }]}><Text style={s.retryText}>Tentar novamente</Text></Pressable></View> : people.length === 0 ? <View style={s.empty}><MaterialCommunityIcons name={section === "friends" ? "account-group-outline" : "account-search-outline"} size={44} color={palette.accent} /><Text style={s.message}>{section === "friends" ? "Você ainda não tem amigos na jornada." : section === "invites" ? "Nenhum convite por enquanto." : "Nenhum colega disponível para convidar."}</Text></View> : people.map((person) => { if (person.status === "incoming") return <SocialInviteCard key={person.relationshipId} person={person} accent={palette.accent} onAccept={() => act(person.alunoId, () => aceitarConvite(person.relationshipId!))} onDecline={() => act(person.alunoId, () => recusarConvite(person.relationshipId!))} />; const action = actionFor(person); return <SocialPersonCard key={person.alunoId} person={person} accent={palette.accent} actionLabel={busy === person.alunoId ? "..." : action.label} onAction={action.fn} secondaryLabel={person.status === "friend" ? "Bloquear" : undefined} onSecondary={() => act(person.alunoId, () => bloquear(person.alunoId))} />; })}</ScrollView>{usuario?.id ? <StoreModal visible={storeVisible} alunoId={usuario.id} profileName={profile} onClose={() => setStoreVisible(false)} /> : null}</View>;
}
const s = StyleSheet.create({ screen: { flex: 1 }, content: { padding: 18, paddingBottom: 120 }, header: { marginBottom: 18 }, titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, title: { fontSize: 23, fontWeight: "900", letterSpacing: 2 }, subtitle: { marginTop: 3, fontSize: 12 }, tabs: { flexDirection: "row", marginTop: 22, borderBottomWidth: 1, borderBottomColor: "rgba(242,247,250,.16)" }, tab: { flex: 1, alignItems: "center", paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: "transparent" }, tabText: { color: "rgba(242,247,250,.6)", fontSize: 11, fontWeight: "800" }, loader: { marginTop: 70 }, empty: { alignItems: "center", gap: 12, paddingTop: 70 }, message: { color: "rgba(242,247,250,.72)", textAlign: "center", maxWidth: 280 }, retry: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }, retryText: { color: "#fff", fontWeight: "800" } });
