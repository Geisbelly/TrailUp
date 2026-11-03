import { HallBackground } from "@/components/HallTheme";
import { useUsuario } from "@/context/SessaoContext";
import { supabase } from "@/database/supabase";
import { useAviso } from "@/hooks/useAviso";
import { useAcaoDeMoldura } from "@/hooks/useMolduras";
import { FontFamily } from "@/styles/GlobalStyle";
import { perfilVisualDoAluno } from "@/utils/brainHex";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

const pkg = require("../../../../package.json");

// Avaliar o app e reportar um erro (20261103_09): os dois saem pelo mesmo canal de contato do
// pedido de exclusão (`fn_enviar_contato`, e-mail para a equipe), e não por uma loja de
// aplicativos — o app também circula como APK, e quem instalou assim não tem onde avaliar.
// Depois do envio, registra a ação que libera a moldura rara.
const MINIMO_ERRO = 10;

export default function FeedbackScreen() {
  const { tipo } = useLocalSearchParams<{ tipo?: string }>();
  const erro = tipo === "erro";
  const { usuario } = useUsuario();
  const { avisar } = useAviso();
  const acaoDeMoldura = useAcaoDeMoldura();
  const palette = useMemo(() => getProfileShellPalette(perfilVisualDoAluno(usuario)), [usuario]);
  const [nota, setNota] = useState(0);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const pronto = erro ? texto.trim().length >= MINIMO_ERRO : nota > 0;

  async function enviar() {
    if (!pronto || enviando) return;
    setEnviando(true);
    try {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email ?? "";
      const contexto = `Versão ${pkg?.version ?? "?"} · ${Platform.OS}`;
      const { error } = await supabase.rpc("fn_enviar_contato", {
        p_nome: usuario?.nome?.trim() || email || "Aluno",
        p_email: email,
        p_assunto: erro ? "Erro no app" : `Avaliação do app: ${nota} de 5`,
        p_mensagem: erro
          ? `${texto.trim()}\n\n${contexto}`
          : `Nota: ${nota} de 5.${texto.trim() ? `\n\n${texto.trim()}` : ""}\n\n${contexto}`,
      });
      if (error) throw error;
      acaoDeMoldura(erro ? "reportar_erro" : "avaliar_app");
      avisar(erro ? "Erro enviado" : "Obrigado pela avaliação!", erro ? "A equipe vai olhar. Obrigado por avisar." : undefined, "success");
      router.back();
    } catch {
      avisar("Não foi possível enviar", "Tente de novo em alguns minutos.", "error");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={[s.outer, { backgroundColor: palette.background }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: 0.35, pointerEvents: "none" }]}>
        <HallBackground palette={palette} />
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={[s.titulo, { color: palette.text }]}>{erro ? "Reportar um erro" : "Avaliar o TrailUp"}</Text>
        <Text style={[s.ajuda, { color: palette.textMuted }]}>
          {erro
            ? "Conte o que aconteceu e onde: em que tela estava e o que tentou fazer."
            : "De 1 a 5, quanto o TrailUp está ajudando nos seus estudos?"}
        </Text>

        {erro ? null : (
          <View style={s.estrelas} accessibilityRole="radiogroup">
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                accessibilityRole="radio"
                accessibilityState={{ checked: nota === n }}
                accessibilityLabel={`${n} de 5`}
                onPress={() => setNota(n)}
                hitSlop={6}
              >
                <Feather name="star" size={34} color={n <= nota ? palette.accent : palette.border} />
              </Pressable>
            ))}
          </View>
        )}

        <TextInput
          value={texto}
          onChangeText={setTexto}
          multiline
          maxLength={2000}
          placeholder={erro ? "Descreva o erro" : "Quer contar mais? (opcional)"}
          placeholderTextColor={palette.textSubtle}
          accessibilityLabel={erro ? "Descrição do erro" : "Comentário"}
          style={[s.campo, { color: palette.text, borderColor: palette.border, backgroundColor: palette.surfaceElevated }]}
        />

        <Pressable
          accessibilityRole="button"
          disabled={!pronto || enviando}
          onPress={enviar}
          style={[s.botao, { backgroundColor: palette.accent, opacity: pronto ? 1 : 0.5 }]}
        >
          {enviando ? (
            <ActivityIndicator color={palette.background} />
          ) : (
            <Text style={[s.botaoTexto, { color: palette.background }]}>Enviar</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  outer: { flex: 1 },
  content: { padding: 20, gap: 14 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 22 },
  ajuda: { fontFamily: FontFamily.interMedium, fontSize: 14 },
  estrelas: { flexDirection: "row", gap: 10, justifyContent: "center", paddingVertical: 6 },
  campo: { minHeight: 120, borderWidth: 1, borderRadius: 12, padding: 12, fontFamily: FontFamily.interMedium, fontSize: 15, textAlignVertical: "top" },
  botao: { minHeight: 48, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 16 },
});
