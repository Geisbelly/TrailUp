import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { FontFamily } from "@/styles/GlobalStyle";
import { carregarRanksDoEvento, estouNoRank, mudarInscricao } from "@/services/eventos/eventosDaTurma";
import {
  linhasVisiveis,
  mensagemDaInscricao,
  podeMexerNaInscricao,
  type EventoDaTurma,
  type RankDoEvento as Rank,
} from "@/services/eventos/eventoModel";

type Props = {
  evento: EventoDaTurma;
  meuId: string | null;
  accent: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  /** Tela larga: texto um pouco maior, como o resto do cartão. */
  largo?: boolean;
};

/**
 * O rank do evento (#155): opcional, só de quem entra. O botão é discreto de propósito: a #154 pede
 * que nada empurre para a batalha quem não quer, e ficar de fora não custa nota nem XP.
 */
export function RankDoEvento({ evento, meuId, accent, textColor, mutedColor, borderColor, largo }: Props) {
  const [inscrito, setInscrito] = useState<boolean | null>(null);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [mudando, setMudando] = useState(false);
  const podeMexer = podeMexerNaInscricao(evento);

  const carregar = useCallback(async () => {
    try {
      const [estou, lista] = await Promise.all([estouNoRank(evento.id), carregarRanksDoEvento(evento.id, meuId)]);
      setInscrito(estou);
      setRanks(lista);
      setErro(null);
    } catch (e) {
      console.warn("[Evento] Falha ao carregar o rank do evento:", e);
      setErro("Não foi possível carregar o rank do evento.");
    }
  }, [evento.id, meuId]);

  useEffect(() => {
    setInscrito(null);
    void carregar();
  }, [carregar]);

  const alternar = async () => {
    if (inscrito === null || mudando) return;
    setMudando(true);
    setErro(null);
    try {
      await mudarInscricao(evento.id, !inscrito);
      await carregar();
    } catch (e) {
      setErro(mensagemDaInscricao(e));
    } finally {
      setMudando(false);
    }
  };

  const detalhe = [s.detalhe, largo && s.detalheLargo];

  return (
    <View style={[s.caixa, { borderColor }]} accessibilityLabel="Rank do evento">
      <Text style={[s.rotulo, { color: mutedColor }]}>RANK DO EVENTO</Text>
      <Text style={[detalhe, { color: mutedColor }]}>
        {podeMexer
          ? "Opcional: entrar ou ficar de fora não muda sua nota nem seu XP. Dá para sair quando quiser enquanto o evento estiver aberto."
          : "Só aparece quem escolheu entrar."}
      </Text>

      {inscrito === null && !erro ? (
        <ActivityIndicator size="small" color={mutedColor} accessibilityLabel="Carregando o rank do evento" />
      ) : null}

      {podeMexer && inscrito !== null ? (
        <View style={s.linhaBotao}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: mudando, busy: mudando }}
            accessibilityLabel={inscrito ? "Sair do rank do evento" : "Entrar no rank do evento"}
            disabled={mudando}
            onPress={() => void alternar()}
            style={[s.botao, { borderColor: inscrito ? borderColor : accent, opacity: mudando ? 0.6 : 1 }]}
          >
            <Text style={[s.botaoTexto, { color: inscrito ? mutedColor : accent }]}>
              {mudando ? "Um instante…" : inscrito ? "Sair do rank" : "Entrar no rank"}
            </Text>
          </Pressable>
          {inscrito ? <Text style={[detalhe, { color: accent }]}>Você está no rank.</Text> : null}
        </View>
      ) : null}

      {erro ? <Text style={[detalhe, { color: mutedColor }]}>{erro}</Text> : null}

      {inscrito !== null
        ? ranks.map((rank) => {
            const linhas = linhasVisiveis(rank);
            return (
              <View key={rank.rankId} style={s.lista}>
                <Text style={[detalhe, s.negrito, { color: textColor }]}>{rank.nome}</Text>
                {linhas.length === 0 ? (
                  <Text style={[detalhe, { color: mutedColor }]}>Ninguém entrou ainda.</Text>
                ) : (
                  linhas.map((l) => (
                    <View key={l.alunoId} style={s.item}>
                      <Text style={[s.pos, { color: l.eu ? accent : mutedColor }]}>{l.posicao}º</Text>
                      <Text style={[detalhe, s.flex, { color: l.eu ? accent : textColor }]} numberOfLines={1}>
                        {l.eu ? "você" : l.nome}
                      </Text>
                      <Text style={[detalhe, { color: l.eu ? accent : mutedColor }]}>{l.pontos}</Text>
                    </View>
                  ))
                )}
              </View>
            );
          })
        : null}
    </View>
  );
}

const s = StyleSheet.create({
  caixa: { borderTopWidth: 1, paddingTop: 10, gap: 8 },
  rotulo: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 9, letterSpacing: 0.5 },
  detalhe: { fontFamily: FontFamily.interMedium, fontSize: 12, lineHeight: 17 },
  detalheLargo: { fontSize: 13.5, lineHeight: 20 },
  negrito: { fontWeight: "700" },
  linhaBotao: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  botao: { borderWidth: 1, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, minHeight: 36, justifyContent: "center" },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 12.5, fontWeight: "700" },
  lista: { gap: 4 },
  item: { flexDirection: "row", alignItems: "center", gap: 7 },
  pos: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 12, width: 26 },
  flex: { flex: 1, minWidth: 0 },
});
