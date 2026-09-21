import { HallBackground, OrnamentDivider } from "@/components/HallTheme";
import { SocialInviteCard } from "@/components/social/SocialInviteCard";
import { SocialPersonCard } from "@/components/social/SocialPersonCard";
import { SocialProfileModal } from "@/components/social/SocialProfileModal";
import { PrivateChatModal } from "@/components/social/PrivateChatModal";
import { ArenaSection } from "@/components/social/ArenaSection";
import { GuildSection } from "@/components/social/GuildSection";
import type { GuildShareOption } from "@/components/social/GuildChatModal";
import { StoreLauncher } from "@/components/loja/StoreLauncher";
import { StoreModal } from "@/components/loja/StoreModal";
import { useUsuario } from "@/context/SessaoContext";
import { useTrilha } from "@/context/TrilhaContext";
import { Classe } from "@/models/Classe";
import { aceitarConvite, bloquear, carregarSocial, desfazerAmizade, enviarConvite, recusarConvite } from "@/services/social/socialService";
import { carregarGuildas } from "@/services/social/guildService";
import { carregarArena } from "@/services/social/arenaService";
import type { ArenaDesafio } from "@/services/social/arenaModel";
import { situacaoDoDesafio } from "@/services/social/arenaModel";
import type { SocialPerson } from "@/services/social/socialModel";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

/**
 * Quatro seções, e `convites` deixou de ser uma delas.
 *
 * Convite é estado transitório: a aba ficava vazia na maior parte do tempo e
 * gastava um quarto da largura da tela para dizer "nada aqui". Ele voltou como
 * faixa no topo de AMIGOS, com o contador no próprio rótulo da aba — mesma
 * informação, sem custar um quarto da barra, e nada escondido. A vaga foi para
 * a ARENA.
 */
type Section = "guilds" | "arena" | "friends" | "discover";

const SECOES: readonly Section[] = ["guilds", "arena", "friends", "discover"];
const ROTULO: Record<Section, string> = {
  guilds: "GUILDAS",
  arena: "ARENA",
  friends: "AMIGOS",
  discover: "ENCONTRAR",
};

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
  const [section, setSection] = useState<Section>("guilds");
  const [social, setSocial] = useState<Awaited<ReturnType<typeof carregarSocial>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storeVisible, setStoreVisible] = useState(false);
  const [guilds, setGuilds] = useState<Awaited<ReturnType<typeof carregarGuildas>>>([]);
  const [arena, setArena] = useState<ArenaDesafio[]>([]);
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
    try {
      // A arena é `allSettled` junto do resto, mas o erro dela não derruba a
      // tela: num ambiente sem a migração aplicada, o Social inteiro sumiria
      // por causa de uma RPC que ainda não existe.
      const [nextSocial, nextGuilds, nextArena] = await Promise.all([
        activeClasseId > 0 ? carregarSocial(activeClasseId) : carregarSocial(),
        carregarGuildas(activeClasseId),
        carregarArena(activeClasseId).catch((caught) => {
          console.warn("[Social] Arena indisponível:", caught);
          return [] as ArenaDesafio[];
        }),
      ]);
      setSocial(nextSocial);
      setGuilds(nextGuilds);
      setArena(nextArena);
    } catch (caught) {
      console.warn("[Social] Falha ao carregar:", caught);
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [activeClasseId]);
  useEffect(() => { void load(); }, [load]);

  const pendentes = useMemo(
    () => (social?.incoming.length ?? 0) + arena.filter((d) => situacaoDoDesafio(d) === "convite").length,
    [social, arena],
  );
  const convitesDeAmizade = social?.incoming.length ?? 0;
  const convitesDaArena = pendentes - convitesDeAmizade;

  const people = useMemo(() => {
    if (!social) return [];
    if (section === "friends") return [...social.incoming, ...social.friends, ...social.outgoing];
    if (section === "discover") return social.candidates;
    return [];
  }, [section, social]);

  const todasAsPessoas = useMemo(
    () => (social ? [...social.friends, ...social.incoming, ...social.outgoing, ...social.candidates] : []),
    [social],
  );

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

  const emptyMessage = section === "friends"
    ? "Você ainda não tem amigos na jornada."
    : "Nenhum colega disponível para convidar.";

  const listaDePessoas = (
    loading && !social ? <ActivityIndicator color={palette.accent} style={styles.loader} />
    : error ? (
      <View style={styles.empty}>
        <MaterialCommunityIcons name="database-alert-outline" size={42} color={palette.accent} />
        <Text style={[styles.message, { color: palette.textMuted }]}>{error}</Text>
        <Pressable onPress={() => void load()} style={[styles.retry, { backgroundColor: palette.accent }]}>
          <Text style={styles.retryText}>Tentar novamente</Text>
        </Pressable>
      </View>
    )
    : people.length === 0 ? (
      <View style={styles.empty}>
        <MaterialCommunityIcons name={section === "friends" ? "account-group-outline" : "account-search-outline"} size={44} color={palette.accent} />
        <Text style={[styles.sectionTitle, { color: palette.text }]}>{ROTULO[section]}</Text>
        <Text style={[styles.message, { color: palette.textMuted }]}>{emptyMessage}</Text>
      </View>
    )
    : (
      <View style={styles.list}>
        {section === "friends" && convitesDeAmizade > 0 ? (
          <Text style={[styles.faixa, { color: palette.accent }]}>
            {convitesDeAmizade === 1 ? "1 CONVITE ESPERANDO VOCÊ" : `${convitesDeAmizade} CONVITES ESPERANDO VOCÊ`}
          </Text>
        ) : null}
        {people.map((person) => person.status === "incoming" ? (
          <SocialInviteCard
            key={person.relationshipId}
            person={person}
            accent={getProfileShellPalette(person.perfilAtivo).accent}
            onAccept={() => act(person.alunoId, () => aceitarConvite(person.relationshipId!))}
            onDecline={() => act(person.alunoId, () => recusarConvite(person.relationshipId!))}
            onPressProfile={() => setSelectedPerson(person)}
          />
        ) : (
          <SocialPersonCard
            key={person.relationshipId ?? person.alunoId}
            person={person}
            accent={getProfileShellPalette(person.perfilAtivo).accent}
            onPressChat={() => setChatPerson(person)}
            actionLabel={busy === person.alunoId ? "..." : actionFor(person).label}
            onAction={actionFor(person).fn}
            onPressProfile={() => setSelectedPerson(person)}
            secondaryLabel={person.status === "friend" ? "Bloquear" : undefined}
            onSecondary={() => act(person.alunoId, () => bloquear(person.alunoId))}
          />
        ))}
      </View>
    )
  );

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <HallBackground palette={palette} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading && social !== null} onRefresh={() => void load()} tintColor={palette.accent} />}
        >
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View>
                <Text style={[styles.kicker, { color: palette.accent }]}>COMUNIDADE</Text>
                <Text style={styles.title}>SOCIAL</Text>
                <Text style={[styles.subtitle, { color: palette.textSubtle }]}>Sua rede de jornada</Text>
              </View>
              <StoreLauncher color={palette.accent} onPress={() => setStoreVisible(true)} />
            </View>
            <OrnamentDivider color={palette.accent} />
            <View style={styles.tabs}>
              {SECOES.map((key) => {
                const active = section === key;
                // O contador vive na aba dona do convite: amizade em AMIGOS,
                // desafio em ARENA. Um contador só, somando os dois, mandaria
                // o aluno procurar na aba errada.
                const badge = key === "friends" ? convitesDeAmizade : key === "arena" ? convitesDaArena : 0;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={badge > 0 ? `${ROTULO[key]}, ${badge} pendente` : ROTULO[key]}
                    onPress={() => setSection(key)}
                    style={[styles.tab, active && { borderBottomColor: palette.accent }]}
                  >
                    <View style={styles.tabInner}>
                      <Text style={[styles.tabText, active && { color: palette.accent }]}>{ROTULO[key]}</Text>
                      {badge > 0 ? (
                        <View style={[styles.badge, { backgroundColor: palette.accent }]}>
                          <Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {section === "guilds" ? (
            <GuildSection
              guilds={guilds}
              people={todasAsPessoas}
              classeId={activeClasseId}
              accent={palette.accent}
              profile={profile}
              shareOptions={shareOptions}
              onReload={load}
            />
          ) : section === "arena" ? (
            <ArenaSection
              desafios={arena}
              pessoas={todasAsPessoas}
              guildas={guilds}
              classeId={activeClasseId}
              accent={palette.accent}
              onReload={load}
            />
          ) : (
            listaDePessoas
          )}
        </ScrollView>
      </SafeAreaView>
      {usuario?.id && classeId > 0 ? <StoreModal visible={storeVisible} alunoId={usuario.id} classeId={classeId} profileName={profile} onClose={() => setStoreVisible(false)} /> : null}
      <SocialProfileModal visible={selectedPerson !== null} alunoId={selectedPerson?.alunoId ?? null} classeId={activeClasseId} accent={palette.accent} online={selectedPerson?.online} onPressChat={() => { if (selectedPerson) setChatPerson(selectedPerson); setSelectedPerson(null); }} onClose={() => setSelectedPerson(null)} />
      {chatPerson ? <PrivateChatModal visible={chatPerson !== null} person={chatPerson} accent={palette.accent} profile={profile} onClose={() => setChatPerson(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 120 },
  header: { marginBottom: 18 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kicker: { fontFamily: FontFamily.inikaBold, fontSize: 11, letterSpacing: 2 },
  title: { color: Color.colorWhite, fontFamily: FontFamily.poppinsExtraBold, fontSize: 30, letterSpacing: 2 },
  subtitle: { fontFamily: FontFamily.interMedium, fontSize: 14, marginTop: 2 },
  tabs: { flexDirection: "row", marginTop: 18, borderBottomWidth: 1, borderBottomColor: Color.colorWhite20 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabInner: { flexDirection: "row", alignItems: "center", gap: 5 },
  tabText: { color: Color.colorWhite70, fontFamily: FontFamily.inikaBold, fontSize: 11, letterSpacing: 0.4 },
  badge: { minWidth: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: Color.colorWhite, fontSize: 9, fontWeight: "800" },
  faixa: { fontFamily: FontFamily.inikaBold, fontSize: 10, letterSpacing: 1, paddingBottom: 6, paddingTop: 2 },
  loader: { marginTop: 80 },
  list: { gap: 4 },
  empty: { alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 70 },
  sectionTitle: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 15, letterSpacing: 1 },
  message: { fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 310 },
  retry: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10, marginTop: 4 },
  retryText: { color: Color.colorWhite, fontFamily: FontFamily.poppinsExtraBold, fontSize: 13 },
});
