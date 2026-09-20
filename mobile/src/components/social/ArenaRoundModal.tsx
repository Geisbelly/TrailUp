import {
  alternativasDaQuestao,
  formatarTempo,
  type ArenaQuestao,
  type ArenaRodada,
} from "@/services/social/arenaModel";
import { carregarRodada, mensagemDeErroDaArena, responderQuestao } from "@/services/social/arenaService";
import { FontFamily } from "@/styles/GlobalStyle";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

type Props = { visible: boolean; desafioId: string | null; accent: string; onClose: (mudou: boolean) => void };

/**
 * A rodada, questao a questao.
 *
 * O relogio comeca quando a questao APARECE e para quando o aluno confirma --
 * e a latencia da tentativa, a mesma grandeza que `QuestionActivity` grava em
 * `questao_aluno.tempo_gasto_seg`. Nao e permanencia de telemetria: aqui e o
 * que decide o desempate do modo velocidade.
 */
export function ArenaRoundModal({ visible, desafioId, accent, onClose }: Props) {
  const [rodada, setRodada] = useState<ArenaRodada | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [mudou, setMudou] = useState(false);
  const abertaEmRef = useRef<number | null>(null);

  const pendente: ArenaQuestao | null =
    rodada?.questoes.find((q) => q.minhaResposta === null) ?? null;

  const carregar = useCallback(async () => {
    if (!desafioId) return;
    setCarregando(true);
    setErro(null);
    try {
      setRodada(await carregarRodada(desafioId));
    } catch (caught) {
      console.warn("[Arena] Falha ao carregar rodada:", caught);
      setErro(mensagemDeErroDaArena(caught));
    } finally {
      setCarregando(false);
    }
  }, [desafioId]);

  useEffect(() => {
    if (!visible) return;
    setMudou(false);
    void carregar();
  }, [visible, carregar]);

  // O relogio reinicia a cada questao NOVA, nao a cada render: sem a
  // comparacao de id, qualquer re-render zeraria a medida e todo mundo
  // marcaria tempo perto de zero.
  const idPendente = pendente?.questaoId ?? null;
  useEffect(() => {
    abertaEmRef.current = idPendente === null ? null : Date.now();
    setRascunho("");
  }, [idPendente]);

  function latenciaMs() {
    const abertaEm = abertaEmRef.current;
    if (abertaEm === null) return 0;
    return Math.max(0, Date.now() - abertaEm);
  }

  async function responder(resposta: string) {
    if (!desafioId || !pendente || !resposta.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      await responderQuestao(desafioId, pendente.questaoId, resposta.trim(), latenciaMs());
      setMudou(true);
      await carregar();
    } catch (caught) {
      console.warn("[Arena] Falha ao responder:", caught);
      setErro(mensagemDeErroDaArena(caught));
    } finally {
      setEnviando(false);
    }
  }

  const respondidas = rodada?.questoes.filter((q) => q.minhaResposta !== null) ?? [];
  const opcoes = pendente ? alternativasDaQuestao(pendente.alternativas) : [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => onClose(mudou)}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={[s.kicker, { color: accent }]}>ARENA</Text>
            <Pressable accessibilityLabel="Fechar rodada" onPress={() => onClose(mudou)} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={22} color="#c7c5d2" />
            </Pressable>
          </View>

          {carregando && !rodada ? (
            <ActivityIndicator color={accent} style={s.loader} />
          ) : !rodada ? (
            <Text style={s.aviso}>{erro ?? "Esta rodada não está disponível."}</Text>
          ) : (
            <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
              <Text style={s.progresso}>
                {respondidas.length} de {rodada.questoes.length} respondidas
              </Text>

              {pendente ? (
                <View style={s.card}>
                  <Text style={s.ordem}>QUESTÃO {pendente.ordem}</Text>
                  <Text style={s.enunciado}>{pendente.enunciado}</Text>
                  {opcoes.length > 0 ? (
                    <View style={s.opcoes}>
                      {opcoes.map((opcao) => (
                        <Pressable
                          key={opcao}
                          disabled={enviando}
                          onPress={() => void responder(opcao)}
                          style={[s.opcao, { borderColor: accent }]}
                        >
                          <Text style={s.opcaoTexto}>{opcao}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <View style={s.livre}>
                      <TextInput
                        accessibilityLabel="Sua resposta"
                        value={rascunho}
                        onChangeText={setRascunho}
                        placeholder="Sua resposta"
                        placeholderTextColor="#77758b"
                        style={s.input}
                        editable={!enviando}
                      />
                      <Pressable
                        disabled={enviando || !rascunho.trim()}
                        onPress={() => void responder(rascunho)}
                        style={[s.primary, { backgroundColor: accent, opacity: rascunho.trim() ? 1 : 0.5 }]}
                      >
                        <Text style={s.primaryText}>{enviando ? "..." : "Responder"}</Text>
                      </Pressable>
                    </View>
                  )}
                  {/* A resposta vale de primeira: o banco grava com DO NOTHING,
                      entao nao ha "tentar de novo" num desafio que paga ponto. */}
                  <Text style={s.nota}>A primeira resposta é a que vale.</Text>
                </View>
              ) : (
                <View style={s.card}>
                  <MaterialCommunityIcons name="flag-checkered" size={32} color={accent} />
                  <Text style={s.fim}>Você respondeu tudo.</Text>
                  <Text style={s.nota}>
                    {rodada.status === "encerrado"
                      ? "A rodada está encerrada — o placar já está no card."
                      : "Falta o resto da arena responder. O resultado sai sozinho quando todos terminarem."}
                  </Text>
                </View>
              )}

              {respondidas.length > 0 ? (
                <View style={s.historico}>
                  <Text style={s.historicoTitulo}>SUAS RESPOSTAS</Text>
                  {respondidas.map((q) => (
                    <View key={q.questaoId} style={s.linha}>
                      <MaterialCommunityIcons
                        name={q.correta ? "check-circle" : "close-circle"}
                        size={16}
                        color={q.correta ? "#4ade80" : "#f87171"}
                      />
                      <Text numberOfLines={1} style={s.linhaTexto}>
                        {q.ordem}. {q.minhaResposta}
                      </Text>
                      <Text style={s.linhaTempo}>{formatarTempo(q.tempoMs ?? 0)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {erro ? <Text style={s.erro}>{erro}</Text> : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(4,6,14,.82)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#12111f", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "88%", paddingBottom: 26 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 18 },
  kicker: { fontFamily: FontFamily.inikaBold, fontSize: 12, letterSpacing: 2 },
  loader: { paddingVertical: 50 },
  body: { paddingHorizontal: 18, gap: 14, paddingBottom: 20 },
  progresso: { color: "#9db8ff", fontSize: 12, fontWeight: "700" },
  card: { backgroundColor: "rgba(242,247,250,.07)", borderRadius: 14, padding: 16, gap: 12, alignItems: "center" },
  ordem: { color: "#8f8da3", fontSize: 10, fontWeight: "800", letterSpacing: 1, alignSelf: "flex-start" },
  enunciado: { color: "#f2f7fa", fontFamily: FontFamily.interMedium, fontSize: 15, lineHeight: 22, alignSelf: "stretch" },
  opcoes: { gap: 8, alignSelf: "stretch" },
  opcao: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  opcaoTexto: { color: "#e6e4ef", fontSize: 14 },
  livre: { gap: 10, alignSelf: "stretch" },
  input: { color: "#fff", borderColor: "rgba(242,247,250,.25)", borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11 },
  primary: { alignItems: "center", borderRadius: 10, paddingVertical: 12 },
  primaryText: { color: "#fff", fontFamily: FontFamily.poppinsExtraBold, fontSize: 13 },
  nota: { color: "#8f8da3", fontSize: 11, textAlign: "center" },
  fim: { color: "#f2f7fa", fontFamily: FontFamily.poppinsExtraBold, fontSize: 15 },
  historico: { gap: 7, paddingTop: 6 },
  historicoTitulo: { color: "#8f8da3", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  linha: { flexDirection: "row", alignItems: "center", gap: 8 },
  linhaTexto: { color: "#c7c5d2", fontSize: 12, flex: 1 },
  linhaTempo: { color: "#8f8da3", fontSize: 11 },
  erro: { color: "#f87171", fontSize: 12, textAlign: "center" },
  aviso: { color: "#c7c5d2", fontSize: 13, textAlign: "center", padding: 40 },
});
