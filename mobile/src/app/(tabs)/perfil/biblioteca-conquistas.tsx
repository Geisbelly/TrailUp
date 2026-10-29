import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Stack } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import CardSemDados from "@/components/CardSemDados";
import ConquistaModal from "@/components/ConquistaModal";
import { BibliotecaDesktop } from "@/components/web/BibliotecaDesktop";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { getAchievementArtwork } from "@/constants/achievementImages";
import { HallBackground } from "@/components/HallTheme";
import {
  SectionGuideButton,
  SectionGuideStep,
} from "@/components/SectionGuideButton";
import {
  BrainHexProfile,
  normalizeBrainHexProfile,
} from "@/constants/profileImages";
import { useUsuario } from "@/context/SessaoContext";
import { Conquista, ConquistaBibliotecaItem } from "@/models/Conquista";
import { FontFamily } from "@/styles/GlobalStyle";
import { resolveRepresentativeBrainHexProfiles } from "@/utils/brainHex";
import { registrarAlvoTour } from "@/utils/tourTargets";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { getProfileGuideEmphasis } from "@/utils/profileSectionGuide";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

type FiltroBiblioteca = "todas" | "concluida" | "em_progresso" | "bloqueada";
const FILTROS_BIBLIOTECA: { chave: FiltroBiblioteca; rotulo: string }[] = [
  { chave: "todas", rotulo: "Todas" },
  { chave: "concluida", rotulo: "Concluídas" },
  { chave: "em_progresso", rotulo: "Em progresso" },
  { chave: "bloqueada", rotulo: "Bloqueadas" },
];
/** Verde de "concluída" fixo, não derivado do accent (decisão de contraste do CLAUDE.md). */
const SUCESSO = "#62db9b";

export default function BibliotecaConquistasScreen() {
  const { usuario } = useUsuario();
  const [itens, setItens] = useState<ConquistaBibliotecaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Conquista | null>(null);
  const summaryGuideRef = useRef<View | null>(null);
  const desktop = useDesktopWeb();

  const perfil = (normalizeBrainHexProfile(usuario?.perfilAtivo) ??
    normalizeBrainHexProfile(usuario?.perfis?.[0]?.nome) ??
    "mastermind") as BrainHexProfile;
  const perfisRepresentativos = useMemo(() => {
    const resolved = resolveRepresentativeBrainHexProfiles(usuario?.perfis);
    return resolved.length > 0 ? resolved : [perfil];
  }, [perfil, usuario?.perfis]);
  const shellPalette = useMemo(() => getProfileShellPalette(perfil), [perfil]);

  const loadBiblioteca = useCallback(async () => {
    if (!usuario?.id) {
      setItens([]);
      return;
    }

    setLoading(true);
    try {
      const data = await Conquista.fetchBibliotecaForAluno(
        usuario.id,
        perfisRepresentativos,
      );
      setItens(data);
    } catch (error) {
      console.warn(
        "[BibliotecaConquistas] erro ao carregar conquistas:",
        error,
      );
      setItens([]);
    } finally {
      setLoading(false);
    }
  }, [perfisRepresentativos, usuario?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadBiblioteca();
    }, [loadBiblioteca]),
  );

  const concluidas = useMemo(
    () => itens.filter((item) => item.status === "concluida"),
    [itens],
  );

  const percentualConclusao = useMemo(() => {
    if (!itens.length) return 0;
    return Math.round((concluidas.length / itens.length) * 100);
  }, [concluidas.length, itens.length]);

  // Celular (mobile-v1, 09-biblioteca-conquistas.html): uma grade só, com o filtro segmentado.
  const [filtro, setFiltro] = useState<FiltroBiblioteca>("todas");
  const emProgresso = useMemo(() => itens.filter((item) => item.status === "em_progresso"), [itens]);
  const visiveis = useMemo(() => {
    const ordem = { concluida: 0, em_progresso: 1, bloqueada: 2 } as Record<string, number>;
    return [...itens]
      .filter((item) => filtro === "todas" || item.status === filtro)
      .sort((a, b) => (ordem[a.status] ?? 3) - (ordem[b.status] ?? 3));
  }, [filtro, itens]);

  const profileEmphasis = getProfileGuideEmphasis(perfil, "achievements");
  const guideSteps = useMemo<SectionGuideStep[]>(
    () => [
      {
        id: "achievements-summary",
        target: "achievements_summary",
        title: "Resumo da biblioteca",
        description:
          `Total conta todas as conquistas disponíveis; Concluídas conta as desbloqueadas; Progresso é concluídas ÷ total. ${profileEmphasis}`,
        icon: "chart-box-outline",
      },
      {
        id: "achievements-scopes",
        target: "achievements_explanation",
        title: "Conquistas de perfil e comuns",
        description:
          "As conquistas de perfil são ligadas aos seus perfis BrainHex representativos. As comuns medem estudo e uso geral do TrailUp e valem independentemente do perfil ativo.",
        icon: "account-multiple-check-outline",
      },
      {
        id: "achievements-status",
        target: "achievements_explanation",
        title: "Estados da conquista",
        description:
          "Concluída significa requisito cumprido; Em progresso mostra avanço parcial; Bloqueada ainda não atingiu o requisito mínimo. As seções exibem também quantos itens existem em cada estado.",
        icon: "progress-check",
      },
      {
        id: "achievements-progress",
        target: "achievements_explanation",
        title: "Porcentagem e barra",
        description:
          "Cada barra compara o valor atual com a meta específica da conquista. O texto da conquista bloqueada informa o critério necessário para avançar.",
        icon: "progress-helper",
      },
      {
        id: "achievements-details",
        target: "achievements_explanation",
        title: "Detalhes do marco",
        description:
          "Toque em uma conquista para ver nome, categoria, descrição, data de obtenção e a identidade visual do perfil ou da plataforma.",
        icon: "information-outline",
      },
    ],
    [profileEmphasis],
  );
  const guideTargets = useMemo(
    () => ({ achievements_summary: summaryGuideRef }),
    [],
  );
  // Entregue ao guia para que ele role até o elemento que está explicando —
  // sem isto ele descreve trechos que ficaram fora da tela.
  const scrollRef = useRef<ScrollView>(null);
  // `scrollTo` quer posicao ABSOLUTA e `measureInWindow` devolve posicao na
  // TELA; o deslocamento atual e o que converte uma na outra.
  const scrollOffsetRef = useRef(0);


  // Alvos do tutorial inicial: as refs ja existiam para o guia de pagina.
  useEffect(() => registrarAlvoTour("conquistas_resumo", summaryGuideRef), [summaryGuideRef]);

  const detalhe = (
    <ConquistaModal
      visible={!!selected}
      onClose={() => setSelected(null)}
      title={selected?.nome ?? "Conquista"}
      category={selected?.categoria ?? ""}
      description={selected?.descricao ?? "Detalhes da conquista."}
      date={selected?.data_conquista}
      profile={perfil}
      color={shellPalette.accent}
      imageSource={getAchievementArtwork(selected)}
    />
  );

  // Web em tela larga (#346, protótipo v4): números, filtros e a grade, com o mesmo detalhe.
  if (desktop) {
    return (
      <>
        <BibliotecaDesktop
          itens={itens}
          carregando={loading}
          palette={shellPalette}
          resumoRef={summaryGuideRef}
          onAbrir={setSelected}
        />
        {detalhe}
      </>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: shellPalette.background }]}>
      {/* O guia vive no cabecalho da tela, e nao flutuando sobre o conteudo:
          e o mesmo lugar em toda pagina que tem header, e assim ele nunca
          cobre texto nem depende de offset ajustado a mao por pagina. */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <SectionGuideButton
              profile={perfil}
              sectionTitle="Conquistas"
              steps={guideSteps}
              targetRefs={guideTargets}
              scrollRef={scrollRef}
                scrollOffsetRef={scrollOffsetRef}
              style={styles.guideButton}
            />
          ),
        }}
      />
      <View
        style={[StyleSheet.absoluteFill, { opacity: 0.4, pointerEvents: "none" }]}
      >
        <HallBackground palette={shellPalette} />
      </View>

      <ScrollView
        ref={scrollRef}
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
        }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Os três números (09-biblioteca-conquistas.html, .numeros). */}
        <View ref={summaryGuideRef} collapsable={false} style={styles.numeros}>
          {[
            [String(concluidas.length), "Conquistadas"],
            [String(emProgresso.length), "Em progresso"],
            [`${percentualConclusao}%`, "Completo"],
          ].map(([valor, rotulo]) => (
            <View key={rotulo} style={[styles.numero, { backgroundColor: shellPalette.surface, borderColor: shellPalette.border }]}>
              <Text style={[styles.numeroValor, { color: shellPalette.text }]}>{valor}</Text>
              <Text style={[styles.numeroRotulo, { color: shellPalette.textSubtle }]}>{rotulo}</Text>
            </View>
          ))}
        </View>

        {/* Seletor segmentado (.segm): rola de lado se não couber. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.segm, { backgroundColor: shellPalette.surface, borderColor: shellPalette.border }]}
          contentContainerStyle={styles.segmConteudo}
        >
          {FILTROS_BIBLIOTECA.map(({ chave, rotulo }) => {
            const ativo = filtro === chave;
            return (
              <TouchableOpacity
                key={chave}
                accessibilityRole="button"
                accessibilityState={{ selected: ativo }}
                onPress={() => setFiltro(chave)}
                style={[styles.segmOpcao, ativo ? { backgroundColor: shellPalette.accent } : null]}
              >
                <Text style={[styles.segmTexto, { color: ativo ? shellPalette.background : shellPalette.textMuted }]}>{rotulo}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <Text style={[styles.helperText, { color: shellPalette.textMuted }]}>
            Carregando conquistas...
          </Text>
        ) : itens.length === 0 ? (
          <CardSemDados
            title="Sem conquistas registradas"
            description="Conclua atividades e tópicos para liberar sua biblioteca."
            accentColor={shellPalette.accent}
          />
        ) : visiveis.length === 0 ? (
          <Text style={[styles.helperText, { color: shellPalette.textSubtle }]}>Nenhuma conquista neste filtro.</Text>
        ) : (
          <View style={styles.grade}>
            {visiveis.map((item) => {
              const percent = clamp(item.progressoPercentual, 0, 100);
              const id = item.conquista.conquista_id;
              const feita = item.status === "concluida";
              const bloqueada = item.status === "bloqueada";
              return (
                <TouchableOpacity
                  key={id}
                  style={[
                    styles.celula,
                    {
                      backgroundColor: shellPalette.surface,
                      borderColor: feita ? shellPalette.accentSoft : shellPalette.border,
                    },
                  ]}
                  activeOpacity={0.75}
                  onPress={() => setSelected(item.conquista)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.conquista.nome ?? "Conquista"}: ${feita ? "conquistada" : bloqueada ? "bloqueada" : `${Math.round(percent)}%`}`}
                >
                  <MaterialCommunityIcons
                    name={feita ? "check" : bloqueada ? "lock-outline" : "progress-clock"}
                    size={16}
                    color={feita ? SUCESSO : shellPalette.textSubtle}
                    style={styles.celulaSelo}
                  />
                  <Image
                    source={getAchievementArtwork(item.conquista)}
                    resizeMode="contain"
                    style={[styles.celulaArte, bloqueada ? { opacity: 0.35 } : null]}
                    accessible={false}
                  />
                  <Text
                    numberOfLines={2}
                    style={[styles.celulaNome, { color: bloqueada ? shellPalette.textSubtle : shellPalette.text }]}
                  >
                    {item.conquista.nome ?? "Conquista"}
                  </Text>
                  {feita || bloqueada ? null : (
                    <View style={styles.celulaProg}>
                      <View style={[styles.track, styles.celulaTrilho, { backgroundColor: shellPalette.surfaceElevated }]}>
                        <View style={[styles.fill, { width: `${Math.max(4, percent)}%`, backgroundColor: shellPalette.accent }]} />
                      </View>
                      <Text style={[styles.celulaPct, { color: shellPalette.textSubtle }]}>{Math.round(percent)}%</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {detalhe}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  grade: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  numeros: { flexDirection: "row", gap: 8 },
  numero: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 8, alignItems: "center" },
  numeroValor: { fontFamily: FontFamily.inikaBold, fontSize: 24 },
  numeroRotulo: { fontFamily: FontFamily.interMedium, fontSize: 12 },
  segm: { flexGrow: 0, marginTop: 14, marginBottom: 12, borderRadius: 12, borderWidth: 1 },
  segmConteudo: { gap: 3, padding: 3 },
  segmOpcao: { minHeight: 40, paddingHorizontal: 10, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  segmTexto: { fontFamily: FontFamily.interMedium, fontSize: 12.5, fontWeight: "700" },
  celula: {
    // 3 por linha: (100% - 2 espaços de 8px) / 3.
    width: "31.6%",
    minHeight: 128,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    gap: 6,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 6,
  },
  celulaSelo: { position: "absolute", top: 8, right: 8 },
  celulaArte: { width: 52, height: 52 },
  celulaNome: { fontFamily: FontFamily.interMedium, fontSize: 12.5, fontWeight: "700", lineHeight: 16, textAlign: "center" },
  celulaProg: { width: "100%", paddingHorizontal: 4, gap: 3, alignItems: "center" },
  // O trilho fica dentro de alignItems: center e, sem largura, encolhia a zero.
  celulaTrilho: { alignSelf: "stretch", marginTop: 0, height: 4 },
  celulaPct: { fontFamily: FontFamily.interMedium, fontSize: 11 },
  guideButton: {
    marginRight: 12,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 38,
  },
  helperText: {
    textAlign: "center",
    marginTop: 26,
    fontFamily: FontFamily.interMedium,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    paddingVertical: 12,
  },
  itemIconWrap: {
    borderWidth: 1,
    borderRadius: 22,
    marginRight: 12,
  },
  itemIconGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  itemBody: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  itemTitle: {
    flex: 1,
    marginRight: 10,
    fontFamily: FontFamily.inikaBold,
    fontSize: 14,
  },
  itemPercent: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 12,
  },
  itemDesc: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  track: {
    marginTop: 7,
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
});
