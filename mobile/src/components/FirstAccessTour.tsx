import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  LayoutChangeEvent,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import tinycolor from "tinycolor2";

import {
  getBrainHexConfig,
  getBrainHexGuideName,
  guardianFullImages,
  normalizeBrainHexProfile,
} from "@/constants/profileImages";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { obterAlvoTour, revelarAlvoTour } from "@/utils/tourTargets";
import {
  buildFirstAccessTourSteps,
  buildFirstAccessTourStorageKey,
} from "@/utils/firstAccessTour";

type StoredTourState = {
  completed?: boolean;
  step?: number;
};

export function FirstAccessTour({
  userId,
  profile,
}: {
  userId?: string | null;
  profile?: string | null;
}) {
  const router = useRouter();
  // Última rota para a qual o tutorial navegou, para não renavegar quando o
  // passo muda mas a tela é a mesma.
  const rotaAtualRef = useRef<string | null>(null);
  // Recorte medido do elemento real do passo atual. `null` = ainda nao
  // medido (ou o passo nao tem alvo), e ai vale o desenho aproximado.
  const [alvoRect, setAlvoRect] = useState<{
    top: number; left: number; width: number; height: number;
  } | null>(null);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const normalizedProfile = normalizeBrainHexProfile(profile);
  const storageKey = userId ? buildFirstAccessTourStorageKey(userId) : null;
  const steps = useMemo(() => buildFirstAccessTourSteps(profile), [profile]);
  const palette = useMemo(() => getProfileShellPalette(profile), [profile]);
  const guideConfig = useMemo(() => getBrainHexConfig(profile ?? undefined), [profile]);
  const guideName = useMemo(() => getBrainHexGuideName(profile), [profile]);
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [bubbleHeight, setBubbleHeight] = useState(0);
  const loadedKeyRef = useRef<string | null>(null);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const currentStep = steps[index] ?? steps[0];

  useEffect(() => {
    if (!storageKey || !normalizedProfile || loadedKeyRef.current === storageKey) return;

    loadedKeyRef.current = storageKey;
    let active = true;
    void AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!active) return;
        let stored: StoredTourState = {};
        if (raw) {
          try {
            stored = JSON.parse(raw) as StoredTourState;
          } catch {
            stored = {};
          }
        }
        if (stored.completed) return;

        const resumeAt = Math.max(
          0,
          Math.min(steps.length - 1, Number(stored.step ?? 0) || 0),
        );
        setIndex(resumeAt);
        setVisible(true);
      })
      .catch((error) => {
        console.warn("[FirstAccessTour] Falha ao consultar tutorial:", error);
      });

    return () => {
      active = false;
    };
  }, [normalizedProfile, steps.length, storageKey]);

  useEffect(() => {
    if (!visible || !currentStep || !storageKey) return;

    // `replace` destruía a entrada anterior da pilha. Ao entrar em
    // `/(tabs)/perfil/settings`, o perfil deixava de existir no histórico e o
    // aluno ficava preso nas configurações, sem para onde voltar. `navigate`
    // empilha (ou reaproveita, se a tela já estiver na pilha), então o caminho
    // de volta continua existindo.
    //
    // A guarda por rota evita renavegar a cada passo: vários passos seguidos
    // compartilham `/(tabs)`, e renavegar em cada um remontava a tela à toa.
    if (rotaAtualRef.current !== currentStep.route) {
      rotaAtualRef.current = currentStep.route;
      router.navigate(currentStep.route as never);
    }

    persistQueueRef.current = persistQueueRef.current
      .then(() =>
        AsyncStorage.setItem(
          storageKey,
          JSON.stringify({ completed: false, step: index } satisfies StoredTourState),
        ),
      )
      .catch((error) => {
        console.warn("[FirstAccessTour] Falha ao salvar etapa:", error);
      });
  }, [currentStep, index, router, storageKey, visible]);

  // Mede o elemento real do passo. A tela pode ter acabado de trocar, entao
  // uma medida unica pegaria o layout no meio da transicao e devolveria zeros;
  // dai a escada de tentativas, igual a do guia de pagina.
  useEffect(() => {
    setAlvoRect(null);
    if (!visible || !currentStep?.target) return;

    let ativo = true;
    void revelarAlvoTour(currentStep.target);
    const timers = [180, 380, 720, 1200, 1900, 2800].map((atraso) =>
      setTimeout(() => {
        void revelarAlvoTour(currentStep.target);
        const ref = obterAlvoTour(currentStep.target);
        if (__DEV__ && !ref) {
          console.log(
            `[TourAlvo] ${currentStep.id}: alvo "${currentStep.target}" NAO registrado ` +
              `(t=${atraso}ms) — aguardando a tela montar`,
          );
        }
        ref?.current?.measureInWindow((x, y, largura, altura) => {
          if (__DEV__) {
            console.log(
              `[TourAlvo] ${currentStep.id}: "${currentStep.target}" t=${atraso}ms ` +
                `x=${Math.round(x)} y=${Math.round(y)} w=${Math.round(largura)} ` +
                `h=${Math.round(altura)} | tela ${Math.round(width)}x${Math.round(height)}`,
            );
          }
          if (!ativo || largura < 2 || altura < 2) return;
          // Fora da tela: manter o que ja havia em vez de acender um retangulo
          // grampeado sobre o elemento errado.
          if (y + altura < 0 || y > height) return;
          const respiro = 8;
          setAlvoRect({
            // No Android, measureInWindow parte da area de conteudo, enquanto
            // o Modal translucido parte do topo fisico da tela. Sem o inset o
            // recorte inteiro ficava uma barra de status acima do componente.
            top: Math.max(0, y + insets.top - respiro),
            left: Math.max(0, x - respiro),
            width: Math.min(width, largura + respiro * 2),
            height: Math.min(height, altura + respiro * 2),
          });
        });
      }, atraso),
    );

    return () => {
      ativo = false;
      timers.forEach(clearTimeout);
    };
  }, [currentStep, height, insets.top, visible, width]);

  const finish = useCallback(async () => {
    if (storageKey) {
      try {
        await persistQueueRef.current;
        await AsyncStorage.setItem(
          storageKey,
          JSON.stringify({ completed: true, step: steps.length - 1 } satisfies StoredTourState),
        );
      } catch (error) {
        console.warn("[FirstAccessTour] Falha ao concluir tutorial:", error);
      }
    }
    setVisible(false);
    setIndex(0);
    // `navigate` também aqui: se o aluno encerrar o tutorial numa tela interna
    // (pelo botão de pular), `replace` trocaria essa tela pela raiz e deixaria
    // a pilha do perfil sem retorno — o mesmo defeito corrigido acima.
    rotaAtualRef.current = "/(tabs)";
    router.navigate("/(tabs)" as never);
  }, [router, steps.length, storageKey]);

  if (!normalizedProfile || !currentStep) return null;

  const isLast = index >= steps.length - 1;
  const isIntroduction = currentStep.id === "welcome";
  const compact = height < 720;
  const bubbleTop = compact ? 76 : 92;
  const navigationHighlightHeight = Math.min(82, height * 0.12);
  const navigationHighlightBottom = Math.max(insets.bottom, 8);
  const bubbleAtTop = currentStep.highlight === "navigation";
  const bubbleBottom = navigationHighlightBottom + navigationHighlightHeight + 12;
  const measuredBubbleTop = bubbleAtTop
    ? bubbleTop
    : height - bubbleBottom - (bubbleHeight || height * 0.36);
  const introductionWidth = Math.min(width * 0.64, 240);
  const introductionTop = Math.max(insets.top + 58, 70);
  const introductionRect = {
    top: introductionTop,
    left: (width - introductionWidth) / 2,
    width: introductionWidth,
    height: Math.min(
      height * 0.37,
      300,
      Math.max(170, measuredBubbleTop - introductionTop - 12),
    ),
  };
  // A apresentacao destaca o palco do personagem. Nos demais passos somente
  // uma medida real pode abrir o recorte; nunca iluminamos uma area estimada.
  const highlightRect = isIntroduction ? introductionRect : alvoRect;

  // Balao colado no recorte: abaixo se couber, senao acima, senao no rodape.
  // Antes ele ia sempre para topo ou rodape fixo, e acabava longe do item que
  // estava explicando — ou por cima dele.
  const balaoAltura = bubbleHeight || height * 0.36;
  const limiteInferior = height - Math.max(insets.bottom, 12);
  const safeHighlight = highlightRect ?? {
    top: height * 0.32,
    left: width * 0.25,
    width: width * 0.5,
    height: 60,
  };
  const abaixoDoAlvo = safeHighlight.top + safeHighlight.height + 12;
  const acimaDoAlvo = safeHighlight.top - 12 - balaoAltura;
  const balaoTop =
    isIntroduction || !alvoRect
      ? measuredBubbleTop
      : !highlightRect
        ? Math.max(insets.top + 72, height * 0.56)
      : limiteInferior - abaixoDoAlvo >= balaoAltura
        ? abaixoDoAlvo
        : acimaDoAlvo >= insets.top + 12
          ? acimaDoAlvo
          : Math.max(insets.top + 12, limiteInferior - balaoAltura);

  const accent = guideConfig.color;
  const bubbleBorder = tinycolor(accent).lighten(12).setAlpha(0.75).toRgbString();
  const coachWidth = Math.min(164, width * 0.43);
  const coachHeight = Math.min(310, height * 0.41);
  const targetCenterY = safeHighlight.top + safeHighlight.height / 2;
  const coachOnBottom = targetCenterY < height * 0.5;
  const coachTop = coachOnBottom
    ? Math.min(height - insets.bottom - coachHeight - 8, balaoTop + Math.max(70, balaoAltura * 0.42))
    : Math.max(insets.top + 58, balaoTop - coachHeight * 0.52);
  const dialogLeft = Math.min(width * 0.28, 112);
  const arrowStart = {
    x: dialogLeft + (width - dialogLeft - 14) * 0.5,
    y: coachOnBottom ? balaoTop : balaoTop + balaoAltura,
  };
  const arrowEnd = {
    x: Math.max(22, Math.min(width - 22, safeHighlight.left + safeHighlight.width / 2)),
    y: coachOnBottom ? safeHighlight.top + safeHighlight.height : safeHighlight.top,
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => void finish()}
    >
      <View style={styles.root}>
        {highlightRect ? (
          <TourSpotlight
            rect={highlightRect}
            screenWidth={width}
            screenHeight={height}
            scrim={`${palette.background}b8`}
            accent={accent}
          />
        ) : (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: `${palette.background}b8` }]}
          />
        )}

        {isIntroduction ? (
          <View
            pointerEvents="none"
            style={[
              styles.introductionStage,
              introductionRect,
              {
                backgroundColor: tinycolor(accent).setAlpha(0.12).toRgbString(),
                shadowColor: accent,
              },
            ]}
          >
            <View
              style={[
                styles.introductionAura,
                { backgroundColor: tinycolor(accent).setAlpha(0.18).toRgbString() },
              ]}
            />
            <Image
              source={guardianFullImages[normalizedProfile]}
              resizeMode="contain"
              accessibilityLabel={`${guideName}, guia do perfil`}
              style={styles.introductionGuideImage}
            />
          </View>
        ) : null}

        <View style={[styles.topBar, { paddingTop: Math.max(18, height * 0.025) }]}>
          <View style={[styles.pageChip, { backgroundColor: palette.surfaceElevated, borderColor: bubbleBorder }]}>
            <MaterialCommunityIcons name="map-marker-path" size={15} color={accent} />
            <Text style={[styles.pageChipText, { color: palette.text }]}>{currentStep.page}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pular tutorial inicial"
            onPress={() => void finish()}
            style={[styles.skipButton, { borderColor: palette.border }]}
          >
            <Text style={[styles.skipText, { color: palette.textMuted }]}>Pular</Text>
          </Pressable>
        </View>

        {!isIntroduction && highlightRect ? (
          <TourArrow start={arrowStart} end={arrowEnd} accent={accent} />
        ) : null}

        {!isIntroduction ? (
          <Image
            source={guardianFullImages[normalizedProfile]}
            resizeMode="contain"
            accessibilityLabel={`${guideName}, guia do perfil`}
            style={[
              styles.coachGuideImage,
              { top: coachTop, width: coachWidth, height: coachHeight },
            ]}
          />
        ) : null}

        <View
          style={[
            styles.speechBubble,
            { top: balaoTop, left: isIntroduction ? 16 : dialogLeft },
            {
              backgroundColor: palette.surfaceElevated,
              borderColor: bubbleBorder,
            },
          ]}
          onLayout={(event: LayoutChangeEvent) => {
            const nextHeight = Math.ceil(event.nativeEvent.layout.height);
            if (nextHeight !== bubbleHeight) setBubbleHeight(nextHeight);
          }}
        >
          <View style={[styles.bubbleAccent, { backgroundColor: accent }]} />
          {!isIntroduction ? (
            <View
              style={[
                styles.bubbleTail,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: bubbleBorder,
                },
              ]}
            />
          ) : null}
          <View>
            <View style={styles.guideHeader}>
              <View style={styles.guideHeaderCopy}>
                <View style={styles.speakerRow}>
                  <Text style={[styles.speaker, { color: accent }]}>{guideName}</Text>
                  <Text style={[styles.counter, { color: palette.textSubtle }]}>
                    {index + 1}/{steps.length}
                  </Text>
                </View>
                <Text style={[styles.title, { color: palette.text }]}>{currentStep.title}</Text>
              </View>
            </View>
            <Text style={[styles.description, { color: palette.textMuted }]}>
              {currentStep.description}
            </Text>
          </View>

          <View style={styles.progressRow}>
            {steps.map((step, stepIndex) => (
              <View
                key={step.id}
                style={[
                  styles.progressDot,
                  {
                    backgroundColor:
                      stepIndex <= index ? accent : palette.border,
                  },
                ]}
              />
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable
              disabled={index === 0}
              onPress={() => setIndex((value) => Math.max(0, value - 1))}
              style={[
                styles.backButton,
                { borderColor: bubbleBorder, opacity: index === 0 ? 0.35 : 1 },
              ]}
            >
              <Text style={[styles.backText, { color: palette.textMuted }]}>Voltar</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (isLast) void finish();
                else setIndex((value) => Math.min(steps.length - 1, value + 1));
              }}
              style={[styles.nextButton, { backgroundColor: accent }]}
            >
              <Text style={styles.nextText}>{isLast ? "Começar" : "Próximo"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

type TourRect = { top: number; left: number; width: number; height: number };

function TourSpotlight({
  rect,
  screenWidth,
  screenHeight,
  scrim,
  accent,
}: {
  rect: TourRect;
  screenWidth: number;
  screenHeight: number;
  scrim: string;
  accent: string;
}) {
  const top = Math.max(0, Math.min(screenHeight, rect.top));
  const left = Math.max(0, Math.min(screenWidth, rect.left));
  const width = Math.max(0, Math.min(screenWidth - left, rect.width));
  const height = Math.max(0, Math.min(screenHeight - top, rect.height));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.scrim, { top: 0, left: 0, right: 0, height: top, backgroundColor: scrim }]} />
      <View style={[styles.scrim, { top, left: 0, width: left, height, backgroundColor: scrim }]} />
      <View style={[styles.scrim, { top, left: left + width, right: 0, height, backgroundColor: scrim }]} />
      <View style={[styles.scrim, { top: top + height, left: 0, right: 0, bottom: 0, backgroundColor: scrim }]} />
      <View style={[styles.spotlight, { top, left, width, height, borderColor: accent, shadowColor: accent }]} />
    </View>
  );
}

function TourArrow({
  start,
  end,
  accent,
}: {
  start: { x: number; y: number };
  end: { x: number; y: number };
  accent: string;
}) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  // A seta do Clash fica junto do objeto; ela nao vira uma linha atravessando
  // a tela quando o alvo e uma lista ou painel grande.
  const length = Math.max(34, Math.min(108, distance - 18));
  const angle = Math.atan2(dy, dx);
  const arrowStartX = end.x - (dx / distance) * length;
  const arrowStartY = end.y - (dy / distance) * length;
  const centerX = (arrowStartX + end.x) / 2;
  const centerY = (arrowStartY + end.y) / 2;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.arrow,
        {
          left: centerX - length / 2,
          top: centerY - 18,
          width: length,
          transform: [{ rotate: `${angle}rad` }],
        },
      ]}
    >
      <View style={[styles.arrowShaft, { backgroundColor: accent, shadowColor: accent }]} />
      <MaterialCommunityIcons
        name="arrow-right-bold"
        size={38}
        color={accent}
        style={styles.arrowHead}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    position: "absolute",
    left: 18,
    right: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 4,
  },
  pageChip: {
    minHeight: 34,
    maxWidth: "72%",
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  pageChipText: { fontSize: 12, fontWeight: "700" },
  skipButton: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  skipText: { fontSize: 12, fontWeight: "700" },
  speechBubble: {
    position: "absolute",
    right: 12,
    zIndex: 6,
    borderWidth: 2,
    borderRadius: 18,
    padding: 13,
    overflow: "visible",
    shadowColor: "#000",
    shadowOpacity: 0.42,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },
  guideHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  coachGuideImage: {
    position: "absolute",
    zIndex: 5,
    left: -12,
  },
  guideHeaderCopy: { flex: 1 },
  introductionStage: {
    position: "absolute",
    zIndex: 2,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
    shadowOpacity: 0.8,
    shadowRadius: 22,
    elevation: 12,
  },
  introductionAura: {
    position: "absolute",
    width: "88%",
    aspectRatio: 1,
    borderRadius: 999,
    bottom: -24,
  },
  introductionGuideImage: {
    width: "94%",
    height: "96%",
  },
  speakerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  speaker: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  counter: { fontSize: 12, fontWeight: "700" },
  title: { marginTop: 4, fontSize: 18, lineHeight: 22, fontWeight: "900" },
  description: { marginTop: 7, fontSize: 13.5, lineHeight: 18.5 },
  progressRow: { flexDirection: "row", gap: 4, marginTop: 10 },
  progressDot: { flex: 1, height: 3, borderRadius: 2 },
  actions: { flexDirection: "row", gap: 8, marginTop: 11 },
  backButton: {
    flex: 1,
    minHeight: 39,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  nextButton: {
    flex: 1.45,
    minHeight: 39,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { fontSize: 13, fontWeight: "800" },
  nextText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  scrim: { position: "absolute" },
  spotlight: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: 18,
    shadowOpacity: 0.9,
    shadowRadius: 16,
    elevation: 3,
  },
  arrow: {
    position: "absolute",
    zIndex: 4,
    height: 36,
    justifyContent: "center",
  },
  arrowShaft: {
    height: 10,
    borderRadius: 999,
    marginRight: 20,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 8,
  },
  arrowHead: {
    position: "absolute",
    right: -8,
    top: -1,
  },
  bubbleAccent: {
    position: "absolute",
    left: 18,
    right: 18,
    top: -2,
    height: 3,
    borderRadius: 999,
  },
  bubbleTail: {
    position: "absolute",
    left: -10,
    top: 34,
    width: 20,
    height: 20,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    transform: [{ rotate: "45deg" }],
  },
});
