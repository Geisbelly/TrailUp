import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { FontFamily } from "@/styles/GlobalStyle";
import { carregarDesafio, responderDesafio } from "@/services/social/guildService";
import {
  placarDoAluno,
  proximaQuestao,
  respostaFoiCompetitiva,
  tentativasPorQuestao,
  type DesafioEmJogo,
  type QuestaoDoDesafio,
  type RespostaDoDesafio,
} from "@/services/social/desafioModel";
import { mensagemDaArena, rotuloDoElo } from "@/services/social/arenaModel";

type Props = {
  visible: boolean;
  desafioId: string | null;
  accent: string;
  profile?: string | null;
  onClose: () => void;
  /** Chamado quando o desafio fecha, para a tela de origem recarregar o chat. */
  onEncerrou?: () => void;
};

function ehBinaria(tipo: string | null): boolean {
  const t = (tipo ?? "").toLowerCase();
  return t.includes("verdadeiro") || t.includes("true") || t === "vf" || t === "booleano";
}

export function DesafioModal({ visible, desafioId, accent, profile, onClose, onEncerrou }: Props) {
  const palette = getProfileShellPalette(profile);
  const [desafio, setDesafio] = useState<DesafioEmJogo | null>(null);
  const [questao, setQuestao] = useState<QuestaoDoDesafio | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resposta, setResposta] = useState("");
  const [restantes, setRestantes] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [encerrado, setEncerrado] = useState<string | null>(null);
  const [segundos, setSegundos] = useState<number | null>(null);
  // O instante em que ESTA questão apareceu. É daqui que sai o `tempo_ms` enviado: o banco
  // não sabe quando a questão foi aberta (está registrado na fase 8), então quem mede é a
  // tela, e o banco só guarda o que recebe.
  const abertaEm = useRef<number>(0);

  const carregar = useCallback(async (): Promise<DesafioEmJogo | null> => {
    if (!desafioId) return null;
    setCarregando(true);
    setAviso(null);
    try {
      const d = await carregarDesafio(desafioId);
      setDesafio(d);
      if (!d) {
        setAviso("Este desafio não está disponível para você.");
        return null;
      }
      if (d.status === "encerrado") {
        setEncerrado("Este desafio já foi encerrado.");
        setQuestao(null);
        return d;
      }
      const prox = proximaQuestao(d);
      setQuestao(prox);
      setRestantes(prox ? tentativasPorQuestao(d) : null);
      setSegundos(prox ? d.params.tempoSeg : null);
      abertaEm.current = Date.now();
      return d;
    } catch (error) {
      console.warn("[Desafio] Falha ao carregar:", error);
      setAviso("Não foi possível abrir o desafio.");
      return null;
    } finally {
      setCarregando(false);
    }
  }, [desafioId]);

  useEffect(() => {
    if (!visible || !desafioId) return;
    setDesafio(null);
    setQuestao(null);
    setResposta("");
    setRestantes(null);
    setEncerrado(null);
    setSegundos(null);
    void carregar();
  }, [visible, desafioId, carregar]);

  // O cronômetro é informativo: o limite de tempo NÃO é cobrado pelo banco (fase 8 — sem
  // registro de "questão aberta em", uma guarda por `created_at` puniria quem abre e responde
  // depois). Chegar a zero não bloqueia a resposta; avisa.
  useEffect(() => {
    if (!visible || segundos === null || segundos <= 0 || !questao) return;
    const timer = setInterval(() => setSegundos((s) => (s === null ? null : Math.max(0, s - 1))), 1000);
    return () => clearInterval(timer);
  }, [visible, segundos, questao]);

  async function enviar(valor: string) {
    if (!desafio || !questao || enviando) return;
    const texto = valor.trim();
    if (!texto) return;
    setEnviando(true);
    setAviso(null);
    try {
      // UMA chamada: `desafio_responder` (20261021_27) olha se existe equipe 2 e despacha.
      const r = await responderDesafio(
        desafio.id,
        questao.questaoId,
        texto,
        Date.now() - abertaEm.current,
        desafio.competitivo,
      );
      // E o ramo segue o RETORNO, não o que esta tela supunha: se o adversário aceitou entre
      // abrir o desafio e enviar a resposta, quem está certo é o banco.
      if (respostaFoiCompetitiva(r, desafio.competitivo)) {
        await aplicarRespostaDaArena(r);
      } else {
        await aplicarRespostaCooperativa(r);
      }
    } catch (error) {
      // A mensagem usa a suposição da tela de propósito: no erro não há retorno para consultar,
      // e os códigos dos dois caminhos não se confundem.
      if (desafio.competitivo) {
        setAviso(mensagemDaArena(error));
        await carregar();
      } else {
        const codigo = String((error as { message?: unknown })?.message ?? error);
        setAviso(
          codigo.includes("sem_tentativas")
            ? "Suas tentativas nesta questão acabaram."
            : codigo.includes("encerrado")
              ? "O desafio foi encerrado."
              : codigo.includes("sem_permissao")
                ? "Você não está neste desafio."
                : "Não foi possível registrar sua resposta.",
        );
        if (codigo.includes("sem_tentativas") || codigo.includes("encerrado")) await carregar();
      }
    } finally {
      setEnviando(false);
    }
  }

  /** Cooperativo: tentativas com feedback, e `encerrou` no próprio retorno. */
  async function aplicarRespostaCooperativa(r: RespostaDoDesafio) {
    setResposta("");
    setRestantes(Number(r.tentativas_restantes ?? 0));

    if (r.encerrou) {
      setEncerrado(
        r.encerrou.resultado === "vitoria"
          ? "Desafio encerrado: vitória!"
          : r.encerrou.resultado === "empate"
            ? "Desafio encerrado: empate."
            : "Desafio encerrado.",
      );
      onEncerrou?.();
    }

    if (r.correta) {
      setAviso("Resposta correta!");
    } else if (Number(r.tentativas_restantes ?? 0) > 0) {
      // Ainda há tentativa: fica na mesma questão, sem recarregar.
      setAviso(`Resposta incorreta. Você ainda tem ${r.tentativas_restantes}.`);
      abertaEm.current = Date.now();
      return;
    } else {
      setAviso("Resposta incorreta.");
    }

    // Recarrega para pegar a próxima questão e o gabarito desta, que o banco só revela
    // depois de existir resposta minha.
    await carregar();
  }

  /**
   * Arena: uma resposta por questão e nenhum `encerrou` no retorno. A partida fecha no banco
   * quando o último aceito responde a última questão; a tela descobre recarregando.
   */
  async function aplicarRespostaDaArena(r: RespostaDoDesafio) {
    setResposta("");
    setRestantes(0);
    setAviso(
      r.registrada === false
        ? "Esta questão já tinha resposta sua."
        : r.correta
          ? "Resposta correta!"
          : "Resposta incorreta.",
    );
    const d = await carregar();
    if (d?.status === "encerrado") {
      setEncerrado("Partida encerrada. O resultado está na Arena.");
      onEncerrou?.();
    }
  }

  const placar = desafio ? placarDoAluno(desafio) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={[s.modal, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
          <View style={[s.header, { borderBottomColor: palette.border }]}>
            <View style={s.heading}>
              <MaterialCommunityIcons name="sword-cross" size={22} color={accent} />
              <View>
                <Text style={[s.title, { color: palette.text }]}>Desafio</Text>
                {desafio ? (
                  <Text style={[s.subtitle, { color: palette.textMuted }]}>
                    {desafio.competitivo ? "Arena · " : ""}
                    {desafio.dificuldade === "dificil" ? "Difícil" : "Normal"} ·{" "}
                    {desafio.consequencia === "treino" ? "Treino" : desafio.consequencia === "evento" ? "Evento" : "Ranqueada"}
                    {placar ? ` · ${placar.respondidas}/${placar.total}` : ""}
                  </Text>
                ) : null}
              </View>
            </View>
            <Pressable accessibilityLabel="Fechar desafio" onPress={onClose}>
              <Text style={[s.close, { color: palette.text }]}>×</Text>
            </Pressable>
          </View>

          {carregando && !desafio ? (
            <ActivityIndicator color={accent} style={s.loader} />
          ) : (
            <ScrollView contentContainerStyle={s.corpo} showsVerticalScrollIndicator={false}>
              {encerrado ? (
                <View style={[s.caixa, { borderColor: accent }]}>
                  <Text style={[s.encerrado, { color: palette.text }]}>{encerrado}</Text>
                  {desafio?.meuElo ? (
                    <Text style={[s.encerrado, { color: desafio.meuElo.delta >= 0 ? "#62db9b" : "#ff9c9c" }]}>
                      {rotuloDoElo(desafio.meuElo)} · agora {desafio.meuElo.ratingDepois}
                    </Text>
                  ) : null}
                  {placar ? (
                    <Text style={[s.subtitle, { color: palette.textMuted }]}>
                      Você acertou {placar.acertos} de {placar.respondidas} respondidas.
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {!encerrado && questao ? (
                <View style={[s.caixa, { borderColor: palette.border }]}>
                  <Text style={[s.ordem, { color: palette.textMuted }]}>
                    QUESTÃO {questao.ordem}
                    {segundos !== null ? ` · ${segundos}s` : ""}
                    {restantes !== null ? ` · ${restantes} ${restantes === 1 ? "tentativa" : "tentativas"}` : ""}
                  </Text>
                  <Text style={[s.enunciado, { color: palette.text }]}>{questao.enunciado}</Text>

                  {ehBinaria(questao.tipo) ? (
                    <View style={s.linha}>
                      {["Verdadeiro", "Falso"].map((opcao) => (
                        <Pressable
                          key={opcao}
                          disabled={enviando}
                          onPress={() => void enviar(opcao)}
                          style={[s.opcao, { borderColor: accent }]}
                        >
                          <Text style={{ color: palette.text }}>{opcao}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : questao.alternativas.length ? (
                    <View style={s.linha}>
                      {questao.alternativas.map((alt) => (
                        <Pressable
                          key={alt}
                          disabled={enviando}
                          onPress={() => void enviar(alt)}
                          style={[s.opcao, { borderColor: accent }]}
                        >
                          <Text style={{ color: palette.text, flexShrink: 1 }}>{alt}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <View style={s.linha}>
                      <TextInput
                        value={resposta}
                        onChangeText={setResposta}
                        onSubmitEditing={() => void enviar(resposta)}
                        placeholder="Digite sua resposta"
                        placeholderTextColor={palette.textMuted}
                        style={[s.input, { color: palette.text, borderColor: palette.border }]}
                      />
                      <Pressable
                        disabled={enviando || !resposta.trim()}
                        onPress={() => void enviar(resposta)}
                        style={[s.enviar, { backgroundColor: resposta.trim() && !enviando ? accent : palette.borderStrong }]}
                      >
                        <MaterialCommunityIcons name="send" size={16} color={palette.background} />
                      </Pressable>
                    </View>
                  )}
                </View>
              ) : null}

              {!encerrado && !questao && desafio ? (
                <View style={[s.caixa, { borderColor: palette.border }]}>
                  <Text style={[s.encerrado, { color: palette.text }]}>Você respondeu tudo.</Text>
                  <Text style={[s.subtitle, { color: palette.textMuted }]}>
                    {desafio.competitivo
                      ? "A partida encerra quando todos responderem (e ninguém estiver com convite pendente)."
                      : "Falta o resto da equipe para o desafio encerrar."}
                  </Text>
                </View>
              ) : null}

              {aviso ? (
                <Text style={[s.aviso, { color: aviso.includes("correta") && !aviso.includes("incorreta") ? "#62db9b" : "#ff9c9c" }]}>
                  {aviso}
                </Text>
              ) : null}

              {desafio?.questoes.some((q) => q.minhaResposta !== null) ? (
                <View style={s.revisao}>
                  <Text style={[s.ordem, { color: palette.textMuted }]}>JÁ RESPONDIDAS</Text>
                  {desafio.questoes
                    .filter((q) => q.minhaResposta !== null)
                    .map((q) => (
                      <View key={q.questaoId} style={[s.revisada, { borderColor: palette.border }]}>
                        <MaterialCommunityIcons
                          name={q.correta ? "check-circle-outline" : "close-circle-outline"}
                          size={16}
                          color={q.correta ? "#62db9b" : "#ff9c9c"}
                        />
                        <View style={s.revisadaInfo}>
                          <Text numberOfLines={2} style={[s.revisadaTexto, { color: palette.text }]}>{q.enunciado}</Text>
                          <Text style={[s.subtitle, { color: palette.textMuted }]}>
                            Você: {q.minhaResposta}
                            {/* O gabarito só vem do banco DEPOIS de haver resposta — ver desafioModel. */}
                            {!q.correta && q.respostaCorreta ? ` · certo: ${q.respostaCorreta}` : ""}
                          </Text>
                        </View>
                      </View>
                    ))}
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  modal: { maxHeight: "88%", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 18, borderBottomWidth: 1 },
  heading: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  title: { fontSize: 16, fontFamily: FontFamily.poppinsExtraBold },
  subtitle: { fontSize: 12, marginTop: 2 },
  close: { fontSize: 26, lineHeight: 26 },
  loader: { marginVertical: 40 },
  corpo: { padding: 18, gap: 14 },
  caixa: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  ordem: { fontSize: 10.5, letterSpacing: 0.8, fontFamily: FontFamily.poppinsExtraBold },
  enunciado: { fontSize: 15, lineHeight: 21 },
  linha: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  opcao: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, maxWidth: "100%" },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  enviar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  aviso: { fontSize: 13, textAlign: "center" },
  encerrado: { fontSize: 15, fontFamily: FontFamily.poppinsExtraBold },
  revisao: { gap: 8 },
  revisada: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 12, padding: 10 },
  revisadaInfo: { flexShrink: 1, gap: 2 },
  revisadaTexto: { fontSize: 13 },
});
