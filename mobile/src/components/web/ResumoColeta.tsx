import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useMetricas } from "@/context/MetricasContext";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import { contarSinaisAtivos, descreverTermo, SINAIS_COLETA } from "@/utils/resumoColeta";
import {
  getTelemetryConsentRecord,
  subscribeTelemetryConsentChanges,
  type TelemetryConsentRecord,
} from "@/utils/telemetryConsent";

const LIGADO = "#62db9b";
const PERIGO = "#ff8f8f";

type Atalho = { rotulo: string; onPress: () => void; perigo?: boolean };

/**
 * Coluna ao lado de "Coleta e acessos" nas Configurações da web em tela larga
 * (#346, protótipo v4): o resumo do que está ligado, o que a IA faz com cada
 * sinal e os atalhos para os dados. Acompanha os interruptores ao vivo.
 */
export function ResumoColeta({ palette, atalhos }: { palette: ProfileShellPalette; atalhos: Atalho[] }) {
  const { telemetryPreferences } = useMetricas();
  const [registro, setRegistro] = useState<TelemetryConsentRecord | null>(null);
  useEffect(() => {
    let ativo = true;
    void getTelemetryConsentRecord().then((r) => {
      if (ativo) setRegistro(r);
    });
    const sair = subscribeTelemetryConsentChanges((r) => setRegistro(r));
    return () => {
      ativo = false;
      sair();
    };
  }, []);
  const { ativos, total } = contarSinaisAtivos(telemetryPreferences);
  const termo = descreverTermo(registro);
  const caixa = [s.caixa, { backgroundColor: palette.surface, borderColor: palette.border }];

  return (
    <ScrollView style={s.coluna} contentContainerStyle={s.conteudo} accessibilityLabel="Resumo da coleta">
      <View style={caixa}>
        <Text style={[s.titulo, { color: palette.text }]}>Sua coleta agora</Text>
        <Text style={[s.medidor, { color: palette.textMuted }]}>
          <Text style={[s.numero, { color: palette.accent }]}>{ativos}</Text> de {total} sinais ativos
        </Text>
        <Text style={[s.texto, { color: palette.textMuted }]}>
          A câmera começa desligada para todo mundo e só liga se você ligar. Aceitar o termo não a liga.
        </Text>
        {termo ? <Text style={[s.termo, { color: palette.textSubtle }]}>{termo}</Text> : null}
      </View>

      <View style={caixa}>
        <Text style={[s.titulo, { color: palette.text }]}>O que a IA faz com cada sinal</Text>
        {SINAIS_COLETA.map((sinal) => {
          const ligado = telemetryPreferences[sinal.chave];
          return (
            <View key={sinal.chave} style={s.sinal}>
              <View
                accessibilityLabel={ligado ? "ligado" : "desligado"}
                style={[s.ponto, { backgroundColor: ligado ? LIGADO : palette.inactive }]}
              />
              <View style={s.sinalCopia}>
                <Text style={[s.sinalTitulo, { color: palette.text }]}>{sinal.titulo}</Text>
                <Text style={[s.texto, { color: palette.textMuted }]}>{sinal.usoPelaIa}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={caixa}>
        <Text style={[s.titulo, { color: palette.text }]}>Seus dados</Text>
        {atalhos.map((a) => (
          <Pressable
            key={a.rotulo}
            accessibilityRole="link"
            onPress={a.onPress}
            style={({ hovered }: { hovered?: boolean; pressed: boolean }) => [s.atalho, hovered ? { backgroundColor: palette.surfaceElevated } : null]}
          >
            <Text style={[s.atalhoTexto, { color: a.perigo ? PERIGO : palette.text }]}>{a.rotulo}</Text>
            <Feather name="arrow-right" size={14} color={a.perigo ? PERIGO : palette.textSubtle} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  coluna: { width: 340, flexGrow: 0 },
  conteudo: { gap: 14, paddingTop: 12, paddingBottom: 32, paddingRight: 20 },
  caixa: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 15, marginBottom: 2 },
  medidor: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  numero: { fontFamily: FontFamily.inikaBold, fontSize: 26 },
  texto: { fontFamily: FontFamily.interMedium, fontSize: 12.5, lineHeight: 18 },
  termo: { fontFamily: FontFamily.interMedium, fontSize: 11.5, marginTop: 2 },
  sinal: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 4 },
  ponto: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
  sinalCopia: { flex: 1, gap: 2 },
  sinalTitulo: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
  atalho: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 9, paddingHorizontal: 8, borderRadius: 8 },
  atalhoTexto: { fontFamily: FontFamily.interMedium, fontSize: 13 },
});
