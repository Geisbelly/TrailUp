import { HallBackground, OrnamentDivider } from "@/components/HallTheme";
import { app } from "@/constants/definicoes";
import { useDialog } from "@/context/DialogContext";
import { useLoading } from "@/context/LoadingContext";
import { autenticarComGoogle, autenticarUsuario, getAuthErrorMessage, normalizeEmail } from "@/services/auth";
import { FontFamily } from "@/styles/GlobalStyle";
import { Design } from "@/styles/design";
import { buildProfileShellPaletteFromAccent } from "@/utils/profileShellTheme";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import tinycolor from "tinycolor2";

const AUTH_PALETTE = buildProfileShellPaletteFromAccent(Design.primary, "magica");

export default function Login() {
  const router = useRouter();
  const { setLoading } = useLoading();
  const { showDialog } = useDialog();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  const gold = tinycolor(AUTH_PALETTE.accent).lighten(12).toHexString();
  const goldDim = tinycolor(AUTH_PALETTE.accent).setAlpha(0.55).toRgbString();
  const goldFaint = tinycolor(AUTH_PALETTE.accent).setAlpha(0.1).toRgbString();

  const validarEmail = (valor: string) => {
    const regex =
      /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@(([^<>()[\]\\.,;:\s@"]+\.)+[^<>()[\]\\.,;:\s@"]{2,})$/i;
    return regex.test(valor);
  };

  const emailValido = validarEmail(email);
  const dadosValidos = emailValido && senha.trim().length > 0;

  const handleLogin = async () => {
    if (!dadosValidos) {
      showDialog({
        title: "Dados inválidos",
        description: "Preencha os dados corretamente.",
        tone: "warning",
      });
      return;
    }

    try {
      setCarregando(true);
      setLoading(true);

      await autenticarUsuario(normalizeEmail(email), senha);
      // VerificacaoDeRota cuida do redirect quando usuario é carregado
    } catch (error: any) {
      const authMessage = getAuthErrorMessage(error);
      const errorCode = String(error?.code ?? error?.status ?? "auth_error");
      const errorMessage = String(error?.message ?? "unknown_error");
      if (
        errorCode === "invalid_credentials" ||
        errorMessage.toLowerCase().includes("invalid login credentials")
      ) {
        console.log("[Login] Credenciais inválidas informadas.");
      } else {
        console.warn(`[Login] Falha no login (${errorCode}): ${errorMessage}`);
      }
      showDialog({
        title: "Erro no login",
        description: authMessage,
        tone: "error",
      });
    } finally {
      setCarregando(false);
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setCarregando(true);
      setLoading(true);
      await autenticarComGoogle();
    } catch (error: unknown) {
      showDialog({
        title: "Não foi possível entrar",
        description: getAuthErrorMessage(error),
        tone: "error",
      });
    } finally {
      setCarregando(false);
      setLoading(false);
    }
  };

  return (
    <View style={[styles.outerContainer, { backgroundColor: AUTH_PALETTE.background }]}>
      {/* Fundo do salão */}
      <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
        <HallBackground palette={AUTH_PALETTE} />
      </View>

      {/* Gradiente candelabro */}
      <LinearGradient
        colors={[
          tinycolor(AUTH_PALETTE.accent).setAlpha(0.22).toRgbString(),
          tinycolor(AUTH_PALETTE.accent).setAlpha(0.04).toRgbString(),
          "transparent",
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, { height: "50%", pointerEvents: "none" }]}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {/* Título */}
          <Text style={[styles.appName, { color: "#fff" }]}>
            {app.name}
          </Text>
          <Text style={[styles.title, { color: "rgba(255,255,255,0.78)" }]}>
            Acesse sua conta
          </Text>

          {/* Ornamento */}
          <View style={styles.ornamentRow}>
            <OrnamentDivider color={gold} />
          </View>

          {/* Campos */}
          <View style={styles.containerInputs}>
            <View style={[styles.inputWrapper, { borderColor: goldDim, backgroundColor: AUTH_PALETTE.surfaceElevated }]}>
              <TextInput
                style={[styles.Input, { color: AUTH_PALETTE.text }]}
                placeholder="E-mail"
                placeholderTextColor={AUTH_PALETTE.textSubtle}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
            </View>

            <View style={[styles.inputWrapper, { borderColor: goldDim, backgroundColor: AUTH_PALETTE.surfaceElevated }]}>
              <TextInput
                style={[styles.Input, { color: AUTH_PALETTE.text }]}
                placeholder="Senha"
                placeholderTextColor={AUTH_PALETTE.textSubtle}
                secureTextEntry
                value={senha}
                onChangeText={setSenha}
              />
            </View>
          </View>

          {/* Botão principal */}
          <TouchableOpacity
            style={[
              styles.button,
              dadosValidos
                ? { backgroundColor: Design.primary, borderColor: gold }
                : { backgroundColor: goldFaint, borderColor: goldDim },
            ]}
            onPress={handleLogin}
            disabled={!dadosValidos || carregando}
            accessibilityRole="button"
            accessibilityLabel="Entrar"
          >
            <Text style={[styles.buttonText, { color: dadosValidos ? Design.ink : AUTH_PALETTE.textSubtle }]}>
              {carregando ? "Entrando..." : "Entrar"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.googleButton, { borderColor: goldDim, backgroundColor: AUTH_PALETTE.surfaceElevated }]}
            onPress={handleGoogleLogin}
            disabled={carregando}
            accessibilityRole="button"
            accessibilityLabel="Entrar com Google"
          >
            <Text style={[styles.googleButtonText, { color: AUTH_PALETTE.text }]}>Entrar com Google</Text>
          </TouchableOpacity>

          {/* Link recuperar senha */}
          <View style={styles.linkContainer}>
            <Text style={[styles.boldText, { color: AUTH_PALETTE.textMuted }]}>Esqueceu a senha? </Text>
            <TouchableOpacity
              onPress={() => router.push("/(auth)/recuperarSenha")}
              accessibilityRole="link"
              accessibilityLabel="Recuperar senha"
            >
              <Text style={[styles.linkText, { color: gold }]}>Recuperar senha</Text>
            </TouchableOpacity>
          </View>

          {/* Rodapé */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: AUTH_PALETTE.textSubtle }]}>
              Não tem uma conta?{" "}
              <Text
                style={[styles.footerLink, { color: gold }]}
                onPress={() => Linking.openURL(app.siteCadastro)}
                accessibilityRole="link"
                accessibilityLabel="Cadastre-se"
              >
                Cadastre-se.
              </Text>
            </Text>
          </View>
        </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 32,
  },
  appName: {
    marginBottom: 4,
    fontSize: 36,
    fontFamily: FontFamily.inknutAntiquaMedium,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  title: {
    fontSize: 18,
    fontFamily: FontFamily.inikaBold,
    marginBottom: 2,
    textAlign: "center",
    letterSpacing: 0,
  },
  ornamentRow: {
    width: "100%",
    marginVertical: 12,
  },
  containerInputs: {
    width: "100%",
    gap: 14,
    marginBottom: 6,
  },
  inputWrapper: {
    width: "100%",
    borderRadius: Design.radius,
    borderWidth: 1,
    overflow: "hidden",
  },
  Input: {
    height: 50,
    fontSize: 14,
    fontFamily: FontFamily.interMedium,
    paddingHorizontal: 16,
  },
  button: {
    width: "100%",
    height: 52,
    marginTop: 18,
    borderRadius: Design.radius,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: FontFamily.inknutAntiquaMedium,
    letterSpacing: 0,
  },
  googleButton: {
    width: "100%",
    height: 52,
    marginTop: 12,
    borderRadius: Design.radius,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: FontFamily.inknutAntiquaMedium,
  },
  linkContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 18,
  },
  boldText: {
    fontSize: 13,
    fontFamily: FontFamily.inknutAntiquaMedium,
    fontWeight: "bold",
  },
  linkText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: FontFamily.inknutAntiquaMedium,
    textDecorationLine: "underline",
  },
  footer: {
    marginTop: 36,
    alignItems: "center",
  },
  footerText: {
    fontSize: 12,
    fontFamily: FontFamily.inknutAntiquaMedium,
  },
  footerLink: {
    fontFamily: FontFamily.inknutAntiquaMedium,
    textDecorationLine: "underline",
  },
});
