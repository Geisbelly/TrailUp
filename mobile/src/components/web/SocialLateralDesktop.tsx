import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Guild } from "@/services/social/guildModel";
import type { SocialSnapshot } from "@/services/social/socialModel";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

/**
 * Coluna da direita do Social na web em tela larga (#346, protótipo v4,
 * 06-social.html): quem está online, os números da rede do aluno e as guildas
 * da turma. Só usa o que o Social do app já carrega. (Evento, Arena e Batalhas
 * do protótipo não têm dado do aluno no app.)
 */
export function SocialLateralDesktop({
  social,
  guildas,
  palette,
  onAbrirGuildas,
}: {
  social: SocialSnapshot | null;
  guildas: Guild[];
  palette: ProfileShellPalette;
  onAbrirGuildas: () => void;
}) {
  const online = social?.friends.filter((p) => p.online).length ?? 0;
  const rede: [string, number][] = [
    ["Amigos", social?.friends.length ?? 0],
    ["Guildas", guildas.filter((g) => g.souMembro).length],
    ["Convites pendentes", social?.incoming.length ?? 0],
    ["Bloqueados", social?.blocked.length ?? 0],
  ];
  const cartao = { backgroundColor: palette.surface, borderColor: palette.border };

  return (
    <View style={s.coluna}>
      <View style={[s.cartao, cartao]}>
        <Text style={[s.titulo, { color: palette.textMuted }]}>ONLINE AGORA</Text>
        <View style={s.linhaOnline}>
          <View style={[s.ponto, { backgroundColor: online ? "#62db9b" : "#90949d" }]} />
          <Text style={[s.texto, { color: palette.text }]}>
            {online === 0 ? "Nenhum amigo online" : online === 1 ? "1 amigo online" : `${online} amigos online`}
          </Text>
        </View>
      </View>

      <View style={[s.cartao, cartao]}>
        <Text style={[s.titulo, { color: palette.textMuted }]}>SUA REDE</Text>
        {rede.map(([rotulo, valor]) => (
          <View key={rotulo} style={[s.linhaRede, { backgroundColor: palette.background, borderColor: palette.border }]}>
            <Text style={[s.texto, { color: palette.text }]}>{rotulo}</Text>
            <Text style={[s.valor, { color: palette.accent }]}>{valor}</Text>
          </View>
        ))}
      </View>

      <View style={[s.cartao, cartao]}>
        <Text style={[s.titulo, { color: palette.textMuted }]}>GUILDAS DA TURMA</Text>
        {guildas.length === 0 ? (
          <Text style={[s.nota, { color: palette.textMuted }]}>Nenhuma guilda criada nesta turma.</Text>
        ) : (
          guildas.map((g) => (
            <View key={g.id} style={s.guilda}>
              <View style={s.guildaTextos}>
                <Text style={[s.guildaNome, { color: palette.text }]} numberOfLines={1}>{g.nome}</Text>
                <Text style={[s.nota, { color: palette.textSubtle }]}>{g.membrosAtivos}/{g.limiteMembros} membros</Text>
              </View>
              {g.souMembro ? (
                <View style={[s.selo, { backgroundColor: palette.accentMuted }]}>
                  <Text style={[s.seloTexto, { color: palette.accent }]}>Sua guilda</Text>
                </View>
              ) : null}
            </View>
          ))
        )}
        <Pressable accessibilityRole="button" onPress={onAbrirGuildas}>
          <Text style={[s.link, { color: palette.accent }]}>{guildas.length ? "Gerenciar guildas →" : "+ Criar guilda"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  coluna: { width: 300, gap: 14 },
  cartao: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  titulo: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },
  texto: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  nota: { fontFamily: FontFamily.interMedium, fontSize: 12, lineHeight: 18 },
  linhaOnline: { flexDirection: "row", alignItems: "center", gap: 8 },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  linhaRede: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1 },
  valor: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
  guilda: { flexDirection: "row", alignItems: "center", gap: 10 },
  guildaTextos: { flex: 1, minWidth: 0 },
  guildaNome: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
  selo: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  seloTexto: { fontFamily: FontFamily.interMedium, fontSize: 10.5, fontWeight: "700" },
  link: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700", marginTop: 2 },
});
