import {
  AlertaAuthCelular,
  BotaoAuthCelular,
  CabecaFolhaAuth,
  CampoAuthCelular,
  MolduraAuthCelular,
  useDigitando,
} from "@/components/auth/AuthCelular";
import { BotaoAuth, CabecaPainelAuth, CampoAuth, COR_AUTH, MolduraAuthDesktop } from "@/components/web/AuthDesktop";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { Feather } from "@expo/vector-icons";
import { useDialog } from "@/context/DialogContext";
import { resetPassword } from "@/services/auth";
import { emailDeRecuperacaoValido } from "@/utils/authValidacao";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function RecuperarSenhaScreen() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();
  const { showDialog } = useDialog();
  const desktop = useDesktopWeb();
  const { digitando, aoFocar, aoDesfocar } = useDigitando();
  // Protótipo v4 e mobile-v1: e-mail inválido avisa na tela e o envio troca o formulário pela confirmação.
  const [estado, setEstado] = useState<"form" | "invalido" | "enviado">("form");

  const emailValido = emailDeRecuperacaoValido(email);

  const enviar = async () => {
    if (!emailValido) {
      setEstado("invalido");
      return;
    }
    setEnviando(true);
    try {
      await resetPassword(email);
      setEstado("enviado");
    } catch (error) {
      showDialog({ title: "Erro ao enviar", description: "Não foi possível enviar o e-mail.", tone: "error" });
      console.error(error);
    } finally {
      setEnviando(false);
    }
  };

  const aoDigitar = (v: string) => {
    setEmail(v);
    if (estado === "invalido") setEstado("form");
  };

  const irParaLogin = () => router.replace("/(auth)/login");

  if (desktop) {
    return (
      <MolduraAuthDesktop
        titulo="Todo caminho tem volta."
        texto="Enviamos um link para você criar uma nova senha e seguir a trilha de onde parou."
      >
        {estado === "enviado" ? (
          <View accessibilityRole="alert" style={styles.feito}>
            <View style={styles.feitoIcone}>
              <Feather name="mail" size={24} color={COR_AUTH.link} />
            </View>
            <Text style={styles.feitoTitulo}>Link enviado</Text>
            <Text style={styles.feitoTexto}>
              Um link de recuperação foi enviado para <Text style={styles.forte}>{email}</Text>. Confira também a caixa de spam.
            </Text>
            <View style={styles.feitoBotao}>
              <BotaoAuth secundario rotulo="Voltar para o login" onPress={irParaLogin} />
            </View>
          </View>
        ) : (
          <>
            <Pressable accessibilityRole="link" onPress={irParaLogin} style={styles.voltar}>
              <Feather name="arrow-left" size={14} color={COR_AUTH.link} />
              <Text style={styles.voltarTexto}>Voltar para o login</Text>
            </Pressable>
            <CabecaPainelAuth titulo="Recuperar senha" apoio="Informe seu e-mail para receber o link de redefinição." />
            <CampoAuth
              rotulo="E-mail"
              icone="mail"
              placeholder="voce@escola.com"
              value={email}
              onChangeText={aoDigitar}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!enviando}
              onSubmitEditing={() => void enviar()}
            />
            {estado === "invalido" ? (
              <View accessibilityRole="alert" style={styles.alerta}>
                <Feather name="alert-triangle" size={16} color="#e0b34d" />
                <View style={styles.alertaTextos}>
                  <Text style={styles.alertaTitulo}>E-mail inválido</Text>
                  <Text style={styles.alertaTexto}>Confira o endereço e tente novamente.</Text>
                </View>
              </View>
            ) : null}
            <BotaoAuth rotulo={enviando ? "Enviando..." : "Enviar link"} carregando={enviando} onPress={() => void enviar()} />
            <Text style={styles.rodapeLargo}>
              Lembrou da senha?{" "}
              <Text style={styles.rodapeLink} accessibilityRole="link" onPress={irParaLogin}>
                Fazer login
              </Text>
            </Text>
          </>
        )}
      </MolduraAuthDesktop>
    );
  }

  // Celular (protótipo mobile-v1, 02-recuperar-senha.html): o "voltar" vira o botão do canto, rotulado "Login".
  return (
    <MolduraAuthCelular
      frase="Todo caminho tem volta."
      voltar={{ rotulo: "Login", acessibilidade: "Voltar para o login", onPress: irParaLogin }}
      compacta={digitando && estado !== "enviado"}
    >
      {estado === "enviado" ? (
        <View accessibilityRole="alert" style={styles.feito}>
          <View style={styles.feitoIcone}>
            <Feather name="mail" size={24} color={COR_AUTH.link} />
          </View>
          <Text style={styles.feitoTitulo}>Link enviado</Text>
          <Text style={styles.feitoTexto}>
            Um link de recuperação foi enviado para <Text style={styles.forte}>{email}</Text>. Confira também a caixa de spam.
          </Text>
          <View style={styles.feitoBotao}>
            <BotaoAuthCelular secundario rotulo="Voltar para o login" onPress={irParaLogin} />
          </View>
        </View>
      ) : (
        <>
          <CabecaFolhaAuth titulo="Recuperar senha" apoio="Informe seu e-mail para receber o link de redefinição." />
          <CampoAuthCelular
            rotulo="E-mail"
            icone="mail"
            placeholder="voce@escola.com"
            value={email}
            onChangeText={aoDigitar}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            invalido={estado === "invalido"}
            editable={!enviando}
            onFocus={aoFocar}
            onBlur={aoDesfocar}
            onSubmitEditing={() => void enviar()}
          />
          {estado === "invalido" ? <AlertaAuthCelular tom="aviso" titulo="E-mail inválido" texto="Confira o endereço e tente novamente." /> : null}
          <BotaoAuthCelular rotulo={enviando ? "Enviando..." : "Enviar link"} carregando={enviando} onPress={() => void enviar()} />
          {digitando ? null : (
            <View style={styles.rodapeCelular}>
              <Pressable accessibilityRole="link" onPress={irParaLogin} style={styles.rodapeToque}>
                <Text style={styles.rodapeTextoCelular}>
                  Lembrou da senha? <Text style={styles.rodapeLink}>Fazer login</Text>
                </Text>
              </Pressable>
            </View>
          )}
        </>
      )}
    </MolduraAuthCelular>
  );
}

const styles = StyleSheet.create({
  voltar: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginBottom: 6 },
  voltarTexto: { fontSize: 13, fontWeight: "600", color: COR_AUTH.link },
  alerta: { flexDirection: "row", gap: 10, padding: 13, borderRadius: 8, borderWidth: 1, borderColor: "#8a6d32", backgroundColor: "#3a2e1a", marginBottom: 14 },
  alertaTextos: { flex: 1, gap: 2 },
  alertaTitulo: { fontSize: 14, fontWeight: "700", color: COR_AUTH.texto },
  alertaTexto: { fontSize: 13, color: "#f3d9e0" },
  rodapeLargo: { textAlign: "center", fontSize: 14, color: COR_AUTH.textoMuted, marginTop: 20 },
  rodapeLink: { color: COR_AUTH.link, fontWeight: "600" },
  rodapeCelular: { alignItems: "center", marginTop: 6 },
  rodapeToque: { minHeight: 48, justifyContent: "center" },
  rodapeTextoCelular: { fontSize: 14, color: COR_AUTH.textoMuted, textAlign: "center" },
  feito: { alignItems: "center", gap: 10, paddingVertical: 8 },
  feitoIcone: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: COR_AUTH.bordaPainel, alignItems: "center", justifyContent: "center" },
  feitoTitulo: { fontFamily: "Georgia, serif", fontSize: 26, color: COR_AUTH.texto, fontVariant: ["small-caps"] },
  feitoTexto: { fontSize: 14, lineHeight: 21, color: COR_AUTH.textoMuted, textAlign: "center" },
  forte: { fontWeight: "700", color: COR_AUTH.texto },
  feitoBotao: { alignSelf: "stretch", marginTop: 10 },
});
