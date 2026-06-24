import { HallBackground } from "@/components/HallTheme";
import React, { useMemo, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useDialog } from "@/context/DialogContext";
import { useUsuario } from "@/context/SessaoContext";
import { supabase } from "@/database/supabase";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";

export default function ResetarSenhaScreen() {
  const { usuario } = useUsuario();
  const { showDialog } = useDialog();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [doneVisible, setDoneVisible] = useState(false);
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfis]
  );

  const solicitarReset = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email;
      if (!email) {
        showDialog({
          title: "Aviso",
          description: "Não foi possível localizar o e-mail da conta.",
          tone: "warning",
        });
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      setConfirmVisible(false);
      setDoneVisible(true);
    } catch (err) {
      console.warn(err);
      showDialog({
        title: "Erro",
        description: "Não foi possível solicitar a troca de senha agora.",
        tone: "error",
      });
    }
  };

  return (
    <View style={[styles.outer, { backgroundColor: palette.background }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} pointerEvents="none">
        <HallBackground palette={palette} />
      </View>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: palette.text }]}>Redefinir senha</Text>
      <Text style={[styles.subtitle, { color: palette.textMuted }]}>
        Enviaremos um e-mail com as instruções para redefinir sua senha. Verifique sua caixa
        de entrada e siga o link recebido.
      </Text>

      <View
        style={[
          styles.card,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.label, { color: palette.text }]}>E-mail da conta</Text>
        <Text style={[styles.value, { color: palette.textMuted }]}>
          {usuario?.email ?? "-"}
        </Text>
      </View>

      <Text style={[styles.stepsTitle, { color: palette.text }]}>Passos</Text>
      <View
        style={[
          styles.list,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.step, { color: palette.textMuted }]}>
          1. Clique em &quot;Solicitar alteração&quot;.
        </Text>
        <Text style={[styles.step, { color: palette.textMuted }]}>
          2. Abra o e-mail enviado e clique no link de redefinição.
        </Text>
        <Text style={[styles.step, { color: palette.textMuted }]}>
          3. Defina sua nova senha na página do Supabase.
        </Text>
      </View>

      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: palette.accent, borderColor: palette.borderStrong },
        ]}
        onPress={() => setConfirmVisible(true)}
      >
        <Text style={styles.buttonText}>Solicitar alteração</Text>
      </TouchableOpacity>

      <Modal
        transparent
        visible={confirmVisible}
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: palette.text }]}>
              Confirmar solicitação
            </Text>
            <Text style={[styles.modalText, { color: palette.textMuted }]}>
              Enviar e-mail de redefinição para {usuario?.email ?? "sua conta"}?
            </Text>
            <View style={styles.modalRow}>
              <TouchableOpacity
                style={[
                  styles.secondaryButton,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}
                onPress={() => setConfirmVisible(false)}
              >
                <Text style={[styles.secondaryText, { color: palette.textMuted }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { backgroundColor: palette.accent, borderColor: palette.borderStrong },
                ]}
                onPress={solicitarReset}
              >
                <Text style={styles.primaryText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={doneVisible}
        animationType="fade"
        onRequestClose={() => setDoneVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: palette.text }]}>E-mail enviado</Text>
            <Text style={[styles.modalText, { color: palette.textMuted }]}>
              Se o e-mail estiver correto, você receberá um link para redefinir a senha.
              Verifique sua caixa de entrada ou spam.
            </Text>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: palette.accent, borderColor: palette.borderStrong },
              ]}
              onPress={() => setDoneVisible(false)}
            >
              <Text style={styles.primaryText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
    gap: 6,
  },
  label: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 15,
  },
  value: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
  },
  stepsTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 15,
  },
  list: {
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: 1,
  },
  step: {
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(3, 7, 18, 0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  modalTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 18,
  },
  modalText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
  },
  modalRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  primaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  primaryText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 15,
    color: "#f8fafc",
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  secondaryText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
  },
});
