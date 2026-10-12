import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, View } from "react-native";

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
};

/**
 * Barra superior da web em tela larga (#346), como no protótipo v4: marca à
 * esquerda; à direita a Bag (arte do perfil ativo) antes do avatar, que leva ao Perfil.
 */
export function DesktopTopBar({ palette, nome, perfilAtivo, foto }: Props) {
  const router = useRouter();
  const { classeAtual } = useTrilha();
  const [bagAberta, setBagAberta] = useState(false);
  const perfil = normalizeBrainHexProfile(perfilAtivo) ?? "conqueror";
  const rotuloPerfil = perfilAtivo ? perfilAtivo.charAt(0).toUpperCase() + perfilAtivo.slice(1) : "";

  return (
    <View style={[s.barra, { backgroundColor: palette.surface, borderBottomColor: palette.border }]}>
      <Pressable accessibilityRole="link" accessibilityLabel="Ir para a Trilha" onPress={() => router.push("/")} style={s.marca}>
        <Image source={designStar} style={s.logo} resizeMode="contain" />
        <Text style={[s.nomeMarca, { color: palette.text }]}>TrailUp</Text>
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
          <Image source={foto} style={[s.avatar, { borderColor: palette.accent }]} />
          <View>
            <Text style={[s.nome, { color: palette.text }]} numberOfLines={1}>{nome}</Text>
            {rotuloPerfil ? <Text style={[s.perfilAtivo, { color: palette.textSubtle }]}>{rotuloPerfil}</Text> : null}
          </View>
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
});
