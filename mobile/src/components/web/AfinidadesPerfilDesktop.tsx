import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import tinycolor from "tinycolor2";

import { ProfileArtwork } from "@/components/ProfileArtwork";
import { profileEmblems } from "@/constants/designAssets";
import type { BrainHexProfile } from "@/constants/brainHexProfiles";
import { getBrainHexConfig } from "@/constants/profileImages";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

type Afinidade = { perfil: BrainHexProfile; afinidade: number };

/**
 * Parte de baixo da coluna de identidade do Perfil na web em tela larga (#346,
 * protótipo v4, 08-perfil-hub.html): a troca de perfil como lista (emblema,
 * nome, afinidade e o ✓ no ativo), a barra das afinidades com a legenda e os
 * três números da jornada (turma, sequência, posição no rank).
 */
export function AfinidadesPerfilDesktop({
  afinidades,
  ativo,
  salvando,
  onSelecionar,
  trocaRef,
  turma,
  sequencia,
  posicao,
  palette,
}: {
  afinidades: Afinidade[];
  ativo: BrainHexProfile;
  salvando: string | null;
  onSelecionar: (perfil: BrainHexProfile) => void;
  trocaRef?: React.RefObject<View | null>;
  turma: string | null | undefined;
  sequencia: number;
  posicao: number | null;
  palette: ProfileShellPalette;
}) {
  const total = afinidades.reduce((soma, a) => soma + Math.max(0, a.afinidade), 0);
  const legenda = afinidades.map((a) => `${getBrainHexConfig(a.perfil).label} ${Math.round(a.afinidade)}%`);
  const numeros: [string, string][] = [
    ["Turma", turma || "—"],
    ["Sequência", sequencia >= 7 ? "7+ dias" : `${sequencia} ${sequencia === 1 ? "dia" : "dias"}`],
    ["Posição no rank", posicao ? `${posicao}º` : "—"],
  ];

  return (
    <View style={s.bloco}>
      {afinidades.length > 1 ? (
        <View ref={trocaRef} collapsable={false}>
          <Text style={[s.rotulo, { color: palette.textMuted }]}>Alternar perfil ativo</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Alternar perfil ativo" style={s.lista}>
            {afinidades.map(({ perfil, afinidade }) => {
              const cfg = getBrainHexConfig(perfil);
              const selecionado = perfil === ativo;
              const ocupado = salvando === perfil;
              return (
                <Pressable
                  key={perfil}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selecionado, busy: ocupado }}
                  disabled={Boolean(salvando)}
                  onPress={() => onSelecionar(perfil)}
                  style={({ hovered }: { hovered?: boolean; pressed: boolean }) => [
                    s.opcao,
                    {
                      borderColor: selecionado ? cfg.color : palette.border,
                      backgroundColor: selecionado
                        ? tinycolor(cfg.color).setAlpha(0.2).toRgbString()
                        : hovered
                          ? palette.surfaceElevated
                          : palette.surface,
                      opacity: salvando && !ocupado ? 0.55 : 1,
                    },
                  ]}
                >
                  <ProfileArtwork source={profileEmblems[perfil]} profile={perfil} width={28} height={28} />
                  <Text style={[s.nome, { color: palette.text }]}>{cfg.label}</Text>
                  <Text style={[s.afinidade, { color: palette.textSubtle }]}>{ocupado ? "Salvando..." : `${Math.round(afinidade)}%`}</Text>
                  {selecionado ? <MaterialCommunityIcons name="check" size={16} color={palette.text} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {total > 0 ? (
        <>
          {/* Cada segmento na proporção da afinidade; o do perfil ativo na cor de destaque. */}
          <View accessibilityLabel={`Afinidades: ${legenda.join(", ")}`} style={s.barra}>
            {afinidades.map(({ perfil, afinidade }) => (
              <View
                key={perfil}
                style={[
                  s.segmento,
                  {
                    flex: Math.max(0, afinidade),
                    backgroundColor: perfil === ativo ? palette.accent : tinycolor(getBrainHexConfig(perfil).color).setAlpha(0.85).toRgbString(),
                  },
                ]}
              />
            ))}
          </View>
          <Text style={[s.legenda, { color: palette.textSubtle }]}>{legenda.join(" · ")}</Text>
        </>
      ) : null}

      <View style={s.numeros}>
        {numeros.map(([rotulo, valor]) => (
          <View key={rotulo} style={[s.numero, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[s.numeroRotulo, { color: palette.text }]}>{rotulo}</Text>
            <Text style={[s.numeroValor, { color: palette.accent }]} numberOfLines={1}>{valor}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bloco: { marginTop: 18 },
  rotulo: { fontFamily: FontFamily.interMedium, fontSize: 13, marginBottom: 8 },
  lista: { gap: 8 },
  opcao: { flexDirection: "row", alignItems: "center", gap: 10, height: 44, paddingLeft: 8, paddingRight: 12, borderRadius: 100, borderWidth: 1 },
  nome: { flex: 1, fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
  afinidade: { fontFamily: FontFamily.interMedium, fontSize: 11.5 },
  barra: { flexDirection: "row", gap: 4, marginTop: 20 },
  segmento: { height: 6, borderRadius: 100 },
  legenda: { fontFamily: FontFamily.interMedium, fontSize: 11.5, lineHeight: 17, marginTop: 8 },
  numeros: { gap: 8, marginTop: 18 },
  numero: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1 },
  numeroRotulo: { fontFamily: FontFamily.interMedium, fontSize: 12.5 },
  numeroValor: { flexShrink: 1, fontFamily: FontFamily.interMedium, fontSize: 12.5, fontWeight: "700" },
});
