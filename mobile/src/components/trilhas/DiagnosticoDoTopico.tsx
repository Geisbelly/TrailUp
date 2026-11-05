import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";
import {
  AVISO_DO_CARTAO,
  TITULO_DO_CARTAO,
  textoDoNivel,
  type FaseDoDiagnostico,
  type NivelDoDiagnostico,
  type PerguntaDoDiagnostico,
} from "@/services/diagnostico/diagnosticoModel";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

/**
 * Diagnóstico curto antes do tópico (#137). Opcional e sem nota: o cartão avisa isso, "Pular" está sempre à
 * mão, e o resultado só descreve o ponto de partida (sem acertos, sem pontuação). O ícone `lightbulb-question-outline`
 * é só deste cartão (CLAUDE.md, "um ícone, um significado").
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
  const [respondendo, setRespondendo] = useState(false);
  const [indice, setIndice] = useState(0);
  const [escolhas, setEscolhas] = useState<(number | null)[]>([]);
  const [falhou, setFalhou] = useState(false);

  if (fase === "nada") return null;

  const moldura = [s.cartao, { borderColor: palette.border, backgroundColor: palette.surfaceElevated }];

  if (fase === "respondido") {
    return (
      <View style={moldura} accessibilityRole="text" accessibilityLabel={textoDoNivel(nivel)}>
        <MaterialCommunityIcons name="lightbulb-question-outline" size={18} color={palette.accent} />
        <Text style={[s.texto, { color: palette.text }]}>{textoDoNivel(nivel)}</Text>
      </View>
    );
  }

  if (fase === "preparando") {
    return (
      <View style={moldura}>
        <MaterialCommunityIcons name="lightbulb-question-outline" size={18} color={palette.textMuted} />
        <View style={s.coluna}>
          <Text style={[s.titulo, { color: palette.text }]}>{TITULO_DO_CARTAO}</Text>
          <Text style={[s.texto, { color: palette.textMuted }]}>Preparando umas perguntas rápidas sobre este assunto...</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Pular o diagnóstico" onPress={onDispensar} hitSlop={8}>
          <Text style={[s.link, { color: palette.textMuted }]}>Pular</Text>
        </Pressable>
      </View>
    );
  }

  if (!respondendo) {
    return (
      <View style={moldura}>
        <MaterialCommunityIcons name="lightbulb-question-outline" size={18} color={palette.accent} />
        <View style={s.coluna}>
          <Text style={[s.titulo, { color: palette.text }]}>{TITULO_DO_CARTAO}</Text>
          <Text style={[s.texto, { color: palette.textMuted }]}>{AVISO_DO_CARTAO}</Text>
          <View style={s.acoes}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setRespondendo(true)}
              style={[s.botao, { backgroundColor: palette.accent }]}
            >
              <Text style={[s.botaoTexto, { color: palette.background }]}>Responder</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Pular o diagnóstico" onPress={onDispensar} hitSlop={8}>
              <Text style={[s.link, { color: palette.textMuted }]}>Pular</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const pergunta = perguntas[indice];
  if (!pergunta) return null;
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
    <View style={[moldura, s.coluna]}>
      <Text style={[s.pequeno, { color: palette.textMuted }]}>
        {`Pergunta ${indice + 1} de ${perguntas.length}`}
      </Text>
      <Text style={[s.titulo, { color: palette.text }]}>{pergunta.enunciado}</Text>
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
                { borderColor: marcada ? palette.accent : palette.border, backgroundColor: marcada ? palette.accent + "1A" : "transparent" },
              ]}
            >
              <Text style={[s.texto, { color: palette.text }]}>{opcao}</Text>
            </Pressable>
          );
        })}
      </View>
      {falhou ? (
        <Text style={[s.pequeno, { color: palette.textMuted }]}>Não deu para enviar agora. Tente de novo ou pule.</Text>
      ) : null}
      <View style={s.acoes}>
        <Pressable
          accessibilityRole="button"
          disabled={enviando}
          onPress={() => void avancar()}
          style={[s.botao, { backgroundColor: palette.accent, opacity: enviando ? 0.6 : 1 }]}
        >
          <Text style={[s.botaoTexto, { color: palette.background }]}>
            {ultima ? "Enviar" : escolhida == null ? "Pular pergunta" : "Próxima"}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Pular o diagnóstico" onPress={onDispensar} hitSlop={8}>
          <Text style={[s.link, { color: palette.textMuted }]}>Pular tudo</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  cartao: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  coluna: { flex: 1, gap: 6 },
  titulo: { fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 20 },
  texto: { flex: 1, fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 18 },
  pequeno: { fontFamily: FontFamily.interMedium, fontSize: 12, lineHeight: 16 },
  acoes: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 4 },
  botao: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  link: { fontFamily: FontFamily.interMedium, fontSize: 13, textDecorationLine: "underline" },
  opcoes: { gap: 8 },
  opcao: { borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
});
