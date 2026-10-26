import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { registrarDataNascimento } from "@/services/consentimentoResponsavelApi";
import { FontFamily } from "@/styles/GlobalStyle";
import type { EstadoConsentimento } from "@/utils/consentimentoResponsavel";
import { parseDataBr } from "@/utils/consentimentoResponsavel";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

// Mascara DD/MM/AAAA sem dependencia nova de date picker.
function mascarar(texto: string): string {
  const d = texto.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export function DataNascimentoForm({
  palette,
  onConcluido,
  onAdiar,
}: {
  palette: ProfileShellPalette;
  onConcluido: (estado: EstadoConsentimento) => void;
  onAdiar?: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const enviar = async () => {
    const iso = parseDataBr(texto);
    if (!iso) {
      setErro("Data inválida. Use o formato DD/MM/AAAA.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const r = await registrarDataNascimento(iso);
    setSalvando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    onConcluido(r.estado);
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: palette.text }]}>Qual é a sua data de nascimento?</Text>
      <Text style={[styles.body, { color: palette.textMuted }]}>
        A lei (LGPD, art. 14) pede autorização de um responsável para tratar dados de quem tem
        menos de 18 anos. Por isso perguntamos uma única vez. A data fica guardada só para você:
        colegas e professores não a veem.
      </Text>
      <Text style={[styles.body, { color: palette.textMuted }]}>
        Enquanto você não informar, o app fica no modo restrito: trilhas, questões e progresso
        funcionam; câmera, análise de emoções, telemetria, mentor de IA e pesquisa ficam desligados.
      </Text>
      <TextInput
        value={texto}
        onChangeText={(v) => {
          setTexto(mascarar(v));
          setErro(null);
        }}
        placeholder="DD/MM/AAAA"
        placeholderTextColor={palette.textSubtle}
        keyboardType="number-pad"
        maxLength={10}
        accessibilityLabel="Data de nascimento"
        style={[styles.input, { color: palette.text, borderColor: palette.borderStrong, backgroundColor: palette.surfaceElevated }]}
      />
      {erro ? <Text style={styles.erro}>{erro}</Text> : null}
      <Text style={[styles.hint, { color: palette.textSubtle }]}>
        Depois de salva, a data só pode ser corrigida pela escola.
      </Text>
      <View style={styles.actions}>
        {onAdiar ? (
          <Pressable
            onPress={onAdiar}
            disabled={salvando}
            accessibilityRole="button"
            style={[styles.button, styles.secondary, { borderColor: palette.border, backgroundColor: palette.surfaceElevated }]}
          >
            <Text style={[styles.buttonText, { color: palette.text }]}>Agora não</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => void enviar()}
          disabled={salvando}
          accessibilityRole="button"
          style={[styles.button, { backgroundColor: palette.accent }, salvando ? styles.disabled : null]}
        >
          <Text style={[styles.buttonText, { color: palette.background }]}>
            {salvando ? "Salvando..." : "Salvar"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  title: { fontFamily: FontFamily.inikaBold, fontSize: 20 },
  body: { fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 21 },
  hint: { fontFamily: FontFamily.interMedium, fontSize: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontFamily: FontFamily.interMedium,
    letterSpacing: 1,
  },
  erro: { color: "#e5484d", fontFamily: FontFamily.interMedium, fontSize: 13 },
  actions: { flexDirection: "row", gap: 12, marginTop: 8 },
  button: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  secondary: { borderWidth: 1 },
  buttonText: { fontFamily: FontFamily.inikaBold, fontSize: 14 },
  disabled: { opacity: 0.7 },
});
