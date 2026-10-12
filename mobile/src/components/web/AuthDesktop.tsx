import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import Svg, { Path } from "react-native-svg";

import { app } from "@/constants/definicoes";

// Cores do login do protótipo v4 (01-login.html), as mesmas do site.
export const COR_AUTH = {
  fundo: "#180f26",
  painel: "#20142fee",
  bordaPainel: "#b496d678",
  campo: "#170f23",
  bordaCampo: "#82669f70",
  placeholder: "#9b87ae",
  texto: "#fbf6ff",
  textoMuted: "#e5d4f3",
  textoSutil: "#b9a6cc",
  primaria: "#ab80dd",
  tintaPrimaria: "#190d27",
  link: "#d5b3ff",
  kicker: "#7fe0d0",
};

const cena = require("@/assets/design/journey-dawn.webp");
const estrela = require("@/assets/design/trailup-star.png");

/**
 * Telas de entrar e de recuperar senha na web em tela larga (#346, protótipo
 * v4, 01-login.html e 02-recuperar-senha.html): a arte em tela cheia, o logo no
 * canto, a frase grande à esquerda e o cartão do formulário à direita.
 */
export function MolduraAuthDesktop({ titulo, texto, children }: { titulo: string; texto: string; children: React.ReactNode }) {
  return (
    <View style={s.tela}>
      <Image source={cena} resizeMode="cover" style={StyleSheet.absoluteFill} accessible={false} />
      <LinearGradient
        colors={["#160e2899", "#160e2833", "#160e2866", "#160e28aa"]}
        locations={[0, 0.45, 0.7, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}
      />
      <ScrollView contentContainerStyle={s.pagina} keyboardShouldPersistTaps="handled">
        <View style={s.marca}>
          <Image source={estrela} style={s.marcaEstrela} resizeMode="contain" accessible={false} />
          <Text style={s.marcaTexto}>{app.name ?? "TrailUp"}</Text>
        </View>
        <View style={s.heroi}>
          <View style={s.kicker}>
            <View style={s.losango} />
            <Text style={s.kickerTexto}>Conhecimento é uma aventura</Text>
          </View>
          <Text accessibilityRole="header" style={s.titulo}>{titulo}</Text>
          <Text style={s.texto}>{texto}</Text>
        </View>
        <View style={s.painel}>{children}</View>
      </ScrollView>
    </View>
  );
}

/** Cabeçalho do cartão: a estrela, o título em versalete e a linha de apoio. */
export function CabecaPainelAuth({ titulo, apoio }: { titulo: string; apoio: string }) {
  return (
    <View style={s.cabeca}>
      <Image source={estrela} style={s.estrela} resizeMode="contain" accessible={false} />
      <Text style={s.tituloPainel}>{titulo}</Text>
      <Text style={s.apoio}>{apoio}</Text>
    </View>
  );
}

/** Campo com rótulo e ícone; `senha` acrescenta o olho para mostrar o texto. */
export function CampoAuth({
  rotulo,
  icone,
  senha,
  ...props
}: { rotulo: string; icone: React.ComponentProps<typeof Feather>["name"]; senha?: boolean } & TextInputProps) {
  const [visivel, setVisivel] = useState(false);
  return (
    <View style={s.campoBloco}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <View style={s.campoLinha}>
        <Feather name={icone} size={16} color={COR_AUTH.placeholder} style={s.campoIcone} />
        <TextInput
          {...props}
          accessibilityLabel={rotulo}
          secureTextEntry={senha && !visivel}
          placeholderTextColor={COR_AUTH.placeholder}
          style={[s.campo, senha && s.campoComOlho]}
        />
        {senha ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visivel ? "Esconder senha" : "Mostrar senha"}
            onPress={() => setVisivel((v) => !v)}
            style={s.olho}
          >
            <Feather name={visivel ? "eye-off" : "eye"} size={17} color="#cebadf" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function BotaoAuth({
  rotulo,
  onPress,
  desativado,
  carregando,
  secundario,
  icone,
}: {
  rotulo: string;
  onPress: () => void;
  desativado?: boolean;
  carregando?: boolean;
  secundario?: boolean;
  icone?: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={desativado || carregando}
      onPress={onPress}
      style={({ hovered }: { hovered?: boolean; pressed: boolean }) => [
        s.botao,
        secundario ? [s.secundario, hovered && { borderColor: COR_AUTH.link }] : s.primario,
        (desativado || carregando) && !secundario ? { opacity: 0.5 } : null,
      ]}
    >
      {carregando ? <ActivityIndicator color={secundario ? COR_AUTH.texto : COR_AUTH.tintaPrimaria} /> : icone}
      <Text style={[s.botaoTexto, { color: secundario ? COR_AUTH.texto : COR_AUTH.tintaPrimaria }]}>{rotulo}</Text>
    </Pressable>
  );
}

export function DivisorAuth() {
  return (
    <View style={s.ou}>
      <View style={s.ouLinha} />
      <Text style={s.ouTexto}>OU</Text>
      <View style={s.ouLinha} />
    </View>
  );
}

/** O "G" do Google, nas cores da marca. */
export function IconeGoogle() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48" accessible={false}>
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: COR_AUTH.fundo },
  pagina: { flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 56, paddingHorizontal: "7%", paddingVertical: 40 },
  marca: { position: "absolute", top: 28, left: "7%", flexDirection: "row", alignItems: "center", gap: 10 },
  marcaEstrela: { width: 34, height: 34 },
  marcaTexto: { fontFamily: "Georgia, serif", fontSize: 24, fontWeight: "700", color: "#fff4ff" },
  heroi: { flex: 1, minWidth: 0, maxWidth: 560 },
  kicker: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 18 },
  losango: { width: 7, height: 7, backgroundColor: COR_AUTH.kicker, transform: [{ rotate: "45deg" }] },
  kickerTexto: { fontSize: 13, fontWeight: "600", color: COR_AUTH.textoMuted },
  titulo: { fontFamily: "Georgia, serif", fontSize: 58, lineHeight: 63, color: "#fff", marginBottom: 18 },
  texto: { fontSize: 17, lineHeight: 27, color: "#f3e8ff", maxWidth: 460 },
  painel: {
    width: 460,
    marginLeft: "auto",
    backgroundColor: COR_AUTH.painel,
    borderColor: COR_AUTH.bordaPainel,
    borderWidth: 1,
    borderRadius: 8,
    paddingTop: 34,
    paddingHorizontal: 34,
    paddingBottom: 28,
  },
  cabeca: { alignItems: "center", marginBottom: 24 },
  estrela: { width: 56, height: 56, marginBottom: 10 },
  tituloPainel: { fontFamily: "Georgia, serif", fontSize: 26, color: COR_AUTH.texto, fontVariant: ["small-caps"], textAlign: "center" },
  apoio: { fontSize: 14, color: COR_AUTH.textoSutil, marginTop: 6, textAlign: "center" },
  campoBloco: { marginBottom: 16 },
  rotulo: { fontSize: 14, fontWeight: "600", color: COR_AUTH.texto, marginBottom: 7 },
  campoLinha: { position: "relative", justifyContent: "center" },
  campoIcone: { position: "absolute", left: 13, zIndex: 1 },
  campo: {
    height: 46,
    paddingLeft: 40,
    paddingRight: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COR_AUTH.bordaCampo,
    backgroundColor: COR_AUTH.campo,
    color: COR_AUTH.texto,
    fontSize: 14,
  },
  campoComOlho: { paddingRight: 46 },
  olho: { position: "absolute", right: 5, width: 36, height: 36, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  botao: { height: 46, borderRadius: 6, borderWidth: 1, borderColor: "transparent", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  primario: { backgroundColor: COR_AUTH.primaria },
  secundario: { backgroundColor: COR_AUTH.campo, borderColor: COR_AUTH.bordaCampo },
  botaoTexto: { fontSize: 15, fontWeight: "600" },
  ou: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 16 },
  ouLinha: { flex: 1, height: 1, backgroundColor: "#82669f55" },
  ouTexto: { fontSize: 12, color: COR_AUTH.textoSutil, letterSpacing: 0.7 },
});
