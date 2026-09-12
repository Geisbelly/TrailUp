import { HallBackground, OrnamentDivider } from "@/components/HallTheme";
import { SocialInviteCard } from "@/components/social/SocialInviteCard";
import { SocialPersonCard } from "@/components/social/SocialPersonCard";
import { StoreLauncher } from "@/components/loja/StoreLauncher";
import { StoreModal } from "@/components/loja/StoreModal";
import { useUsuario } from "@/context/SessaoContext";
import { useTrilha } from "@/context/TrilhaContext";
import { aceitarConvite, bloquear, carregarSocial, desfazerAmizade, enviarConvite, recusarConvite } from "@/services/social/socialService";
import type { SocialPerson } from "@/services/social/socialModel";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

type Section = "friends" | "invites" | "discover";

function errorMessage(error: unknown) {
  const text = String((error as { message?: unknown })?.message ?? error ?? "").toLowerCase();
  if (text.includes("social_listar_pessoas") || (text.includes("function") && text.includes("does not exist"))) {
    return "O Social ainda não foi ativado neste ambiente. A migração do banco precisa ser aplicada.";
  }
  return "Não foi possível carregar o Social.";
}

export default function SocialScreen() {
  const { usuario } = useUsuario();
  const { classeAtual } = useTrilha();
  const classeId = Number(classeAtual?.classe_id ?? 0);
  const profile = usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome ?? null;
  const palette = getProfileShellPalette(profile);
  const [section, setSection] = useState<Section>("friends");
  const [social, setSocial] = useState<Awaited<ReturnType<typeof carregarSocial>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storeVisible, setStoreVisible] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setSocial(await carregarSocial()); }
    catch (caught) { console.warn("[Social] Falha ao carregar:", caught); setError(errorMessage(caught)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const people = useMemo(() => {
    if (!social) return [];
    return section === "friends" ? social.friends : section === "invites" ? [...social.incoming, ...social.outgoing] : social.candidates;
  }, [section, social]);

  async function act(key: string, operation: () => Promise<unknown>) {
    setBusy(key); setError(null);
    try { await operation(); await load(); }
    catch (caught) { console.warn("[Social] Falha na ação:", caught); setError(errorMessage(caught)); }
    finally { setBusy(null); }
  }

  function actionFor(person: SocialPerson) {
    if (person.status === "candidate") return { label: "Convidar", fn: () => act(person.alunoId, () => enviarConvite(person.alunoId)) };
    if (person.status === "friend") return { label: "Desfazer", fn: () => act(person.alunoId, () => desfazerAmizade(person.relationshipId!)) };
    if (person.status === "outgoing") return { label: "Enviado", fn: undefined };
    return { label: "Bloquear", fn: () => act(person.alunoId, () => bloquear(person.alunoId)) };
  }

  const emptyMessage = section === "friends" ? "Você ainda não tem amigos na jornada." : section === "invites" ? "Nenhum convite por enquanto." : "Nenhum colega disponível para convidar.";

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <HallBackground palette={palette} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={loading && social !== null} onRefresh={() => void load()} tintColor={palette.accent} />}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View><Text style={[styles.kicker, { color: palette.accent }]}>COMUNIDADE</Text><Text style={styles.title}>SOCIAL</Text><Text style={[styles.subtitle, { color: palette.textSubtle }]}>Sua rede de jornada</Text></View>
              <StoreLauncher color={palette.accent} onPress={() => setStoreVisible(true)} />
            </View>
            <OrnamentDivider color={palette.accent} />
            <View style={styles.tabs}>{(["friends", "invites", "discover"] as Section[]).map((key) => { const active = section === key; const label = key === "friends" ? "AMIGOS" : key === "invites" ? "CONVITES" : "ENCONTRAR"; return <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setSection(key)} style={[styles.tab, active && { borderBottomColor: palette.accent }]}><Text style={[styles.tabText, active && { color: palette.accent }]}>{label}</Text></Pressable>; })}</View>
          </View>
          {loading && !social ? <ActivityIndicator color={palette.accent} style={styles.loader} /> : error ? <View style={styles.empty}><MaterialCommunityIcons name="database-alert-outline" size={42} color={palette.accent} /><Text style={[styles.message, { color: palette.textMuted }]}>{error}</Text><Pressable onPress={() => void load()} style={[styles.retry, { backgroundColor: palette.accent }]}><Text style={styles.retryText}>Tentar novamente</Text></Pressable></View> : people.length === 0 ? <View style={styles.empty}><MaterialCommunityIcons name={section === "friends" ? "account-group-outline" : "account-search-outline"} size={44} color={palette.accent} /><Text style={[styles.sectionTitle, { color: palette.text }]}>{section === "friends" ? "AMIGOS" : section === "invites" ? "CONVITES" : "ENCONTRAR"}</Text><Text style={[styles.message, { color: palette.textMuted }]}>{emptyMessage}</Text></View> : <View style={styles.list}>{people.map((person) => person.status === "incoming" ? <SocialInviteCard key={person.relationshipId} person={person} accent={palette.accent} onAccept={() => act(person.alunoId, () => aceitarConvite(person.relationshipId!))} onDecline={() => act(person.alunoId, () => recusarConvite(person.relationshipId!))} /> : <SocialPersonCard key={person.relationshipId ?? person.alunoId} person={person} accent={palette.accent} actionLabel={busy === person.alunoId ? "..." : actionFor(person).label} onAction={actionFor(person).fn} secondaryLabel={person.status === "friend" ? "Bloquear" : undefined} onSecondary={() => act(person.alunoId, () => bloquear(person.alunoId))} />)}</View>}
        </ScrollView>
      </SafeAreaView>
      {usuario?.id && classeId > 0 ? <StoreModal visible={storeVisible} alunoId={usuario.id} classeId={classeId} profileName={profile} onClose={() => setStoreVisible(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, safeArea: { flex: 1 }, content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 120 }, header: { marginBottom: 18 }, titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, kicker: { fontFamily: FontFamily.inikaBold, fontSize: 11, letterSpacing: 2 }, title: { color: Color.colorWhite, fontFamily: FontFamily.poppinsExtraBold, fontSize: 30, letterSpacing: 2 }, subtitle: { fontFamily: FontFamily.interMedium, fontSize: 14, marginTop: 2 }, tabs: { flexDirection: "row", marginTop: 18, borderBottomWidth: 1, borderBottomColor: Color.colorWhite20 }, tab: { flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" }, tabText: { color: Color.colorWhite70, fontFamily: FontFamily.inikaBold, fontSize: 11, letterSpacing: 0.4 }, loader: { marginTop: 80 }, list: { gap: 4 }, empty: { alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 70 }, sectionTitle: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 15, letterSpacing: 1 }, message: { fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 310 }, retry: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10, marginTop: 4 }, retryText: { color: Color.colorWhite, fontFamily: FontFamily.poppinsExtraBold, fontSize: 13 },
});
