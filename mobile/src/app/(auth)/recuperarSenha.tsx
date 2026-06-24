import { HallBackground, OrnamentDivider } from "@/components/HallTheme";
import { app } from "@/constants/definicoes";
import { useDialog } from "@/context/DialogContext";
import { resetPassword } from "@/services/auth";
import { FontFamily } from "@/styles/GlobalStyle";
import { buildProfileShellPaletteFromAccent } from "@/utils/profileShellTheme";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import tinycolor from "tinycolor2";

// Paleta estática para telas de autenticação — roxo místico
const AUTH_PALETTE = buildProfileShellPaletteFromAccent("#6366f1", "magica");

export default function RecuperarSenhaScreen() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();
  const { showDialog } = useDialog();
  const insets = useSafeAreaInsets();

  const gold = tinycolor(AUTH_PALETTE.accent).lighten(12).toHexString();
  const goldDim = tinycolor(AUTH_PALETTE.accent).setAlpha(0.55).toRgbString();
  const goldFaint = tinycolor(AUTH_PALETTE.accent).setAlpha(0.1).toRgbString();

  const validarEmail = (valor: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
  const emailValido = validarEmail(email);

  const handleReset = async () => {
    if (!emailValido) {
      showDialog({ title: "E-mail inválido", description: "Digite um e-mail válido.", tone: "warning" });
      return;
    }
    setEnviando(true);
    try {
      await resetPassword(email);
      showDialog({
        title: "Link enviado",
        description: "Um link de recuperação foi enviado para seu e-mail.",
        tone: "success",
      });
      router.back();
    } catch (error) {
      showDialog({ title: "Erro ao enviar", description: "Não foi possível enviar o e-mail.", tone: "error" });
      console.error(error);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.outer, { backgroundColor: AUTH_PALETTE.background }]}>
        {/* Fundo do salão */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <HallBackground palette={AUTH_PALETTE} />
        </View>

        {/* Gradiente candelabro */}
        <LinearGradient
          colors={[
            tinycolor(AUTH_PALETTE.accent).setAlpha(0.22).toRgbString(),
            "transparent",
          ]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[StyleSheet.absoluteFill, { height: "45%" }]}
          pointerEvents="none"
        />

        <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
          {/* Título */}
          <Text style={[styles.appTitle, { color: "#fff" }]}>
            — {app.name.toUpperCase()} —
          </Text>

          <View style={styles.ornamentRow}>
            <OrnamentDivider color={gold} />
          </View>

          <Text style={[styles.title, { color: AUTH_PALETTE.text }]}>Recuperar Senha</Text>
          <Text style={[styles.subtitle, { color: AUTH_PALETTE.textMuted }]}>
            Informe seu e-mail para receber o link de redefinição.
          </Text>

          {/* Input */}
          <View
            style={[
              styles.inputWrap,
              {
                backgroundColor: AUTH_PALETTE.surfaceElevated,
                borderColor: goldDim,
              },
            ]}
          >
            <TextInput
              style={[styles.input, { color: AUTH_PALETTE.text }]}
              placeholder="Digite seu e-mail"
              placeholderTextColor={AUTH_PALETTE.textSubtle}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          {/* Botão */}
          <TouchableOpacity
            style={[
              styles.button,
              emailValido
                ? { backgroundColor: tinycolor(AUTH_PALETTE.accent).darken(5).toHexString(), borderColor: gold }
                : { backgroundColor: goldFaint, borderColor: goldDim },
            ]}
            disabled={!emailValido || enviando}
            onPress={handleReset}
          >
            <Text style={[styles.buttonText, { color: emailValido ? "#fff" : AUTH_PALETTE.textMuted }]}>
              {enviando ? "Enviando..." : "Enviar Link"}
            </Text>
          </TouchableOpacity>

          {/* Link de login */}
          <View style={styles.linkRow}>
            <Text style={[styles.linkText, { color: AUTH_PALETTE.textMuted }]}>Lembrou da senha? </Text>
            <TouchableOpacity onPress={() => router.push("/(auth)/login")}>
              <Text style={[styles.linkAction, { color: gold }]}>Fazer login</Text>
            </TouchableOpacity>
          </View>

          {/* Rodapé */}
          <View style={[styles.footer, { bottom: 16 + insets.bottom }]}>
            <Text style={[styles.footerText, { color: AUTH_PALETTE.textSubtle }]}>
              Não tem uma conta?{" "}
              <Text
                style={{ color: gold, textDecorationLine: "underline" }}
                onPress={() => Linking.openURL(app.siteCadastro)}
              >
                Cadastre-se.
              </Text>
            </Text>
          </View>
        </SafeAreaView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1 },
  safe: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  appTitle: {
    fontSize: 34,
    fontFamily: FontFamily.inknutAntiquaMedium,
    letterSpacing: 3,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    marginBottom: 8,
  },
  ornamentRow: {
    opacity: 0.7,
    marginVertical: 10,
    alignSelf: "stretch",
  },
  title: {
    fontSize: 22,
    fontFamily: FontFamily.inknutAntiquaMedium,
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    fontFamily: FontFamily.interMedium,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  inputWrap: {
    width: "100%",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  input: {
    fontFamily: FontFamily.interMedium,
    fontSize: 15,
    paddingVertical: 13,
  },
  button: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    marginBottom: 18,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: FontFamily.inikaBold,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  linkText: {
    fontSize: 13,
    fontFamily: FontFamily.interMedium,
  },
  linkAction: {
    fontSize: 13,
    fontFamily: FontFamily.inikaBold,
    textDecorationLine: "underline",
  },
  footer: {
    position: "absolute",
    bottom: 24,
  },
  footerText: {
    fontSize: 12,
    fontFamily: FontFamily.interMedium,
    textAlign: "center",
  },
});
