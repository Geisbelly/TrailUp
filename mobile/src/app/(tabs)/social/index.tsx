import { HallBackground } from "@/components/HallTheme";
import { JourneyHeading } from "@/components/JourneyHeading";
import { JourneySymbol } from "@/components/JourneySymbol";
import { SocialInviteCard } from "@/components/social/SocialInviteCard";
import { SocialPersonCard } from "@/components/social/SocialPersonCard";
import { SocialProfileModal } from "@/components/social/SocialProfileModal";
import { PrivateChatModal } from "@/components/social/PrivateChatModal";
import { GuildSection } from "@/components/social/GuildSection";
import type { GuildShareOption } from "@/components/social/GuildChatModal";
import { StoreLauncher } from "@/components/loja/StoreLauncher";
import { StoreModal } from "@/components/loja/StoreModal";
import { useUsuario } from "@/context/SessaoContext";
import { useTrilha } from "@/context/TrilhaContext";
import { Classe } from "@/models/Classe";
import { aceitarConvite, bloquear, carregarSocial, desbloquear, desfazerAmizade, enviarConvite, recusarConvite } from "@/services/social/socialService";
import { carregarGuildas } from "@/services/social/guildService";
import { peopleForSocialSection, type SocialPeopleSection, type SocialPerson } from "@/services/social/socialModel";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Section = SocialPeopleSection | "guilds";

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
  const [fallbackClasseId, setFallbackClasseId] = useState(0);
  const activeClasseId = classeId > 0 ? classeId : fallbackClasseId;
  const profile = usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome ?? null;
  const palette = getProfileShellPalette(profile);
  const [section, setSection] = useState<Section>("friends");
  const [search, setSearch] = useState("");
  const [social, setSocial] = useState<Awaited<ReturnType<typeof carregarSocial>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storeVisible, setStoreVisible] = useState(false);
  const [guilds, setGuilds] = useState<Awaited<ReturnType<typeof carregarGuildas>>>([]);
  const [selectedPerson, setSelectedPerson] = useState<SocialPerson | null>(null);
  const [chatPerson, setChatPerson] = useState<SocialPerson | null>(null);
  const shareOptions = useMemo<GuildShareOption[]>(() => {
    const topics = (classeAtual as any)?.topicos ?? [];
    const result: GuildShareOption[] = [];
    for (const topic of topics) {
      if (topic?.id && topic?.nome) result.push({ kind: "desafio", id: Number(topic.id), title: String(topic.nome) });
      for (const activity of topic?.atividades ?? []) {
        for (const question of activity?.questoes ?? []) {
          const activityStarted = Boolean(activity?.resposta_aluno || activity?.percentual_concluido > 0 || activity?.progresso > 0 || ["andamento", "em_andamento", "concluida", "concluído", "concluida"].includes(String(activity?.status ?? "").toLowerCase()));
          if (question?.id && question?.enunciado && (question?.resposta_aluno != null || activityStarted)) result.push({ kind: "questao", id: Number(question.id), title: String(question.enunciado) });
        }
      }
    }
    return result.slice(0, 30);
  }, [classeAtual]);

  useEffect(() => {
    if (classeId > 0 || !usuario?.id) return;
    let active = true;
    void Classe.listClasseIdsByAluno(usuario.id).then((ids) => {
      if (active && ids[0]) setFallbackClasseId(Number(ids[0]));
    }).catch((caught) => console.warn("[Social] Não foi possível resolver a turma:", caught));
    return () => { active = false; };
  }, [classeId, usuario?.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { const [nextSocial, nextGuilds] = await Promise.all([activeClasseId > 0 ? carregarSocial(activeClasseId) : carregarSocial(), carregarGuildas(activeClasseId)]); setSocial(nextSocial); setGuilds(nextGuilds); }
    catch (caught) { console.warn("[Social] Falha ao carregar:", caught); setError(errorMessage(caught)); }
    finally { setLoading(false); }
  }, [activeClasseId]);
  useEffect(() => { void load(); }, [load]);

  const people = useMemo(() => {
    if (!social || section === "guilds") return [];
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return peopleForSocialSection(social, section).filter((person) =>
      !query || `${person.nome} ${person.apelido ?? ""} ${person.guildaNome ?? ""}`.toLocaleLowerCase("pt-BR").includes(query),
    );
  }, [section, social, search]);

  const sections: { key: Section; label: string; count?: number }[] = [
    { key: "friends", label: "Amigos", count: social?.friends.length },
    { key: "invites", label: "Convites", count: social ? social.incoming.length + social.outgoing.length : undefined },
    { key: "discover", label: "Encontrar", count: social?.candidates.length },
    { key: "guilds", label: "Guildas", count: social ? guilds.length : undefined },
    { key: "blocked", label: "Bloqueados" },
  ];

  async function act(key: string, operation: () => Promise<unknown>): Promise<boolean> {
    setBusy(key); setError(null);
    try { await operation(); await load(); return true; }
    catch (caught) { console.warn("[Social] Falha na ação:", caught); setError(errorMessage(caught)); return false; }
    finally { setBusy(null); }
  }

  async function unblockAndOpenChat(person: SocialPerson) {
    if (!person.relationshipId) return;
    const succeeded = await act(person.alunoId, () => desbloquear(person.relationshipId!));
    if (succeeded) setChatPerson({ ...person, status: "candidate" });
  }

  function actionFor(person: SocialPerson) {
    if (person.status === "blocked") return { label: "Desbloquear", fn: () => void unblockAndOpenChat(person) };
    if (person.status === "candidate") return { label: "Convidar", fn: () => act(person.alunoId, () => enviarConvite(person.alunoId)) };
    if (person.status === "friend") return { label: "Desfazer", fn: () => act(person.alunoId, () => desfazerAmizade(person.relationshipId!)) };
    if (person.status === "outgoing") return { label: "Enviado", fn: undefined };
    return { label: "Bloquear", fn: () => act(person.alunoId, () => bloquear(person.alunoId)) };
  }

  const emptyMessage = section === "friends" ? "Você ainda não tem amigos na jornada." : section === "invites" ? "Nenhum convite por enquanto." : section === "discover" ? "Nenhum colega disponível para convidar." : "Você não bloqueou ninguém.";

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <HallBackground palette={palette} />
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={loading && social !== null} onRefresh={() => void load()} tintColor={palette.accent} />}>
          <View style={styles.header}>
            <View style={{ marginHorizontal: -20 }}>
              <JourneyHeading title="Social" eyebrow="CONEXÕES DA JORNADA" section="social" palette={palette} right={<StoreLauncher color={Color.colorWhite} onPress={() => setStoreVisible(true)} />} />
            </View>
            <Text style={[styles.subtitle, { color: palette.textMuted }]}>Encontre sua turma e avance em companhia.</Text>
            <View style={styles.tabs}>
              {sections.map(({ key, label, count }) => {
                const active = section === key;
                return (
                  <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => { setSection(key); setSearch(""); }}
                    style={[styles.tab, { borderColor: active ? palette.accent : palette.border, backgroundColor: active ? palette.surfaceElevated : palette.surface }]}>
                    <Text style={[styles.tabText, { color: active ? palette.text : palette.textMuted }]}>{label}</Text>
                    {count !== undefined ? <Text style={[styles.count, { color: palette.text }]}>{count}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
            {section !== "guilds" ? <View style={[styles.search, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <MaterialCommunityIcons name="magnify" size={22} color={Color.colorWhite} />
              <TextInput value={search} onChangeText={setSearch} accessibilityLabel="Buscar pessoas" placeholder="Buscar por nome ou guilda" placeholderTextColor={palette.textMuted} style={[styles.searchInput, { color: palette.text }]} />
              {search ? <Pressable onPress={() => setSearch("")} accessibilityRole="button" accessibilityLabel="Limpar busca" style={styles.clearSearch}><MaterialCommunityIcons name="close" size={20} color={Color.colorWhite} /></Pressable> : null}
            </View> : null}
          </View>
          {loading && !social ? <ActivityIndicator color={palette.accent} style={styles.loader} /> : error ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="alert-circle-outline" size={42} color={Color.colorWhite} />
              <Text style={[styles.message, { color: palette.textMuted }]}>{error}</Text>
              <Pressable onPress={() => void load()} style={[styles.retry, { backgroundColor: palette.accent }]}><Text style={[styles.retryText, { color: palette.background }]}>Tentar novamente</Text></Pressable>
            </View>
          ) : section === "guilds" ? (
            <GuildSection guilds={guilds} people={social ? [...social.friends, ...social.incoming, ...social.outgoing, ...social.candidates] : []} classeId={activeClasseId} accent={palette.accent} profile={profile} shareOptions={shareOptions} onReload={load} />
          ) : people.length === 0 ? (
            <View style={styles.empty}>
              <JourneySymbol section="social" profile={profile} size={64} />
              <Text style={[styles.sectionTitle, { color: palette.text }]}>{search.trim() ? "Nenhuma pessoa encontrada" : sections.find((item) => item.key === section)?.label}</Text>
              <Text style={[styles.message, { color: palette.textMuted }]}>{search.trim() ? "Tente outro nome ou limpe a busca." : emptyMessage}</Text>
              {section === "friends" && !search.trim() ? <Pressable onPress={() => setSection("discover")} style={[styles.retry, { backgroundColor: palette.surfaceElevated, borderColor: palette.borderStrong, borderWidth: 1 }]}><Text style={styles.retryText}>Encontrar colegas</Text></Pressable> : null}
            </View>
          ) : <View style={styles.list}>{people.map((person) => person.status === "incoming" ? <SocialInviteCard key={person.relationshipId} person={person} accent={palette.accent} onAccept={() => act(person.alunoId, () => aceitarConvite(person.relationshipId!))} onDecline={() => act(person.alunoId, () => recusarConvite(person.relationshipId!))} onPressProfile={() => setSelectedPerson(person)} /> : <SocialPersonCard key={person.relationshipId ?? person.alunoId} person={person} accent={palette.accent} actionLabel={busy === person.alunoId ? "..." : actionFor(person).label} onAction={actionFor(person).fn} onPressProfile={() => setSelectedPerson(person)} onPressChat={() => setChatPerson(person)} secondaryLabel={person.status === "friend" ? "Bloquear" : undefined} onSecondary={() => act(person.alunoId, () => bloquear(person.alunoId))} />)}</View>}
        </ScrollView>
      </SafeAreaView>
      {usuario?.id && activeClasseId > 0 ? <StoreModal visible={storeVisible} alunoId={usuario.id} classeId={activeClasseId} profileName={profile} onClose={() => setStoreVisible(false)} /> : null}
      <SocialProfileModal visible={selectedPerson !== null} alunoId={selectedPerson?.alunoId ?? null} classeId={activeClasseId} accent={palette.accent} online={selectedPerson?.online} onPressChat={() => { if (selectedPerson) setChatPerson(selectedPerson); setSelectedPerson(null); }} onClose={() => setSelectedPerson(null)} />
      {chatPerson ? <PrivateChatModal visible={chatPerson !== null} person={chatPerson} accent={palette.accent} profile={profile} onClose={() => setChatPerson(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, safeArea: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 28 },
  header: { marginBottom: 16 },
  subtitle: { fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 21, marginTop: 12 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  tab: { flexDirection: "row", gap: 8, minHeight: 44, paddingHorizontal: 12, alignItems: "center", borderRadius: 10, borderWidth: 1 },
  tabText: { fontSize: 14, fontWeight: "600" },
  count: { fontSize: 12, fontWeight: "700", backgroundColor: "#ffffff18", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, paddingLeft: 12, paddingRight: 4, borderWidth: 1, borderRadius: 10, minHeight: 48 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, paddingVertical: 12 },
  clearSearch: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  loader: { marginTop: 48 }, list: { gap: 12 },
  empty: { alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 32 },
  sectionTitle: { fontFamily: FontFamily.inikaBold, fontSize: 20, textAlign: "center" },
  message: { fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 310 },
  retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: 18, paddingVertical: 11, borderRadius: 8, marginTop: 4 },
  retryText: { color: Color.colorWhite, fontSize: 14, fontWeight: "700" },
});
