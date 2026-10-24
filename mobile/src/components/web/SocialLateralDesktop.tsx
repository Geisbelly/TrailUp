import React, { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { GuildIcon } from "@/assets/social/guild-icons";
import { FramedProfileImage } from "@/components/FramedProfileImage";
import { GuildChatModal, type GuildShareOption } from "@/components/social/GuildChatModal";
import { normalizeBrainHexProfile } from "@/constants/profileImages";
import { eventoEmDestaque, rankingDasGuildas, type EventoDaTurma } from "@/services/eventos/eventoModel";
import { carregarEventosDaTurma, carregarGuildasDoEvento } from "@/services/eventos/eventosDaTurma";
import type { Guild } from "@/services/social/guildModel";
import type { SocialSnapshot } from "@/services/social/socialModel";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

/**
 * Coluna da direita do Social na web em tela larga (#346, protótipo v4,
 * 06-social.html): quem está online, a guilda do aluno em destaque, o ranking
 * das guildas no evento (#508), os números da rede e as guildas da turma.
 */
export function SocialLateralDesktop({
  social,
  guildas,
  classeId,
  perfil,
  shareOptions,
  palette,
  onAbrirGuildas,
}: {
  social: SocialSnapshot | null;
  guildas: Guild[];
  classeId: number;
  perfil?: string | null;
  shareOptions: GuildShareOption[];
  palette: ProfileShellPalette;
  onAbrirGuildas: () => void;
}) {
  const minhaGuilda = guildas.find((g) => g.souMembro) ?? null;
  const [chatAberto, setChatAberto] = useState(false);
  const [evento, setEvento] = useState<EventoDaTurma | null>(null);
  const [linhasDoEvento, setLinhasDoEvento] = useState<unknown[]>([]);

  useEffect(() => {
    let ativo = true;
    setEvento(null);
    setLinhasDoEvento([]);
    if (classeId <= 0) return;
    // O mesmo evento que o card principal destaca, e só se ele é de guildas.
    void carregarEventosDaTurma(classeId)
      .then(async (eventos) => {
        const destaque = eventoEmDestaque(eventos);
        if (!ativo || !destaque?.modalidadeGuilda) return;
        setEvento(destaque);
        // O resultado das guildas só existe depois de o evento encerrar (RLS).
        if (destaque.status !== "encerrado") return;
        const linhas = await carregarGuildasDoEvento(destaque.id);
        if (ativo) setLinhasDoEvento(linhas);
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [classeId]);

  const guildasNoEvento = rankingDasGuildas(linhasDoEvento, guildas);
  const amigosOnline = social?.friends.filter((p) => p.online) ?? [];
  const online = amigosOnline.length;
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
          {/* Como no protótipo: os retratos de quem está online (até cinco), antes do total. */}
          {online ? (
            <View style={s.retratos}>
              {amigosOnline.slice(0, 5).map((amigo, i) => (
                <View
                  key={amigo.alunoId}
                  accessibilityLabel={amigo.apelido || amigo.nome}
                  style={[s.retrato, i > 0 && s.retratoSobreposto, { borderColor: "#62db9b", backgroundColor: palette.surfaceElevated }]}
                >
                  <FramedProfileImage
                    profile={normalizeBrainHexProfile(amigo.perfilAtivo)}
                    source={amigo.fotoUrl ? { uri: amigo.fotoUrl } : undefined}
                    size={26}
                  />
                </View>
              ))}
            </View>
          ) : (
            <View style={[s.ponto, { backgroundColor: "#90949d" }]} />
          )}
          <Text style={[s.texto, { color: palette.text }]}>
            {online === 0 ? "Nenhum amigo online" : online === 1 ? "1 amigo online" : `${online} amigos online`}
          </Text>
        </View>
      </View>

      {minhaGuilda ? (
        <View style={[s.cartao, cartao]}>
          <Text style={[s.titulo, { color: palette.textMuted }]}>GUILDA EM DESTAQUE</Text>
          <View style={s.destaque}>
            {minhaGuilda.logoUrl ? (
              <Image source={{ uri: minhaGuilda.logoUrl }} style={s.emblema} />
            ) : (
              <GuildIcon color={palette.accent} size={48} />
            )}
            <Text style={[s.destaqueNome, { color: palette.text }]} numberOfLines={2}>{minhaGuilda.nome}</Text>
            <Text style={[s.nota, s.centro, { color: palette.textSubtle }]}>
              {minhaGuilda.membrosAtivos === 1 ? "1 membro" : `${minhaGuilda.membrosAtivos} membros`}
              {minhaGuilda.modoPerfil === "perfil" && minhaGuilda.perfilAlvo ? ` · ${minhaGuilda.perfilAlvo}` : ""}
            </Text>
            {minhaGuilda.membros.length ? (
              <View style={s.retratos}>
                {minhaGuilda.membros.slice(0, 5).map((membro, i) => (
                  <View
                    key={membro.alunoId}
                    accessibilityLabel={membro.nome}
                    style={[s.retrato, i > 0 && s.retratoSobreposto, { borderColor: palette.surface, backgroundColor: palette.surfaceElevated }]}
                  >
                    <FramedProfileImage
                      profile={normalizeBrainHexProfile(perfil)}
                      source={membro.fotoUrl ? { uri: membro.fotoUrl } : undefined}
                      size={26}
                    />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setChatAberto(true)}
            style={({ hovered }: { hovered?: boolean; pressed: boolean }) => [
              s.botao,
              { borderColor: palette.accent },
              hovered ? { backgroundColor: palette.accentMuted } : null,
            ]}
          >
            <Text style={[s.botaoTexto, { color: palette.accent }]}>Abrir chat da guilda</Text>
          </Pressable>
        </View>
      ) : null}

      {evento ? (
        <View style={[s.cartao, cartao]}>
          <Text style={[s.titulo, { color: palette.textMuted }]}>GUILDAS NO EVENTO</Text>
          {guildasNoEvento.length ? (
            guildasNoEvento.map((g) => (
              <View
                key={g.guildaId}
                style={[
                  s.linhaRede,
                  { backgroundColor: g.minha ? palette.accentMuted : palette.background, borderColor: g.minha ? palette.accent : palette.border },
                ]}
              >
                <Text style={[s.valor, s.posicao, { color: palette.accent }]}>{g.posicao}º</Text>
                <Text style={[s.texto, s.flex, { color: palette.text }]} numberOfLines={1}>{g.nome}</Text>
                {g.minha ? (
                  <View style={[s.selo, { backgroundColor: palette.surface }]}>
                    <Text style={[s.seloTexto, { color: palette.accent }]}>sua</Text>
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            <Text style={[s.nota, { color: palette.textMuted }]}>
              {evento.status === "encerrado" ? "Nenhuma guilda pontuou neste evento." : "O ranking das guildas sai quando o evento encerrar."}
            </Text>
          )}
          <Text style={[s.nota, { color: palette.textSubtle }]}>
            O resultado da guilda existe só dentro do evento e não entra no ranking da turma.
          </Text>
        </View>
      ) : null}

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

      <GuildChatModal
        visible={chatAberto && minhaGuilda !== null}
        guild={minhaGuilda}
        accent={palette.accent}
        profile={perfil ?? null}
        options={shareOptions}
        onClose={() => setChatAberto(false)}
      />
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
  retratos: { flexDirection: "row", alignItems: "center" },
  retrato: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  retratoSobreposto: { marginLeft: -6 },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  linhaRede: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1 },
  valor: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
  guilda: { flexDirection: "row", alignItems: "center", gap: 10 },
  guildaTextos: { flex: 1, minWidth: 0 },
  guildaNome: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
  selo: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  seloTexto: { fontFamily: FontFamily.interMedium, fontSize: 10.5, fontWeight: "700" },
  destaque: { alignItems: "center", gap: 6 },
  emblema: { width: 48, height: 48, borderRadius: 12 },
  destaqueNome: { fontFamily: FontFamily.interMedium, fontSize: 15, fontWeight: "700", textAlign: "center" },
  centro: { textAlign: "center" },
  flex: { flex: 1, minWidth: 0 },
  posicao: { minWidth: 26 },
  botao: { borderWidth: 1, borderRadius: 999, paddingVertical: 9, alignItems: "center" },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
  link: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700", marginTop: 2 },
});
