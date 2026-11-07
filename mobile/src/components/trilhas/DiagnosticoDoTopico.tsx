import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getGuardianFaceImage } from "@/constants/profileImages";
import { FontFamily } from "@/styles/GlobalStyle";
import {
  AVISO_DO_CARTAO,
  TITULO_DO_CARTAO,
  telaDoDiagnosticoAberta,
  textoDoNivel,
  type FaseDoDiagnostico,
  type NivelDoDiagnostico,
  type PerguntaDoDiagnostico,
} from "@/services/diagnostico/diagnosticoModel";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

/**
 * Diagnóstico curto antes do tópico (#137), numa tela própria que abre sozinha quando o aluno entra no
 * tópico (07/11). Antes era um cartão no meio do material que pedia "Responder" primeiro, e as perguntas
 * apareciam espremidas dentro dele.
 *
 * Continua opcional e sem nota: "Pular" fica no topo o tempo todo, e o resultado só descreve o ponto de
 * partida (sem acertos, sem pontuação). Fechar a tela (voltar do Android, Esc na web) também pula.
 * O ícone `lightbulb-question-outline` é só deste diagnóstico (CLAUDE.md, "um ícone, um significado").
 */
export function DiagnosticoDoTopico({
  fase,
  perguntas,
  nivel,
  enviando,
  onResponder,
  onDispensar,
  palette,
}: {
  fase: FaseDoDiagnostico;
  perguntas: PerguntaDoDiagnostico[];
  nivel: NivelDoDiagnostico | null;
  enviando: boolean;
  onResponder: (escolhas: (number | null)[]) => Promise<boolean>;
  onDispensar: () => void;
  palette: ProfileShellPalette;
}) {
  const [indice, setIndice] = useState(0);
  const [escolhas, setEscolhas] = useState<(number | null)[]>([]);
  const [falhou, setFalhou] = useState(false);
  // Depois do resultado, "Começar o tópico" só fecha a tela: não há nada a gravar.
  const [resultadoVisto, setResultadoVisto] = useState(false);

  const aberta = telaDoDiagnosticoAberta(fase, resultadoVisto);
  const perfil = palette.profile ?? null;

  const fechar = () => {
    if (fase === "respondido") setResultadoVisto(true);
    else onDispensar();
  };

  const pergunta = fase === "pronto" ? perguntas[indice] : undefined;
  const ultima = indice === perguntas.length - 1;
  const escolhida = escolhas[indice] ?? null;

  const avancar = async () => {
    if (!ultima) {
      setIndice(indice + 1);
      return;
    }
    setFalhou(false);
    const ok = await onResponder(escolhas);
    if (!ok) setFalhou(true);
  };

  return (
    <Modal visible={aberta} animationType="slide" presentationStyle="fullScreen" onRequestClose={fechar}>
      <SafeAreaView style={[s.tela, { backgroundColor: palette.background }]}>
        <View style={[s.topo, { borderBottomColor: palette.border }]}>
          <View style={[s.rosto, { borderColor: palette.borderStrong, backgroundColor: palette.surfaceElevated }]}>
            <Image source={getGuardianFaceImage(perfil)} style={s.imagem} accessibilityIgnoresInvertColors />
          </View>
          <View style={s.cabecalho}>
            <Text style={[s.titulo, { color: palette.text }]} accessibilityRole="header">
              {TITULO_DO_CARTAO}
            </Text>
            <Text style={[s.aviso, { color: palette.textMuted }]}>{AVISO_DO_CARTAO}</Text>
          </View>
          {fase !== "respondido" ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Pular o diagnóstico" onPress={onDispensar} hitSlop={12}>
              <Text style={[s.link, { color: palette.textMuted }]}>Pular</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={s.corpo} keyboardShouldPersistTaps="handled">
          {fase === "preparando" ? (
            <View style={s.centro}>
              <ActivityIndicator color={palette.accent} />
              <Text style={[s.texto, s.textoCentro, { color: palette.textMuted }]}>
                Preparando umas perguntas rápidas sobre este assunto...
              </Text>
            </View>
          ) : null}

          {fase === "respondido" ? (
            <View style={s.centro} accessibilityRole="text" accessibilityLabel={textoDoNivel(nivel)}>
              <MaterialCommunityIcons name="lightbulb-question-outline" size={36} color={palette.accent} />
              <Text style={[s.enunciado, s.textoCentro, { color: palette.text }]}>{textoDoNivel(nivel)}</Text>
            </View>
          ) : null}

          {pergunta ? (
            <View style={s.pergunta}>
              <View style={s.progresso} accessibilityLabel={`Pergunta ${indice + 1} de ${perguntas.length}`}>
                {perguntas.map((p, i) => (
                  <View
                    key={p.id}
                    style={[s.traco, { backgroundColor: i <= indice ? palette.accent : palette.border }]}
                  />
                ))}
              </View>
              <Text style={[s.pequeno, { color: palette.textMuted }]}>
                {`Pergunta ${indice + 1} de ${perguntas.length}`}
              </Text>
              <Text style={[s.enunciado, { color: palette.text }]}>{pergunta.enunciado}</Text>
              <View style={s.opcoes} accessibilityRole="radiogroup">
                {pergunta.opcoes.map((opcao, i) => {
                  const marcada = escolhida === i;
                  return (
                    <Pressable
                      key={`${pergunta.id}-${i}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: marcada }}
                      onPress={() => setEscolhas((atuais) => Object.assign([...atuais], { [indice]: i }))}
                      style={[
                        s.opcao,
                        {
                          borderColor: marcada ? palette.accent : palette.border,
                          backgroundColor: marcada ? palette.accent + "1A" : palette.surfaceElevated,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={marcada ? "radiobox-marked" : "radiobox-blank"}
                        size={20}
                        color={marcada ? palette.accent : palette.textMuted}
                      />
                      <Text style={[s.texto, { color: palette.text }]}>{opcao}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {falhou ? (
                <Text style={[s.pequeno, { color: palette.textMuted }]}>Não deu para enviar agora. Tente de novo ou pule.</Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {pergunta || fase === "respondido" ? (
          <View style={[s.rodape, { borderTopColor: palette.border }]}>
            {indice > 0 && fase === "pronto" ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setIndice(indice - 1)}
                style={[s.botao, s.botaoSecundario, { borderColor: palette.border }]}
              >
                <Text style={[s.botaoTexto, { color: palette.text }]}>Voltar</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={enviando}
              onPress={() => (fase === "respondido" ? setResultadoVisto(true) : void avancar())}
              style={[s.botao, s.botaoPrincipal, { backgroundColor: palette.accent, opacity: enviando ? 0.6 : 1 }]}
            >
              {enviando ? (
                <ActivityIndicator color={palette.background} />
              ) : (
                <Text style={[s.botaoTexto, { color: palette.background }]}>
                  {fase === "respondido" ? "Começar o tópico" : ultima ? "Enviar" : escolhida == null ? "Pular pergunta" : "Próxima"}
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1 },
  topo: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  rosto: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  imagem: { width: 40, height: 40, borderRadius: 20 },
  cabecalho: { flex: 1, gap: 2 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 19 },
  aviso: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 18 },
  link: { fontFamily: FontFamily.interMedium, fontSize: 14, textDecorationLine: "underline" },
  corpo: { flexGrow: 1, width: "100%", maxWidth: 640, alignSelf: "center", paddingHorizontal: 20, paddingVertical: 24 },
  centro: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingVertical: 40 },
  pergunta: { gap: 14 },
  progresso: { flexDirection: "row", gap: 6 },
  traco: { flex: 1, height: 4, borderRadius: 2 },
  pequeno: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 18 },
  enunciado: { fontFamily: FontFamily.inikaBold, fontSize: 20, lineHeight: 28 },
  texto: { flex: 1, fontFamily: FontFamily.interMedium, fontSize: 15, lineHeight: 21 },
  textoCentro: { flex: 0, textAlign: "center", maxWidth: 420 },
  opcoes: { gap: 10 },
  opcao: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14 },
  rodape: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1 },
  botao: { minHeight: 48, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  botaoPrincipal: { flex: 1 },
  botaoSecundario: { borderWidth: 1 },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 15, fontWeight: "700" },
});
