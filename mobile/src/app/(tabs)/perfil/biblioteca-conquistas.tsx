import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import tinycolor from "tinycolor2";

import CardSemDados from "@/components/CardSemDados";
import ConquistaModal from "@/components/ConquistaModal";
import { HallBackground, OrnamentDivider } from "@/components/HallTheme";
import {
  SectionGuideButton,
  SectionGuideStep,
} from "@/components/SectionGuideButton";
import {
  BrainHexProfile,
  getBrainHexConfig,
  normalizeBrainHexProfile,
} from "@/constants/profileImages";
import { useUsuario } from "@/context/SessaoContext";
import { Conquista, ConquistaBibliotecaItem } from "@/models/Conquista";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { resolveRepresentativeBrainHexProfiles } from "@/utils/brainHex";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { getProfileGuideEmphasis } from "@/utils/profileSectionGuide";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function BibliotecaConquistasScreen() {
  const { usuario } = useUsuario();
  const [itens, setItens] = useState<ConquistaBibliotecaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Conquista | null>(null);
  const summaryGuideRef = useRef<View | null>(null);

  const perfil = (normalizeBrainHexProfile(usuario?.perfilAtivo) ??
    normalizeBrainHexProfile(usuario?.perfis?.[0]?.nome) ??
    "mastermind") as BrainHexProfile;
  const perfisRepresentativos = useMemo(() => {
    const resolved = resolveRepresentativeBrainHexProfiles(usuario?.perfis);
    return resolved.length > 0 ? resolved : [perfil];
  }, [perfil, usuario?.perfis]);
  const hexConfig = getBrainHexConfig(perfil);
  const shellPalette = useMemo(() => getProfileShellPalette(perfil), [perfil]);
  const accent = tinycolor(hexConfig.color).lighten(4).toHexString();
  const gold = tinycolor(shellPalette.accent).lighten(10).toHexString();
  const commonDark = tinycolor(gold).darken(24).toHexString();

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
  const conquistasPerfil = useMemo(
    () => itens.filter((item) => item.conquista.escopo === "perfil"),
    [itens],
  );
  const conquistasComuns = useMemo(
    () => itens.filter((item) => item.conquista.escopo === "comum"),
    [itens],
  );

  const percentualConclusao = useMemo(() => {
    if (!itens.length) return 0;
    return Math.round((concluidas.length / itens.length) * 100);
  }, [concluidas.length, itens.length]);

  const secoes = useMemo(() => {
    const buildGroups = (scopeKey: string, scopeItems: ConquistaBibliotecaItem[]) =>
      [
        { key: "concluidas", label: "Concluídas", status: "concluida" },
        { key: "em-progresso", label: "Em progresso", status: "em_progresso" },
        { key: "bloqueadas", label: "Bloqueadas", status: "bloqueada" },
      ]
        .map((group) => ({
          ...group,
          key: `${scopeKey}:${group.key}`,
          items: scopeItems.filter((item) => item.status === group.status),
        }))
        .filter((group) => group.items.length > 0);

    return [
      ...perfisRepresentativos.map((profileKey) => {
        const profileConfig = getBrainHexConfig(profileKey);
        const profileItems = conquistasPerfil.filter(
          (item) => item.conquista.perfil_alvo === profileKey,
        );
        return {
          key: `perfil:${profileKey}`,
          title: `Conquistas de ${profileConfig.label}`,
          subtitle: "Metas ligadas a um dos seus perfis BrainHex representativos.",
          groups: buildGroups(`perfil:${profileKey}`, profileItems),
        };
      }),
      {
        key: "comuns",
        title: "Conquistas da plataforma",
        subtitle: "Marcos comuns de estudo e uso do TrailUp.",
        groups: buildGroups("comuns", conquistasComuns),
      },
    ].filter((section) => section.groups.length > 0);
  }, [conquistasComuns, conquistasPerfil, perfisRepresentativos]);

  const selectedProfile = normalizeBrainHexProfile(selected?.perfil_alvo) ?? perfil;
  const selectedProfileConfig = getBrainHexConfig(selectedProfile);
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

  return (
    <View style={[styles.screen, { backgroundColor: shellPalette.background }]}>
      <SectionGuideButton
        profile={perfil}
        sectionTitle="Conquistas"
        steps={guideSteps}
        targetRefs={guideTargets}
        style={styles.guideButton}
      />
      <View
        style={[StyleSheet.absoluteFill, { opacity: 0.4 }]}
        pointerEvents="none"
      >
        <HallBackground palette={shellPalette} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View
          ref={summaryGuideRef}
          collapsable={false}
          style={[
            styles.summaryCard,
            {
              backgroundColor: shellPalette.surfaceElevated,
              borderColor: shellPalette.border,
            },
          ]}
        >
          <Text style={[styles.summaryTitle, { color: shellPalette.text }]}>
            Biblioteca de Conquistas
          </Text>
          <Text style={[styles.summarySubtitle, { color: shellPalette.textMuted }]}>
            Acompanhe desbloqueios, progresso e metas pendentes.
          </Text>

          <View style={styles.scopeSummaryRow}>
            <View style={[styles.scopeChip, { borderColor: shellPalette.borderStrong }]}>
              <View style={styles.representativeIcons}>
                {perfisRepresentativos.map((profileKey) => {
                  const profileConfig = getBrainHexConfig(profileKey);
                  return (
                    <MaterialCommunityIcons
                      key={profileKey}
                      name={profileConfig.icon}
                      size={13}
                      color={tinycolor(profileConfig.color).lighten(4).toHexString()}
                    />
                  );
                })}
              </View>
              <Text style={[styles.scopeChipText, { color: shellPalette.textMuted }]}>
                {conquistasPerfil.length} dos perfis
              </Text>
            </View>
            <View style={[styles.scopeChip, { borderColor: shellPalette.borderStrong }]}>
              <MaterialCommunityIcons name="earth" size={13} color={gold} />
              <Text style={[styles.scopeChipText, { color: shellPalette.textMuted }]}>
                {conquistasComuns.length} comuns
              </Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryMetric}>
              <Text style={[styles.summaryValue, { color: accent }]}>
                {itens.length}
              </Text>
              <Text style={[styles.summaryLabel, { color: shellPalette.textSubtle }]}>
                Total
              </Text>
            </View>
            <View style={styles.summaryMetric}>
              <Text style={[styles.summaryValue, { color: gold }]}>
                {concluidas.length}
              </Text>
              <Text style={[styles.summaryLabel, { color: shellPalette.textSubtle }]}>
                Concluídas
              </Text>
            </View>
            <View style={styles.summaryMetric}>
              <Text style={[styles.summaryValue, { color: shellPalette.accent }]}>
                {percentualConclusao}%
              </Text>
              <Text style={[styles.summaryLabel, { color: shellPalette.textSubtle }]}>
                Progresso
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.ornamentWrap}>
          <OrnamentDivider color={Color.colorWhite} />
        </View>

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
        ) : (
          secoes.map((section) => (
            <View key={section.key} style={styles.scopeSection}>
              <Text style={[styles.scopeTitle, { color: shellPalette.text }]}>
                {section.title}
              </Text>
              <Text style={[styles.scopeSubtitle, { color: shellPalette.textMuted }]}>
                {section.subtitle}
              </Text>

              {section.groups.map((group) => (
                <View key={group.key} style={styles.group}>
                  <Text style={[styles.groupTitle, { color: shellPalette.textSubtle }]}>
                    {group.label} ({group.items.length})
                  </Text>

                  {group.items.map((item) => {
                const percent = clamp(item.progressoPercentual, 0, 100);
                const id = item.conquista.conquista_id;
                const itemProfile = normalizeBrainHexProfile(
                  item.conquista.perfil_alvo,
                );
                const itemProfileConfig = getBrainHexConfig(itemProfile ?? perfil);
                const itemProfileAccent = tinycolor(itemProfileConfig.color)
                  .lighten(4)
                  .toHexString();
                const itemColor =
                  item.status === "concluida"
                    ? gold
                    : itemProfileAccent;
                const isProfileAchievement = item.conquista.escopo === "perfil";

                return (
                  <TouchableOpacity
                    key={`${group.key}:${id}`}
                    style={[
                      styles.item,
                      {
                        borderBottomColor: shellPalette.border,
                      },
                    ]}
                    activeOpacity={0.75}
                    onPress={() => setSelected(item.conquista)}
                  >
                    <View
                      style={[
                        styles.itemIconWrap,
                        { borderColor: shellPalette.borderStrong },
                      ]}
                    >
                      <LinearGradient
                        colors={
                          isProfileAchievement
                            ? [itemProfileAccent, itemProfileConfig.color]
                            : [gold, commonDark]
                        }
                        style={styles.itemIconGradient}
                      >
                        <MaterialCommunityIcons
                          name={isProfileAchievement ? itemProfileConfig.icon : "earth"}
                          size={20}
                          color={shellPalette.text}
                        />
                      </LinearGradient>
                    </View>

                    <View style={styles.itemBody}>
                      <View style={styles.itemHeader}>
                        <Text
                          style={[styles.itemTitle, { color: shellPalette.text }]}
                          numberOfLines={1}
                        >
                          {item.conquista.nome ?? "Conquista"}
                        </Text>
                        <Text
                          style={[
                            styles.itemPercent,
                            {
                              color: itemColor,
                            },
                          ]}
                        >
                          {Math.round(percent)}%
                        </Text>
                      </View>

                      <Text
                        style={[styles.itemDesc, { color: shellPalette.textMuted }]}
                        numberOfLines={2}
                      >
                        {item.status === "bloqueada"
                          ? item.criterioResumo ?? "Cumprir critérios para desbloquear."
                          : item.conquista.descricao ?? "Toque para ver detalhes."}
                      </Text>

                      <View
                        style={[
                          styles.track,
                          { backgroundColor: shellPalette.border },
                        ]}
                      >
                        <View
                          style={[
                            styles.fill,
                            { width: `${Math.max(4, percent)}%`, backgroundColor: itemColor },
                          ]}
                        />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
                  })}
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <ConquistaModal
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.nome ?? "Conquista"}
        category={selected?.categoria ?? ""}
        description={selected?.descricao ?? "Detalhes da conquista."}
        date={selected?.data_conquista}
        color={
          selected?.escopo === "perfil"
            ? selectedProfileConfig.color
            : shellPalette.accent
        }
        imageSource={
          selected?.icone_url
            ? { uri: selected.icone_url }
            : selectedProfileConfig.image
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  guideButton: {
    position: "absolute",
    top: 12,
    right: 18,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 38,
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  summaryTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 17,
    marginBottom: 2,
  },
  summarySubtitle: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    marginBottom: 8,
  },
  scopeSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  scopeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  scopeChipText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 10,
  },
  representativeIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryMetric: {
    flex: 1,
    alignItems: "center",
  },
  summaryValue: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 20,
  },
  summaryLabel: {
    marginTop: 2,
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
  },
  ornamentWrap: {
    marginBottom: 12,
    opacity: 0.75,
  },
  helperText: {
    textAlign: "center",
    marginTop: 26,
    fontFamily: FontFamily.interMedium,
  },
  group: {
    marginBottom: 14,
  },
  scopeSection: {
    marginBottom: 18,
  },
  scopeTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 17,
  },
  scopeSubtitle: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    marginTop: 2,
    marginBottom: 12,
  },
  groupTitle: {
    fontFamily: FontFamily.inikaBold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontSize: 12,
    marginBottom: 8,
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
