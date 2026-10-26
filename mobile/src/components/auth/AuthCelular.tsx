import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { app } from "@/constants/definicoes";
import { COR_AUTH } from "@/components/web/AuthDesktop";

// Telas de entrar e de recuperar senha no celular (mobile-v1, parte 1): a cena da floresta em faixa
// no topo e o formulário numa folha que sobe de baixo. A web larga usa `web/AuthDesktop.tsx`.

const cena = require("@/assets/design/journey-dawn.webp");
const estrela = require("@/assets/design/trailup-star.png");

const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, serif" });
const ALTURA_CENA_COM_TECLADO = 72;
// A folha sobe 24px por cima da cena, para o canto arredondado não deixar um vão.
const SOBREPOSICAO = 24;

/**
 * Sabe se o aluno está digitando. Vale por foco (não por evento de teclado) para funcionar igual na
 * web estreita; o atraso na saída evita a cena piscar ao pular de um campo para o outro.
 */
export function useDigitando() {
  const [digitando, setDigitando] = useState(false);
  const saida = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (saida.current) clearTimeout(saida.current);
  }, []);
  return {
    digitando,
    aoFocar: () => {
      if (saida.current) clearTimeout(saida.current);
      setDigitando(true);
    },
    aoDesfocar: () => {
      if (saida.current) clearTimeout(saida.current);
      saida.current = setTimeout(() => setDigitando(false), 120);
    },
  };
}

function useMovimentoReduzido(): boolean {
  const [reduzido, setReduzido] = useState(false);
  useEffect(() => {
    let vivo = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => vivo && setReduzido(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduzido);
    return () => {
      vivo = false;
      sub.remove();
    };
  }, []);
  return reduzido;
}

// Posições fixas (em %) sobre as áreas claras da arte, como no protótipo.
const VAGALUMES: [number, number, number][] = [
  [30, 62, 0],
  [42, 48, 1100],
  [50, 70, 2300],
  [58, 40, 600],
  [66, 58, 1800],
  [36, 78, 2900],
  [72, 46, 300],
  [54, 82, 1500],
];

function Vagalume({ x, y, atraso, pausado }: { x: number; y: number; atraso: number; pausado: boolean }) {
  const brilho = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (pausado) {
      brilho.setValue(0);
      return;
    }
    const laco = Animated.loop(
      Animated.sequence([
        Animated.delay(atraso),
        Animated.timing(brilho, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(brilho, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
      ]),
    );
    laco.start();
    return () => laco.stop();
  }, [atraso, brilho, pausado]);
  return <Animated.View pointerEvents="none" style={[s.vagalume, { left: `${x}%`, top: `${y}%`, opacity: brilho }]} />;
}

function Vagalumes({ pausado }: { pausado: boolean }) {
  const reduzido = useMovimentoReduzido();
  if (reduzido) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {VAGALUMES.map(([x, y, atraso]) => (
        <Vagalume key={`${x}-${y}`} x={x} y={y} atraso={atraso} pausado={pausado} />
      ))}
    </View>
  );
}

/**
 * Cena no topo (~31% da altura) com a frase sobre ela, e o conteúdo numa folha de baixo. Com o
 * teclado aberto (`compacta`) a cena encolhe para uma faixa só com a marca e a natureza pausa.
 */
export function MolduraAuthCelular({
  frase,
  voltar,
  compacta,
  children,
}: {
  frase: string;
  voltar: { rotulo?: string; acessibilidade: string; onPress: () => void };
  compacta: boolean;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const alturaCena = compacta ? insets.top + ALTURA_CENA_COM_TECLADO : Math.round(height * 0.31) + 28 + insets.top;

  return (
    <View style={s.tela}>
      <View style={[s.cena, { height: alturaCena }]}>
        <Image source={cena} resizeMode="cover" style={StyleSheet.absoluteFill} accessible={false} />
        <LinearGradient colors={["#160e2866", "#160e2800", "#180f26cc"]} locations={[0, 0.5, 1]} style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]} />
        <Vagalumes pausado={compacta} />
        <View style={[s.topo, { top: insets.top + 6 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={voltar.acessibilidade}
            onPress={voltar.onPress}
            hitSlop={4}
            style={s.voltar}
          >
            <Feather name="chevron-left" size={22} color="#fff" />
            {voltar.rotulo ? <Text style={s.voltarTexto}>{voltar.rotulo}</Text> : null}
          </Pressable>
          <View style={s.marca}>
            <Image source={estrela} style={s.marcaEstrela} resizeMode="contain" accessible={false} />
            <Text style={s.marcaTexto}>{app.name ?? "TrailUp"}</Text>
          </View>
        </View>
        {compacta ? null : (
          <View style={s.heroi}>
            <Text accessibilityRole="header" style={s.heroiTitulo}>{frase}</Text>
          </View>
        )}
      </View>

      <KeyboardAvoidingView style={[s.folhaBase, { paddingTop: alturaCena - SOBREPOSICAO }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.folha}>
          <View style={s.alca} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[s.folhaConteudo, { paddingBottom: insets.bottom + 18 }]}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Estrela, título em versalete e a linha de apoio, no alto da folha. */
export function CabecaFolhaAuth({ titulo, apoio }: { titulo: string; apoio: string }) {
  return (
    <View style={s.cabeca}>
      <Image source={estrela} style={s.estrela} resizeMode="contain" accessible={false} />
      <Text accessibilityRole="header" style={s.tituloFolha}>{titulo}</Text>
      <Text style={s.apoio}>{apoio}</Text>
    </View>
  );
}

/** Campo de 52px com fonte de 16 (abaixo disso o iOS dá zoom ao focar); `senha` acrescenta o olho de 48px. */
export function CampoAuthCelular({
  rotulo,
  icone,
  senha,
  invalido,
  onFocus,
  onBlur,
  ...props
}: { rotulo: string; icone: React.ComponentProps<typeof Feather>["name"]; senha?: boolean; invalido?: boolean } & TextInputProps) {
  const [visivel, setVisivel] = useState(false);
  const [focado, setFocado] = useState(false);
  return (
    <View style={s.campoBloco}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <View style={s.campoLinha}>
        <Feather name={icone} size={18} color={COR_AUTH.placeholder} style={s.campoIcone} />
        <TextInput
          {...props}
          accessibilityLabel={rotulo}
          secureTextEntry={senha && !visivel}
          placeholderTextColor={COR_AUTH.placeholder}
          onFocus={(e) => {
            setFocado(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocado(false);
            onBlur?.(e);
          }}
          style={[s.campo, senha && s.campoComOlho, focado && s.campoFocado, invalido && s.campoInvalido, props.editable === false && { opacity: 0.7 }]}
        />
        {senha ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visivel ? "Ocultar senha" : "Mostrar senha"}
            onPress={() => setVisivel((v) => !v)}
            style={s.olho}
          >
            <Feather name={visivel ? "eye-off" : "eye"} size={19} color="#cebadf" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function BotaoAuthCelular({
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
      accessibilityState={{ disabled: !!(desativado || carregando), busy: !!carregando }}
      disabled={desativado || carregando}
      onPress={onPress}
      style={[s.botao, secundario ? s.secundario : s.primario, (desativado || carregando) && !secundario ? { opacity: 0.5 } : null]}
    >
      {carregando ? <ActivityIndicator color={secundario ? COR_AUTH.texto : COR_AUTH.tintaPrimaria} /> : icone}
      <Text style={[s.botaoTexto, { color: secundario ? COR_AUTH.texto : COR_AUTH.tintaPrimaria }]}>{rotulo}</Text>
    </Pressable>
  );
}

/** Aviso dentro da folha: vermelho para erro, âmbar para dado que o aluno pode corrigir. */
export function AlertaAuthCelular({ tom, titulo, texto }: { tom: "erro" | "aviso"; titulo: string; texto: string }) {
  const aviso = tom === "aviso";
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[s.alerta, aviso ? s.alertaAviso : s.alertaErro]}>
      <Feather name="alert-circle" size={18} color={aviso ? "#e0b34d" : "#f0847c"} style={{ marginTop: 1 }} />
      <View style={s.alertaTextos}>
        <Text style={s.alertaTitulo}>{titulo}</Text>
        <Text style={s.alertaTexto}>{texto}</Text>
      </View>
    </View>
  );
}

export function DivisorAuthCelular() {
  return (
    <View style={s.ou}>
      <View style={s.ouLinha} />
      <Text style={s.ouTexto}>OU</Text>
      <View style={s.ouLinha} />
    </View>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: COR_AUTH.fundo },
  cena: { position: "absolute", left: 0, right: 0, top: 0, overflow: "hidden", backgroundColor: COR_AUTH.fundo },
  topo: { position: "absolute", left: 0, right: 0, zIndex: 5, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
  voltar: { minWidth: 48, height: 48, flexDirection: "row", alignItems: "center", gap: 2, paddingLeft: 6, paddingRight: 12, borderRadius: 24, backgroundColor: "#160e2855" },
  voltarTexto: { fontSize: 15, fontWeight: "600", color: "#fff" },
  marca: { marginLeft: "auto", marginRight: 6, flexDirection: "row", alignItems: "center", gap: 8 },
  marcaEstrela: { width: 26, height: 26 },
  marcaTexto: { fontFamily: SERIF, fontSize: 19, fontWeight: "700", color: "#fff4ff" },
  heroi: { position: "absolute", left: 24, right: 24, bottom: 14 + SOBREPOSICAO, zIndex: 5 },
  heroiTitulo: { fontFamily: SERIF, fontSize: 28, lineHeight: 32, color: "#fff" },
  vagalume: { position: "absolute", width: 4, height: 4, borderRadius: 2, backgroundColor: "#ffe9a3", shadowColor: "#ffc94c", shadowOpacity: 0.55, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
  folhaBase: { flex: 1, justifyContent: "flex-end" },
  folha: {
    flex: 1,
    marginTop: 0,
    backgroundColor: "#20142ff2",
    borderTopWidth: 1,
    borderColor: COR_AUTH.bordaPainel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  alca: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#b496d655", alignSelf: "center", marginTop: 10, marginBottom: 10 },
  folhaConteudo: { paddingHorizontal: 22, flexGrow: 1 },
  cabeca: { alignItems: "center", marginBottom: 14 },
  estrela: { width: 34, height: 34, marginBottom: 4 },
  tituloFolha: { fontFamily: SERIF, fontSize: 23, color: COR_AUTH.texto, fontVariant: ["small-caps"], textAlign: "center" },
  apoio: { fontSize: 14, color: COR_AUTH.textoSutil, marginTop: 2, textAlign: "center" },
  campoBloco: { marginBottom: 14 },
  rotulo: { fontSize: 14, fontWeight: "600", color: COR_AUTH.texto, marginBottom: 7 },
  campoLinha: { justifyContent: "center" },
  campoIcone: { position: "absolute", left: 14, zIndex: 1 },
  campo: {
    height: 52,
    paddingLeft: 44,
    paddingRight: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COR_AUTH.bordaCampo,
    backgroundColor: COR_AUTH.campo,
    color: COR_AUTH.texto,
    fontSize: 16,
  },
  campoComOlho: { paddingRight: 52 },
  campoFocado: { borderColor: COR_AUTH.link },
  campoInvalido: { borderColor: "#f0847c" },
  olho: { position: "absolute", right: 0, width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  botao: { minHeight: 52, borderRadius: 6, borderWidth: 1, borderColor: "transparent", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16 },
  primario: { backgroundColor: COR_AUTH.primaria },
  secundario: { backgroundColor: COR_AUTH.campo, borderColor: COR_AUTH.bordaCampo },
  botaoTexto: { fontSize: 16, fontWeight: "600" },
  alerta: { flexDirection: "row", gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, marginBottom: 14 },
  alertaErro: { backgroundColor: "#3a1e2a", borderColor: "#8a4250" },
  alertaAviso: { backgroundColor: "#3a2e1a", borderColor: "#8a6d32" },
  alertaTextos: { flex: 1, gap: 2 },
  alertaTitulo: { fontSize: 14, fontWeight: "700", color: COR_AUTH.texto },
  alertaTexto: { fontSize: 13.5, lineHeight: 19, color: "#f3d9e0" },
  ou: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 10 },
  ouLinha: { flex: 1, height: 1, backgroundColor: "#82669f55" },
  ouTexto: { fontSize: 12, color: COR_AUTH.textoSutil, letterSpacing: 0.7 },
});
