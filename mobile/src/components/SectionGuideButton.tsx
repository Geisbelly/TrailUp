import {
  getBrainHexConfig,
  getBrainHexGuideName,
  normalizeBrainHexProfile,
} from "@/constants/profileImages";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React, { useEffect, useMemo, useRef, useState } from "react";
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

// Margem entre o recorte e o balão, e folga mínima da borda da tela.
const FOLGA = 14;
// Quanto o alvo fica abaixo do topo depois de rolar, para não colar no header.
const MARGEM_ROLAGEM = 120;
// O layout precisa assentar depois da rolagem antes de medir; uma medida só,
// cedo demais, devolvia posição errada (ou zero) e o recorte não aparecia.
const TENTATIVAS_MEDIDA = [120, 260, 460];

export type SectionGuideStep = {
  id: string;
  target: string;
  title: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

export type SectionGuideTargetRefs = Record<
  string,
  React.RefObject<View | null> | undefined
>;

type SpotlightRect = { top: number; left: number; width: number; height: number };

/**
 * Container rolável da página. Aceita tanto `ScrollView` (`scrollTo`) quanto
 * `FlatList` (`scrollToOffset`) — as páginas do app usam os dois, e exigir só
 * um deixava metade delas sem rolagem no guia.
 */
export type SectionGuideScrollable = {
  scrollTo?: (opcoes: { y?: number; animated?: boolean }) => void;
  scrollToOffset?: (opcoes: { offset: number; animated?: boolean }) => void;
};

export function SectionGuideButton({
  profile,
  sectionTitle,
  steps,
  targetRefs,
  onStepFocus,
  scrollRef,
  scrollOffsetRef,
  style,
}: {
  profile?: string | null;
  sectionTitle: string;
  steps: SectionGuideStep[];
  targetRefs: SectionGuideTargetRefs;
  onStepFocus?: (step: SectionGuideStep, index: number) => void | Promise<void>;
  /**
   * Rolagem da página. Sem ela o guia descreve elementos que podem estar fora
   * da tela: ele mede a posição, mas nunca leva o aluno até lá.
   */
  scrollRef?: React.RefObject<SectionGuideScrollable | null>;
  /**
   * Deslocamento atual da rolagem, alimentado pelo `onScroll` da página.
   * `scrollTo` recebe posição ABSOLUTA, e `measureInWindow` devolve posição
   * na TELA — sem saber onde a rolagem está, não dá para converter uma na
   * outra. É o mesmo par que `perfil/index.tsx` já usa.
   */
  scrollOffsetRef?: React.RefObject<number>;
  style?: object;
}) {
  const buttonRef = useRef<View | null>(null);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [balaoAltura, setBalaoAltura] = useState(0);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const activeProfile = normalizeBrainHexProfile(profile) ?? "seeker";
  const palette = useMemo(() => getProfileShellPalette(activeProfile), [activeProfile]);
  const guide = useMemo(() => getBrainHexConfig(activeProfile), [activeProfile]);
  const guideName = useMemo(() => getBrainHexGuideName(activeProfile), [activeProfile]);
  const currentStep = steps[index] ?? null;

  useEffect(() => {
    if (!open || !currentStep) {
      setRect(null);
      return;
    }

    setRect(null);

    let active = true;
    const timers: ReturnType<typeof setTimeout>[] = [];

    void Promise.resolve(onStepFocus?.(currentStep, index)).then(() => {
      if (!active) return;
      const ref =
        currentStep.target === "guide_button"
          ? buttonRef
          : targetRefs[currentStep.target];
      const alvo = ref?.current;
      if (!alvo?.measureInWindow) return;

      // 1. Levar o aluno até o elemento. Sem isto, o guia descrevia algo que
      //    estava fora da tela: a medida caía fora da viewport, `top` era
      //    grampeado em zero e o recorte não aparecia — sobrava o escurecimento
      //    uniforme.
      //
      //    `measureLayout` NÃO serve aqui: na nova arquitetura ele exige uma
      //    instância nativa, e nem `getInnerViewRef` nem `getScrollableNode`
      //    devolvem uma — o app enchia o console de
      //    "ref.measureLayout must be called with a ref to a native component"
      //    e nunca rolava. `measureInWindow` funciona, e somado ao
      //    deslocamento atual dá a posição absoluta que `scrollTo` espera.
      const rolagem = scrollRef?.current;
      if (rolagem && scrollOffsetRef) {
        alvo.measureInWindow((_x, y, _w, altura) => {
          if (!active || altura < 2) return;
          const destino = Math.max(0, (scrollOffsetRef.current ?? 0) + y - MARGEM_ROLAGEM);
          if (typeof rolagem.scrollTo === "function") {
            rolagem.scrollTo({ y: destino, animated: true });
          } else if (typeof rolagem.scrollToOffset === "function") {
            rolagem.scrollToOffset({ offset: destino, animated: true });
          }
        });
      }

      // 2. Medir depois que o layout assentar. Uma medida única a 100ms pegava
      //    a tela no meio da rolagem e devolvia posição errada.
      TENTATIVAS_MEDIDA.forEach((atraso) => {
        timers.push(
          setTimeout(() => {
            ref?.current?.measureInWindow((x, y, width, height) => {
              if (!active || width < 2 || height < 2) return;
              // Alvo ainda fora da viewport: manter o recorte anterior (ou
              // nenhum) em vez de desenhar um retângulo grampeado em cima do
              // elemento errado.
              if (y + height < 0 || y > screenHeight) return;
              const padding = 6;
              setRect({
                top: Math.max(0, y - padding),
                left: Math.max(0, x - padding),
                width: Math.min(screenWidth, width + padding * 2),
                height: Math.min(screenHeight, height + padding * 2),
              });
            });
          }, atraso),
        );
      });
    });

    return () => {
      active = false;
      timers.forEach(clearTimeout);
    };
  }, [currentStep, index, onStepFocus, open, screenHeight, screenWidth, scrollOffsetRef, scrollRef, targetRefs]);

  useEffect(() => {
    setIndex(0);
    setOpen(false);
  }, [activeProfile, sectionTitle, steps]);

  const close = () => {
    setIndex(0);
    setOpen(false);
  };

  const aoMedirBalao = (evento: LayoutChangeEvent) => {
    const altura = evento.nativeEvent.layout.height;
    setBalaoAltura((atual) => (Math.abs(atual - altura) > 1 ? altura : atual));
  };

  /**
   * Topo do balão.
   *
   * A regra antiga olhava só `rect.top > 52%` e ignorava a altura do próprio
   * balão — um alvo na metade de cima mandava o balão para o rodapé, e um
   * balão alto subia por cima do elemento que ele estava explicando. Aqui o
   * balão vai para o lado do recorte em que ele REALMENTE cabe.
   */
  const balaoTop = useMemo(() => {
    const altura = balaoAltura || screenHeight * 0.36;
    // A barra de sistema do Android entra na altura da janela; sem descontá-la
    // o balão descia por baixo dela e os botões ficavam inacessíveis.
    const limite = screenHeight - Math.max(insets.bottom, FOLGA);
    const rodape = limite - altura;
    if (!rect) return rodape;

    const espacoAcima = rect.top - Math.max(insets.top, FOLGA);
    const espacoAbaixo = limite - (rect.top + rect.height) - FOLGA;

    if (espacoAbaixo >= altura) return rect.top + rect.height + FOLGA;
    if (espacoAcima >= altura) return Math.max(insets.top + FOLGA, rect.top - FOLGA - altura);

    // Alvo grande demais para caber com o balão de qualquer lado: encosta no
    // lado mais folgado. A sobreposição aqui é inevitável, não um descuido.
    return espacoAbaixo >= espacoAcima
      ? Math.max(insets.top + FOLGA, rodape)
      : insets.top + FOLGA;
  }, [balaoAltura, insets.bottom, insets.top, rect, screenHeight]);

  return (
    <>
      <Pressable
        ref={buttonRef}
        collapsable={false}
        onPress={() => {
          setIndex(0);
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Abrir guia de ${sectionTitle}`}
        style={[
          styles.helpButton,
          {
            backgroundColor: palette.surfaceElevated,
            borderColor: palette.borderStrong,
          },
          style,
        ]}
      >
        <MaterialCommunityIcons
          name="help-circle-outline"
          size={19}
          color={palette.accent}
        />
      </Pressable>

      <Modal transparent animationType="fade" visible={open} onRequestClose={close}>
        <View style={styles.modalRoot}>
          {rect ? (
            <SpotlightMask
              rect={rect}
              screenWidth={screenWidth}
              screenHeight={screenHeight}
              scrim={`${palette.background}e8`}
              accent={palette.accent}
            />
          ) : (
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: `${palette.background}e8` }]}
            />
          )}

          {currentStep ? (
            <View
              onLayout={aoMedirBalao}
              style={[
                styles.card,
                { top: balaoTop },
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: palette.borderStrong,
                },
              ]}
            >
              <View style={styles.headingRow}>
                <Image source={guide.image} style={styles.avatar} />
                <View style={styles.headingCopy}>
                  <Text style={[styles.eyebrow, { color: palette.accent }]}>
                    {guideName} · {sectionTitle}
                  </Text>
                  <Text style={[styles.title, { color: palette.text }]}>
                    {currentStep.title}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name={currentStep.icon}
                  size={22}
                  color={palette.accent}
                />
              </View>

              <Text style={[styles.description, { color: palette.textMuted }]}>
                {currentStep.description}
              </Text>

              <View style={styles.footer}>
                <Text style={[styles.counter, { color: palette.textSubtle }]}>
                  Passo {index + 1} de {steps.length}
                </Text>
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => (index === 0 ? close() : setIndex((value) => value - 1))}
                    style={[styles.secondary, { borderColor: palette.border }]}
                  >
                    <Text style={[styles.secondaryText, { color: palette.textMuted }]}>
                      {index === 0 ? "Fechar" : "Voltar"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (index >= steps.length - 1) close();
                      else setIndex((value) => value + 1);
                    }}
                    style={[styles.primary, { backgroundColor: palette.accent }]}
                  >
                    <Text style={[styles.primaryText, { color: palette.background }]}>
                      {index >= steps.length - 1 ? "Concluir" : "Próximo"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

function SpotlightMask({
  rect,
  screenWidth,
  screenHeight,
  scrim,
  accent,
}: {
  rect: SpotlightRect;
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

const styles = StyleSheet.create({
  helpButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
    opacity: 0.82,
  },
  modalRoot: { flex: 1 },
  scrim: { position: "absolute" },
  spotlight: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: 18,
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 12,
  },
  card: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    elevation: 20,
  },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headingCopy: { flex: 1 },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  eyebrow: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  title: { marginTop: 2, fontSize: 21, fontWeight: "700" },
  description: { marginTop: 14, fontSize: 16, lineHeight: 23 },
  footer: { marginTop: 18, gap: 12 },
  counter: { fontSize: 13 },
  actions: { flexDirection: "row", gap: 10 },
  secondary: {
    minHeight: 48,
    flex: 1,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    minHeight: 48,
    flex: 1.5,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { fontSize: 15, fontWeight: "700" },
  primaryText: { fontSize: 15, fontWeight: "800" },
});
