import { OrnamentDivider } from "@/components/HallTheme";
import { FontFamily } from "@/styles/GlobalStyle";
import { buildProfileShellPaletteFromAccent } from "@/utils/profileShellTheme";
import { portaoDe, type Funcionalidade } from "@/utils/portoes";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import tinycolor from "tinycolor2";

const ICONE: Record<Funcionalidade, keyof typeof MaterialCommunityIcons.glyphMap> = {
  social: "account-heart",
  rank: "podium",
};

interface Props {
  funcionalidade: Funcionalidade | null;
  color: string;
  onClose: () => void;
}

/**
 * A cerimônia de desbloqueio: o cadeado abre e a funcionalidade entra no lugar.
 *
 * A animação existe para marcar o momento -- o aluno precisa entender que algo
 * mudou por causa do que ele fez, não achar que a aba sempre esteve lá. Por isso
 * ela é curta e acontece uma vez só por funcionalidade.
 */
export default function DesbloqueioModal({ funcionalidade, color, onClose }: Props) {
  const palette = buildProfileShellPaletteFromAccent(color);
  // Clareia o tom em vez de misturar com branco: misturar apaga a cor do perfil
  // mesmo passando no contraste.
  const destaque = tinycolor(color).lighten(12).toHexString();
  const borda = tinycolor(color).setAlpha(0.38).toRgbString();
  const halo = tinycolor(color).setAlpha(0.16).toRgbString();

  const visivel = funcionalidade != null;
  const portao = funcionalidade ? portaoDe(funcionalidade) : null;

  const [semMovimento, setSemMovimento] = useState(false);
  const entrada = useRef(new Animated.Value(0)).current;
  const troca = useRef(new Animated.Value(0)).current;
  const pulso = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let ativo = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduzir) => {
        if (ativo) setSemMovimento(reduzir);
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    if (!visivel) {
      entrada.setValue(0);
      troca.setValue(0);
      pulso.setValue(0);
      return;
    }

    // Com movimento reduzido a cerimônia acontece igual, só sem o percurso:
    // quem pediu menos animação continua sabendo que algo abriu.
    if (semMovimento) {
      entrada.setValue(1);
      troca.setValue(1);
      pulso.setValue(1);
      return;
    }

    Animated.sequence([
      Animated.spring(entrada, { toValue: 1, useNativeDriver: true, friction: 7, tension: 60 }),
      Animated.delay(180),
      Animated.parallel([
        Animated.timing(troca, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(pulso, {
          toValue: 1,
          duration: 620,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [entrada, pulso, semMovimento, troca, visivel]);

  if (!portao) return null;

  const cartao = {
    opacity: entrada,
    transform: [{ scale: entrada.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
  };

  // O cadeado sai girando; o ícone da funcionalidade entra no lugar dele.
  const cadeado = {
    opacity: troca.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 0.2, 0] }),
    transform: [
      { rotate: troca.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-24deg"] }) },
      { translateY: troca.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
    ],
  };

  const simbolo = {
    opacity: troca,
    transform: [{ scale: troca.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }],
  };

  const anel = {
    opacity: pulso.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.7, 0] }),
    transform: [{ scale: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.1] }) }],
  };

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[s.fundo, { backgroundColor: "rgba(6,8,16,0.82)" }]}>
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={`${portao.titulo}. ${portao.promessa}`}
          style={[
            s.cartao,
            cartao,
            { backgroundColor: palette.surfaceElevated, borderColor: borda },
          ]}
        >
          <LinearGradient
            colors={[halo, "transparent"]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View style={s.palco}>
            <Animated.View
              pointerEvents="none"
              style={[s.anel, anel, { borderColor: destaque }]}
            />
            <Animated.View style={[s.icone, cadeado]}>
              <MaterialCommunityIcons name="lock-open-variant" size={54} color={destaque} />
            </Animated.View>
            <Animated.View style={[s.icone, simbolo]}>
              <MaterialCommunityIcons
                name={ICONE[portao.funcionalidade]}
                size={54}
                color={destaque}
              />
            </Animated.View>
          </View>

          <Text style={[s.titulo, { color: destaque }]}>{portao.titulo}</Text>
          <OrnamentDivider color={destaque} />
          <Text style={[s.promessa, { color: palette.textMuted }]}>{portao.promessa}</Text>

          <View style={s.passos}>
            {portao.passos.map((passo) => (
              <View key={passo} style={s.passo}>
                <MaterialCommunityIcons name="circle-small" size={20} color={destaque} />
                <Text style={[s.passoTexto, { color: palette.textMuted }]}>{passo}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            onPress={onClose}
            style={[s.botao, { backgroundColor: destaque }]}
          >
            <Text style={[s.botaoTexto, { color: palette.surfaceElevated }]}>Entendi</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fundo: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  cartao: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 26,
    paddingHorizontal: 22,
    overflow: "hidden",
    alignItems: "center",
    gap: 10,
  },
  palco: { height: 92, width: 92, alignItems: "center", justifyContent: "center" },
  anel: { position: "absolute", height: 72, width: 72, borderRadius: 36, borderWidth: 2 },
  icone: { position: "absolute", alignItems: "center", justifyContent: "center" },
  titulo: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 19, textAlign: "center" },
  promessa: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  passos: { alignSelf: "stretch", marginTop: 8, gap: 2 },
  passo: { flexDirection: "row", alignItems: "flex-start", gap: 2 },
  passoTexto: { flex: 1, fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 19 },
  botao: {
    marginTop: 14,
    alignSelf: "stretch",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  botaoTexto: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 15 },
});
