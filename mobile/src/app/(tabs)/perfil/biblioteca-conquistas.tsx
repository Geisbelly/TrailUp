import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useMemo, useState } from "react";
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
  BrainHexProfile,
  getBrainHexConfig,
  normalizeBrainHexProfile,
} from "@/constants/profileImages";
import { useUsuario } from "@/context/SessaoContext";
import { Conquista, ConquistaBibliotecaItem } from "@/models/Conquista";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function BibliotecaConquistasScreen() {
  const { usuario } = useUsuario();
  const [itens, setItens] = useState<ConquistaBibliotecaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Conquista | null>(null);

  const perfil = (normalizeBrainHexProfile(usuario?.perfis?.[0]?.nome) ??
    "mastermind") as BrainHexProfile;
  const hexConfig = getBrainHexConfig(perfil);
  const shellPalette = useMemo(() => getProfileShellPalette(perfil), [perfil]);
  const accent = tinycolor(hexConfig.color).lighten(4).toHexString();
  const gold = tinycolor(shellPalette.accent).lighten(10).toHexString();

  const loadBiblioteca = useCallback(async () => {
    if (!usuario?.id) {
      setItens([]);
      return;
    }

    setLoading(true);
    try {
      const data = await Conquista.fetchBibliotecaForAluno(usuario.id);
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
  }, [usuario?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadBiblioteca();
    }, [loadBiblioteca]),
  );

  const concluidas = useMemo(
    () => itens.filter((item) => item.status === "concluida"),
    [itens],
  );
  const emProgresso = useMemo(
    () => itens.filter((item) => item.status === "em_progresso"),
    [itens],
  );
  const bloqueadas = useMemo(
    () => itens.filter((item) => item.status === "bloqueada"),
    [itens],
  );

  const percentualConclusao = useMemo(() => {
    if (!itens.length) return 0;
    return Math.round((concluidas.length / itens.length) * 100);
  }, [concluidas.length, itens.length]);

  const grupos = useMemo(
    () =>
      [
        {
          key: "concluidas",
          title: `Concluidas (${concluidas.length})`,
          items: concluidas,
        },
        {
          key: "em_progresso",
          title: `Em progresso (${emProgresso.length})`,
          items: emProgresso,
        },
        {
          key: "bloqueadas",
          title: `Bloqueadas (${bloqueadas.length})`,
          items: bloqueadas,
        },
      ].filter((group) => group.items.length > 0),
    [bloqueadas, concluidas, emProgresso],
  );

  return (
    <View style={[styles.screen, { backgroundColor: shellPalette.background }]}>
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
                Concluidas
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
            description="Conclua atividades e topicos para liberar sua biblioteca."
          />
        ) : (
          grupos.map((group) => (
            <View key={group.key} style={styles.group}>
              <Text style={[styles.groupTitle, { color: shellPalette.textSubtle }]}>
                {group.title}
              </Text>

              {group.items.map((item) => {
                const percent = clamp(item.progressoPercentual, 0, 100);
                const id = item.conquista.conquista_id;
                const itemColor =
                  item.status === "concluida" ? gold : shellPalette.accent;

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
                        colors={[accent, hexConfig.color]}
                        style={styles.itemIconGradient}
                      >
                        <MaterialCommunityIcons
                          name={hexConfig.icon}
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
                          ? item.criterioResumo ?? "Cumprir criterios para desbloquear."
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
        color={hexConfig.color}
        imageSource={hexConfig.image}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
    marginBottom: 12,
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
