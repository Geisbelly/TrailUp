import { ICONE_DO_CUIDADO } from "@/components/cuidado/AvisoDeCuidado";
import { useMovimentoReduzido } from "@/hooks/useMovimentoReduzido";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * Técnicas de calma do modo de cuidado (spec 2026-11-20, seção 4). Texto fixo, não gerado: a tela
 * funciona sem IA e sem rede. O Guia pode citá-las; quem as mostra é esta tela.
 */

export type FaseDaRespiracao = "inspira" | "segura" | "solta";

// 4 s inspira, 4 s segura, 6 s solta, 4 ciclos.
export const RESPIRACAO_446: readonly { fase: FaseDaRespiracao; segundos: number }[] = [
  { fase: "inspira", segundos: 4 },
  { fase: "segura", segundos: 4 },
  { fase: "solta", segundos: 6 },
];
export const CICLOS_DA_RESPIRACAO = 4;
const SEGUNDOS_POR_CICLO = RESPIRACAO_446.reduce((soma, passo) => soma + passo.segundos, 0);

export const ROTULO_DA_FASE: Record<FaseDaRespiracao, string> = {
  inspira: "Inspire",
  segura: "Segure",
  solta: "Solte devagar",
};

/** Onde a respiração está depois de `segundos`. `null` quando os 4 ciclos acabaram. */
export function faseDaRespiracao(
  segundos: number,
): { fase: FaseDaRespiracao; ciclo: number; restante: number; duracao: number } | null {
  const s = Math.max(0, Math.floor(segundos));
  if (s >= SEGUNDOS_POR_CICLO * CICLOS_DA_RESPIRACAO) return null;
  const ciclo = Math.floor(s / SEGUNDOS_POR_CICLO) + 1;
  let dentro = s % SEGUNDOS_POR_CICLO;
  for (const passo of RESPIRACAO_446) {
    if (dentro < passo.segundos) {
      return { fase: passo.fase, ciclo, restante: passo.segundos - dentro, duracao: passo.segundos };
    }
    dentro -= passo.segundos;
  }
  return null;
}

export const TECNICAS = {
  respiracao: {
    titulo: "Respiração 4-4-6",
    corpo: "Inspire contando 4, segure contando 4, solte devagar contando 6. São 4 ciclos.",
  },
  aterramento: {
    titulo: "5-4-3-2-1",
    passos: [
      "Cinco coisas que você vê.",
      "Quatro coisas que você toca.",
      "Três coisas que você ouve.",
      "Duas coisas que você cheira.",
      "Uma coisa de que você sente o gosto.",
    ],
  },
  levantar: {
    titulo: "Uma pausa de verdade",
    corpo: "Levante, beba água, volte em 5 minutos.",
  },
  // Texto fixo da spec, para todos: é o único lugar em que o aluno com a IA barrada (menor sem
  // autorização, modo restrito) encontra o CVV, porque o Guia nem aceita a mensagem dele.
  conversar: {
    titulo: "Se precisar conversar com alguém",
    corpo: "CVV 188 (ligação gratuita, 24 h, também por chat em cvv.org.br). Em perigo imediato, SAMU 192.",
  },
} as const;

function Respiracao({ palette }: { palette: ProfileShellPalette }) {
  const reduzido = useMovimentoReduzido();
  const [segundos, setSegundos] = useState<number | null>(null);
  const escala = useRef(new Animated.Value(0.6)).current;
  const agora = segundos == null ? null : faseDaRespiracao(segundos);

  const emCurso = agora != null;
  useEffect(() => {
    if (!emCurso) return;
    const id = setTimeout(() => setSegundos((s) => (s == null ? s : s + 1)), 1000);
    return () => clearTimeout(id);
  }, [emCurso, segundos]);

  const fase = agora?.fase ?? null;
  const ciclo = agora?.ciclo ?? 0;
  useEffect(() => {
    if (fase == null || reduzido) return;
    const passo = RESPIRACAO_446.find((p) => p.fase === fase);
    if (!passo || fase === "segura") return;
    const animacao = Animated.timing(escala, {
      toValue: fase === "inspira" ? 1 : 0.6,
      duration: passo.segundos * 1000,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    animacao.start();
    return () => animacao.stop();
    // `ciclo` reinicia a animação a cada volta, mesmo com a fase igual.
  }, [ciclo, escala, fase, reduzido]);

  const terminou = segundos != null && agora == null;
  return (
    <View style={styles.secao}>
      <Text style={[styles.secaoTitulo, { color: palette.text }]}>{TECNICAS.respiracao.titulo}</Text>
      <Text style={[styles.texto, { color: palette.textMuted }]}>{TECNICAS.respiracao.corpo}</Text>
      <View style={styles.circuloArea}>
        <Animated.View
          style={[
            styles.circulo,
            { backgroundColor: palette.accentSoft, borderColor: palette.accent },
            reduzido ? null : { transform: [{ scale: escala }] },
          ]}
        />
        <View style={styles.circuloTexto} accessibilityLiveRegion="polite">
          <Text style={[styles.fase, { color: palette.text }]}>
            {agora ? ROTULO_DA_FASE[agora.fase] : terminou ? "Pronto." : ""}
          </Text>
          {agora ? (
            <Text style={[styles.texto, { color: palette.textMuted }]}>
              {agora.restante} · ciclo {agora.ciclo} de {CICLOS_DA_RESPIRACAO}
            </Text>
          ) : null}
        </View>
      </View>
      {agora == null ? (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => {
            escala.setValue(0.6);
            setSegundos(0);
          }}
          style={[styles.botao, { borderColor: palette.borderStrong, borderWidth: 1 }]}
        >
          <Text style={[styles.botaoTexto, { color: palette.text }]}>{terminou ? "Respirar de novo" : "Começar"}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

type Props = {
  visivel: boolean;
  palette: ProfileShellPalette;
  onFechar: () => void;
};

export function TecnicasDeCalma({ visivel, palette, onFechar }: Props) {
  if (!visivel) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={onFechar}>
      <View style={[styles.tela, { backgroundColor: palette.background }]}>
        <ScrollView contentContainerStyle={styles.conteudo}>
          <View style={styles.cabecalho}>
            <MaterialCommunityIcons name={ICONE_DO_CUIDADO} size={24} color={palette.accent} />
            <Text style={[styles.titulo, { color: palette.text }]}>Uma pausa</Text>
          </View>
          <Respiracao palette={palette} />
          <View style={[styles.secao, { borderTopColor: palette.border, borderTopWidth: 1 }]}>
            <Text style={[styles.secaoTitulo, { color: palette.text }]}>{TECNICAS.aterramento.titulo}</Text>
            {TECNICAS.aterramento.passos.map((passo) => (
              <Text key={passo} style={[styles.texto, { color: palette.textMuted }]}>
                {passo}
              </Text>
            ))}
          </View>
          <View style={[styles.secao, { borderTopColor: palette.border, borderTopWidth: 1 }]}>
            <Text style={[styles.secaoTitulo, { color: palette.text }]}>{TECNICAS.levantar.titulo}</Text>
            <Text style={[styles.texto, { color: palette.textMuted }]}>{TECNICAS.levantar.corpo}</Text>
          </View>
          <View style={[styles.secao, { borderTopColor: palette.border, borderTopWidth: 1 }]}>
            <Text style={[styles.secaoTitulo, { color: palette.text }]}>{TECNICAS.conversar.titulo}</Text>
            <Text style={[styles.texto, { color: palette.textMuted }]}>{TECNICAS.conversar.corpo}</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onFechar}
            style={[styles.botao, { backgroundColor: palette.accent }]}
          >
            <Text style={[styles.botaoTexto, { color: palette.background }]}>Voltar</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { padding: 24, paddingTop: 56, gap: 20, maxWidth: 560, width: "100%", alignSelf: "center" },
  cabecalho: { flexDirection: "row", alignItems: "center", gap: 10 },
  titulo: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 22 },
  secao: { gap: 8, paddingTop: 16 },
  secaoTitulo: { fontFamily: FontFamily.interMedium, fontSize: 16, fontWeight: "700" },
  texto: { fontFamily: FontFamily.interMedium, fontSize: 15, lineHeight: 22 },
  circuloArea: { height: 200, alignItems: "center", justifyContent: "center" },
  circulo: { position: "absolute", width: 180, height: 180, borderRadius: 90, borderWidth: 2 },
  circuloTexto: { alignItems: "center", gap: 4 },
  fase: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 20 },
  botao: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 15, fontWeight: "700" },
});
