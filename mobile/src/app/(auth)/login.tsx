import {
  AlertaAuthCelular,
  BotaoAuthCelular,
  CabecaFolhaAuth,
  CampoAuthCelular,
  DivisorAuthCelular,
  MolduraAuthCelular,
  useDigitando,
} from "@/components/auth/AuthCelular";
import { BotaoAuth, CabecaPainelAuth, CampoAuth, COR_AUTH, DivisorAuth, IconeGoogle, MolduraAuthDesktop } from "@/components/web/AuthDesktop";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { app } from "@/constants/definicoes";
import { useDialog } from "@/context/DialogContext";
import { useLoading } from "@/context/LoadingContext";
import { autenticarComGoogle, autenticarUsuario, getAuthErrorMessage, normalizeEmail } from "@/services/auth";
import { dadosDeLoginValidos } from "@/utils/authValidacao";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

type AvisoDeLogin = { tom: "erro" | "aviso"; titulo: string; texto: string };

export default function Login() {
  const router = useRouter();
  const { setLoading } = useLoading();
  const { showDialog } = useDialog();
  const desktop = useDesktopWeb();
  const { digitando, aoFocar, aoDesfocar } = useDigitando();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  // No celular o aviso fica dentro da folha (protótipo mobile-v1); na web larga continua sendo diálogo.
  const [aviso, setAviso] = useState<AvisoDeLogin | null>(null);

  const dadosValidos = dadosDeLoginValidos(email, senha);

  const avisar = (novo: AvisoDeLogin) => {
    if (desktop) {
      showDialog({ title: novo.titulo, description: novo.texto, tone: novo.tom === "erro" ? "error" : "warning" });
      return;
    }
    setAviso(novo);
  };

  const handleLogin = async () => {
    if (!dadosValidos) {
      avisar({ tom: "aviso", titulo: "Dados inválidos", texto: "Preencha os dados corretamente." });
      return;
    }

    try {
      setAviso(null);
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
      avisar({ tom: "erro", titulo: "Erro no login", texto: authMessage });
    } finally {
      setCarregando(false);
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setAviso(null);
      setCarregando(true);
      setLoading(true);
      await autenticarComGoogle();
    } catch (error: unknown) {
      const authMessage = getAuthErrorMessage(error);
      const errorType = error instanceof Error ? error.name : "UnknownError";
      console.warn(`[Login] Falha no Google OAuth (${errorType}).`);
      avisar({ tom: "erro", titulo: "Não foi possível entrar", texto: authMessage });
    } finally {
      setCarregando(false);
      setLoading(false);
    }
  };

  const voltarParaEntrada = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(auth)");
  };

  // Web em tela larga (#346, protótipo v4, 01-login.html): a frase à esquerda e o cartão do formulário à direita.
  if (desktop) {
    return (
      <MolduraAuthDesktop
        titulo="Sua próxima conquista começa aqui."
        texto="Entre para continuar sua trilha. Ela se adapta ao seu jeito de aprender."
      >
        <CabecaPainelAuth titulo="Acesse sua conta" apoio="Continue de onde você parou" />
        <CampoAuth
          rotulo="E-mail"
          icone="mail"
          placeholder="voce@escola.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        <CampoAuth
          rotulo="Senha"
          icone="lock"
          senha
          placeholder="Sua senha"
          value={senha}
          onChangeText={setSenha}
          onSubmitEditing={() => void handleLogin()}
        />
        <View style={styles.esqueciLinha}>
          <Pressable accessibilityRole="link" onPress={() => router.push("/(auth)/recuperarSenha")}>
            <Text style={styles.esqueciTexto}>Esqueci minha senha</Text>
          </Pressable>
        </View>
        <BotaoAuth rotulo={carregando ? "Entrando..." : "Entrar"} onPress={() => void handleLogin()} desativado={!dadosValidos} carregando={carregando} />
        <DivisorAuth />
        <BotaoAuth secundario rotulo="Continuar com Google" icone={<IconeGoogle />} onPress={() => void handleGoogleLogin()} desativado={carregando} />
        <Text style={styles.rodapeLargo}>
          Não tem uma conta?{" "}
          <Text style={styles.rodapeLink} accessibilityRole="link" onPress={() => Linking.openURL(app.siteCadastro)}>
            Cadastre-se ↗
          </Text>
        </Text>
      </MolduraAuthDesktop>
    );
  }

  // Celular (protótipo mobile-v1, 01-login.html): cena em faixa no topo e formulário na folha de baixo.
  return (
    <MolduraAuthCelular
      frase="Sua próxima conquista começa aqui."
      voltar={{ acessibilidade: "Voltar para a entrada", onPress: voltarParaEntrada }}
      compacta={digitando}
    >
      <CabecaFolhaAuth titulo="Acesse sua conta" apoio="Continue de onde você parou" />
      <CampoAuthCelular
        rotulo="E-mail"
        icone="mail"
        placeholder="voce@escola.com"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          if (aviso) setAviso(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        keyboardType="email-address"
        editable={!carregando}
        onFocus={aoFocar}
        onBlur={aoDesfocar}
      />
      <CampoAuthCelular
        rotulo="Senha"
        icone="lock"
        senha
        invalido={aviso?.tom === "erro" && aviso.titulo === "Erro no login"}
        placeholder="Sua senha"
        value={senha}
        onChangeText={(v) => {
          setSenha(v);
          if (aviso) setAviso(null);
        }}
        autoComplete="current-password"
        editable={!carregando}
        onFocus={aoFocar}
        onBlur={aoDesfocar}
        onSubmitEditing={() => void handleLogin()}
      />
      <View style={styles.esqueciCelular}>
        <Pressable accessibilityRole="link" onPress={() => router.push("/(auth)/recuperarSenha")} style={styles.esqueciToque}>
          <Text style={[styles.esqueciTexto, styles.esqueciTextoCelular]}>Esqueci minha senha</Text>
        </Pressable>
      </View>
      {aviso ? <AlertaAuthCelular tom={aviso.tom} titulo={aviso.titulo} texto={aviso.texto} /> : null}
      <BotaoAuthCelular rotulo={carregando ? "Entrando..." : "Entrar"} onPress={() => void handleLogin()} desativado={!dadosValidos} carregando={carregando} />
      {digitando ? null : (
        <>
          <DivisorAuthCelular />
          <BotaoAuthCelular secundario rotulo="Continuar com Google" icone={<IconeGoogle />} onPress={() => void handleGoogleLogin()} desativado={carregando} />
          <View style={styles.rodapeCelular}>
            <Pressable accessibilityRole="link" accessibilityHint="Abre o site do TrailUp no navegador" onPress={() => Linking.openURL(app.siteCadastro)} style={styles.rodapeToque}>
              <Text style={styles.rodapeTextoCelular}>
                Não tem uma conta? <Text style={styles.rodapeLink}>Cadastre-se ↗</Text>
              </Text>
            </Pressable>
            <Text style={styles.rodapeDica}>O cadastro abre no navegador</Text>
          </View>
        </>
      )}
    </MolduraAuthCelular>
  );
}

const styles = StyleSheet.create({
  esqueciLinha: { alignItems: "flex-end", marginTop: -6, marginBottom: 18 },
  esqueciCelular: { alignItems: "flex-end", marginTop: -8, marginBottom: 8 },
  esqueciToque: { minHeight: 48, justifyContent: "center", paddingHorizontal: 2 },
  esqueciTexto: { fontSize: 13, fontWeight: "500", color: COR_AUTH.link },
  esqueciTextoCelular: { fontSize: 14 },
  rodapeLargo: { textAlign: "center", fontSize: 14, color: COR_AUTH.textoMuted, marginTop: 20 },
  rodapeLink: { color: COR_AUTH.link, fontWeight: "600" },
  rodapeCelular: { alignItems: "center", marginTop: 6 },
  rodapeToque: { minHeight: 48, justifyContent: "center" },
  rodapeTextoCelular: { fontSize: 14, color: COR_AUTH.textoMuted, textAlign: "center" },
  rodapeDica: { fontSize: 12, color: COR_AUTH.textoSutil },
});
