import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Image, type ImageSourcePropType, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { BagModal } from "@/components/bag/BagModal";
import { normalizeBrainHexProfile } from "@/constants/brainHexProfiles";
import { designStar } from "@/constants/designAssets";
import { profileUtilityIcons } from "@/constants/profileUtilityIcons";
import { useTrilha } from "@/context/TrilhaContext";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellPalette";

type Props = {
  palette: ProfileShellPalette;
  nome: string;
  perfilAtivo?: string | null;
  foto: ImageSourcePropType;
  /**
   * Antes de o aluno escolher a turma, nada além da escolha abre: a Trilha, a Bag e o
   * Perfil dependem da turma. Com esta prop a barra só identifica o aluno (marca, foto e
   * nome, sem link) e oferece a única saída que vale ali, sair da conta.
   */
  antesDaTurma?: { saindo: boolean; onSair: () => void };
};

/**
 * Barra superior da web em tela larga (#346), como no protótipo v4: marca à
 * esquerda; à direita a Bag (arte do perfil ativo) antes do avatar, que leva ao Perfil.
 */
export function DesktopTopBar({ palette, nome, perfilAtivo, foto, antesDaTurma }: Props) {
  const router = useRouter();
  const { classeAtual } = useTrilha();
  const [bagAberta, setBagAberta] = useState(false);
  const perfil = normalizeBrainHexProfile(perfilAtivo) ?? "conqueror";
  const rotuloPerfil = perfilAtivo ? perfilAtivo.charAt(0).toUpperCase() + perfilAtivo.slice(1) : "";

  const marca = (
    <>
      <Image source={designStar} style={s.logo} resizeMode="contain" />
      <Text style={[s.nomeMarca, { color: palette.text }]}>TrailUp</Text>
    </>
  );
  const identidade = (
    <>
      <Image source={foto} style={[s.avatar, { borderColor: palette.accent }]} />
      <View>
        <Text style={[s.nome, { color: palette.text }]} numberOfLines={1}>{nome}</Text>
        {rotuloPerfil ? <Text style={[s.perfilAtivo, { color: palette.textSubtle }]}>{rotuloPerfil}</Text> : null}
      </View>
    </>
  );

  if (antesDaTurma) {
    const { saindo, onSair } = antesDaTurma;
    return (
      <View style={[s.barra, { backgroundColor: palette.surface, borderBottomColor: palette.border }]}>
        <View style={s.marca}>{marca}</View>
        <Text style={[s.area, { color: palette.textSubtle }]}>Área do aluno</Text>
        <View style={s.conta}>
          <View style={s.perfil}>{identidade}</View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sair da conta"
            disabled={saindo}
            onPress={onSair}
            style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
              s.sair,
              {
                borderColor: palette.borderStrong,
                backgroundColor: hovered || pressed ? palette.surfaceElevated : palette.background,
                opacity: saindo ? 0.6 : 1,
              },
            ]}
          >
            {saindo
              ? <ActivityIndicator size="small" color={palette.textMuted} />
              : <MaterialCommunityIcons name="logout" size={16} color={palette.text} />}
            <Text style={[s.sairTexto, { color: palette.text }]}>{saindo ? "Saindo…" : "Sair da conta"}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.barra, { backgroundColor: palette.surface, borderBottomColor: palette.border }]}>
      <Pressable accessibilityRole="link" accessibilityLabel="Ir para a Trilha" onPress={() => router.push("/")} style={s.marca}>
        {marca}
      </Pressable>
      <Text style={[s.area, { color: palette.textSubtle }]}>Área do aluno</Text>

      <View style={s.conta}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir minha Bag"
          onPress={() => setBagAberta(true)}
          style={({ hovered }: { hovered?: boolean; pressed: boolean }) => [s.bag, hovered && s.bagHover]}
        >
          <Image source={profileUtilityIcons.bag[perfil]} style={s.bagArte} resizeMode="contain" />
        </Pressable>
        <Pressable accessibilityRole="link" accessibilityLabel="Meu perfil" onPress={() => router.push("/perfil")} style={s.perfil}>
          {identidade}
        </Pressable>
      </View>

      <BagModal visible={bagAberta} classeId={classeAtual?.classe_id ?? null} profile={perfilAtivo} onClose={() => setBagAberta(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  barra: { height: 68, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 24, borderBottomWidth: 1 },
  marca: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 32, height: 32 },
  nomeMarca: { fontFamily: FontFamily.inikaBold, fontSize: 20 },
  area: { fontFamily: FontFamily.interMedium, fontSize: 12.5 },
  conta: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 14 },
  bag: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  bagHover: { transform: [{ translateY: -1 }, { scale: 1.06 }] },
  bagArte: { width: 46, height: 46 },
  perfil: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2 },
  nome: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700", maxWidth: 180 },
  perfilAtivo: { fontFamily: FontFamily.interMedium, fontSize: 11.5 },
  sair: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 999, borderWidth: 1, paddingVertical: 9, paddingHorizontal: 16 },
  sairTexto: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
});
