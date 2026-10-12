import { HallBackground } from "@/components/HallTheme";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useDialog } from "@/context/DialogContext";
import { useUsuario } from "@/context/SessaoContext";
import { supabase } from "@/database/supabase";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { useEmbutidoConfiguracoes } from "@/context/EmbutidoConfiguracoesContext";
import { ApoioConfig, CartaoConfig, DuasColunasConfig, TextoApoio } from "@/components/web/SecaoConfigDesktop";

export default function ExcluirContaScreen() {
  const embutido = useEmbutidoConfiguracoes();
  const { usuario } = useUsuario();
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const { showDialog } = useDialog();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfilAtivo, usuario?.perfis]
  );

  const handleSolicitar = async () => {
    if (enviando) return;
    setEnviando(true);

    try {
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const email = data.user?.email ?? "";
      const alunoId = data.user?.id ?? null;

      try {
        const { error: rpcError } = await supabase.rpc("fn_enviar_contato", {
          p_nome: email || alunoId || "Usuário",
          p_email: email,
          p_assunto: "Solicitação de exclusão de conta",
          p_mensagem: `Pedido de exclusão da conta${email ? ` (${email})` : ""}. Motivo: ${
            motivo || "Não informado"
          }.`,
        });

        if (rpcError) {
          console.warn("Erro RPC fn_enviar_contato:", rpcError);
        }
      } catch (err) {
        console.warn("Falha ao acionar fn_enviar_contato:", err);
      }

      try {
        const { error: insertError } = await supabase.from("solicitacoes_exclusao").insert({
          aluno_id: alunoId,
          email,
          motivo: motivo || null,
          status: "pendente",
        });

        if (insertError) {
          const code = (insertError as any)?.code;
          if (code !== "PGRST205" && code !== "42P01") {
            console.warn("Erro ao registrar solicitação:", insertError);
          }
        }
      } catch (err) {
        console.warn("Falha ao registrar solicitação (ignorada se a tabela estiver ausente):", err);
      }

      showDialog({
        title: "Solicitação enviada",
        description: "Registramos seu pedido de exclusão. Um e-mail de confirmação será enviado.",
        tone: "success",
      });
      setMotivo("");
    } catch (err) {
      console.warn(err);
      showDialog({
        title: "Erro",
        description: "Não foi possível registrar sua solicitação agora.",
        tone: "error",
      });
    } finally {
      setEnviando(false);
    }
  };

  // Embutida nas Configurações da web em tela larga (#346, protótipo v4): o motivo num cartão, o que saber ao lado.
  if (embutido) {
    return (
      <DuasColunasConfig
        apoio={
          <>
            <ApoioConfig titulo="Antes de pedir" palette={palette}>
              <TextoApoio palette={palette}>
                A exclusão apaga seu progresso, conquistas, Bag e moedas em todas as turmas. Se quiser só parar a coleta de
                dados, use &quot;Coleta e acessos&quot;.
              </TextoApoio>
            </ApoioConfig>
            <ApoioConfig titulo="Seus dados" palette={palette}>
              <TouchableOpacity accessibilityRole="link" onPress={() => router.push("/(tabs)/perfil/relatorio")} style={styles.linkLinha}>
                <Text style={[styles.linkTexto, { color: palette.text }]}>Gerar relatório dos dados</Text>
                <Text style={[styles.linkTexto, { color: palette.textMuted }]}>→</Text>
              </TouchableOpacity>
            </ApoioConfig>
          </>
        }
      >
        <CartaoConfig palette={palette}>
          <Text style={[styles.label, { color: palette.text }]}>Motivo</Text>
          <TextInput
            placeholder="Descreva brevemente o motivo"
            placeholderTextColor={palette.textSubtle}
            style={[styles.input, styles.inputLargo, { color: palette.text, backgroundColor: palette.background, borderColor: palette.border }]}
            multiline
            numberOfLines={4}
            value={motivo}
            onChangeText={setMotivo}
            editable={!enviando}
          />
          <TouchableOpacity
            style={[styles.botaoLargo, { opacity: enviando ? 0.7 : 1 }]}
            onPress={handleSolicitar}
            disabled={enviando}
            accessibilityRole="button"
          >
            <Text style={styles.botaoLargoTexto}>{enviando ? "Enviando..." : "Enviar solicitação"}</Text>
          </TouchableOpacity>
        </CartaoConfig>
      </DuasColunasConfig>
    );
  }

  return (
    <View style={[styles.outer, { backgroundColor: palette.background }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: 0.35, pointerEvents: "none" }]}>
        <HallBackground palette={palette} />
      </View>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {embutido ? null : <Text style={[styles.title, { color: palette.text }]}>Solicitar exclusão da conta</Text>}
      <Text style={[styles.subtitle, { color: palette.textMuted }]}>
        Informe o motivo e confirmaremos a exclusão dos seus dados. Você receberá um e-mail
        para prosseguir.
      </Text>

      <View
        style={[
          styles.card,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.label, { color: palette.text }]}>Motivo</Text>
        <TextInput
          placeholder="Descreva brevemente o motivo"
          placeholderTextColor={palette.textSubtle}
          style={[styles.input, { color: palette.text }]}
          multiline
          numberOfLines={4}
          value={motivo}
          onChangeText={setMotivo}
          editable={!enviando}
        />
      </View>

      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: palette.accent, borderColor: palette.borderStrong },
        ]}
        onPress={handleSolicitar}
        disabled={enviando}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{enviando ? "Enviando..." : "Enviar solicitação"}</Text>
      </TouchableOpacity>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  inputLargo: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, minHeight: 84 },
  botaoLargo: { alignSelf: "flex-end", borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18, backgroundColor: "#d9534f" },
  botaoLargoTexto: { fontFamily: FontFamily.interMedium, fontSize: 13.5, fontWeight: "700", color: "#fff" },
  linkLinha: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  linkTexto: { fontFamily: FontFamily.interMedium, fontSize: 12.5 },
  outer: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  content: {
    paddingVertical: 20,
    gap: 16,
  },
  title: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 20,
  },
  subtitle: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 8,
  },
  label: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 15,
  },
  input: {
    minHeight: 80,
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
  },
  button: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },
  buttonText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 15,
    color: "#f8fafc",
  },
});
