import type { IAEnemySpec, IAEnemyVisualSpec } from "@/interfaces/personalizacao/IAContracts";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";

type Palette = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  hpColor: string;
};

type Props = {
  visible: boolean;
  enemy: IAEnemySpec;
  visual: IAEnemyVisualSpec | null;
  palette: Palette;
  mensagem?: string | null;
  onClose: () => void;
};

/**
 * O parabéns quando o boss cai.
 *
 * Antes disto a derrota só trocava um ícone e uma linha de texto dentro do
 * painel — o aluno derrubava o inimigo e a tela mal reagia.
 *
 * Três coisas que não são acidentais:
 *
 * 1. **A paleta é a do BOSS, não a do perfil.** É a mesma regra que o
 *    `IABattlePanel` segue: o inimigo é o adversário, não o aluno, e trocar o
 *    tema do app não muda a cara dele.
 * 2. **A arte tem fallback visível.** `Image` do React Native falha *calado*:
 *    URL que dá 404 deixa um buraco. Quando não há `avatarUrl` — e não há
 *    quando `arte_base_url` não está configurada, que é o comportamento
 *    anterior e não um meio-termo quebrado — entra o ícone procedural, o mesmo
 *    que o painel usa.
 * 3. **O cenário atrás do texto fica em `opacity: 0.16`.** É o mesmo véu do
 *    `backgroundLayer` do painel: medido na pasta de identidade, o mínimo para
 *    o texto passar em AAA sobre o cenário mais claro é α 0,79, e 0,16 de arte
 *    equivale a α 0,84 de superfície por cima — do lado certo do limite.
 */
export function IABossVictoryModal({
  visible,
  enemy,
  visual,
  palette,
  mensagem,
  onClose,
}: Props) {
  const entrada = useRef(new Animated.Value(0)).current;
  const artUrl = visual?.avatarUrl ?? enemy.avatarUrl ?? null;
  const backgroundUrl = visual?.backgroundUrl ?? null;
  const frameUrl = visual?.frameUrl ?? null;

  useEffect(() => {
    if (!visible) {
      entrada.setValue(0);
      return;
    }
    // `Haptics` pode falhar em aparelho sem motor ou com a permissão negada, e
    // um parabéns não pode derrubar a tela por causa disso.
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.timing(entrada, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();
  }, [visible, entrada]);

  const escala = entrada.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.fundo}>
        <Animated.View
          style={[
            s.cartao,
            {
              backgroundColor: palette.secondaryColor,
              borderColor: `${palette.accentColor}66`,
              opacity: entrada,
              transform: [{ scale: escala }],
            },
          ]}
        >
          {backgroundUrl ? (
            <Image source={{ uri: backgroundUrl }} style={s.cenario} resizeMode="cover" />
          ) : null}

          <Text style={[s.kicker, { color: palette.accentColor }]}>VITÓRIA</Text>
          <Text style={[s.titulo, { color: palette.textColor }]}>Parabéns!</Text>

          <View
            style={[
              s.moldura,
              {
                borderColor: `${palette.accentColor}66`,
                backgroundColor: `${palette.primaryColor}33`,
              },
            ]}
          >
            {artUrl ? (
              <Image source={{ uri: artUrl }} style={s.arte} resizeMode="contain" />
            ) : (
              <MaterialCommunityIcons name="chess-king" size={72} color={palette.accentColor} />
            )}
            {frameUrl ? (
              <Image source={{ uri: frameUrl }} style={s.frame} resizeMode="stretch" />
            ) : null}
            <View style={[s.selo, { backgroundColor: palette.accentColor }]}>
              <MaterialCommunityIcons name="sword-cross" size={15} color={palette.secondaryColor} />
            </View>
          </View>

          <Text style={[s.nome, { color: palette.textColor }]}>{enemy.name}</Text>
          <Text style={[s.derrotado, { color: palette.hpColor }]}>DERROTADO</Text>

          <Text style={[s.mensagem, { color: `${palette.textColor}CC` }]}>
            {mensagem?.trim() || "Você venceu este encontro. Siga em frente na trilha."}
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={[s.botao, { backgroundColor: palette.accentColor }]}
          >
            <Text style={[s.botaoTexto, { color: palette.secondaryColor }]}>Continuar</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fundo: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(4,6,14,.86)",
    padding: 24,
  },
  cartao: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    padding: 22,
    alignItems: "center",
    gap: 8,
    overflow: "hidden",
  },
  // 0.16 é o mesmo véu do painel de batalha: α 0,84 da superfície sobre a arte,
  // acima do mínimo de 0,79 medido para o texto passar em AAA.
  // `pointerEvents` aqui e no ESTILO: `Image` do RN nao aceita a prop, e sem
  // isto o cenario fica por cima do botao Continuar e engole o toque.
  cenario: { ...StyleSheet.absoluteFillObject, opacity: 0.16, pointerEvents: "none" },
  kicker: { fontSize: 11, fontWeight: "800", letterSpacing: 3 },
  titulo: { fontSize: 30, fontWeight: "800", letterSpacing: 0.5 },
  moldura: {
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 10,
  },
  arte: { width: "86%", height: "86%" },
  frame: { ...StyleSheet.absoluteFillObject, borderRadius: 74 },
  selo: {
    position: "absolute",
    bottom: -4,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  nome: { fontSize: 17, fontWeight: "800", textAlign: "center" },
  derrotado: { fontSize: 11, fontWeight: "800", letterSpacing: 2, marginTop: 2 },
  mensagem: { fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 8 },
  botao: {
    alignSelf: "stretch",
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 14,
  },
  botaoTexto: { fontSize: 14, fontWeight: "800" },
});
