// src/components/trilhas/TrilhaBase.tsx
import { useTrilha } from "@/context/TrilhaContext";
import { useTrailResumeTopic } from '@/hooks/useTrailResume';
import { useUsuario } from "@/context/SessaoContext";
import { getProfileArtwork } from "@/constants/designAssets";
import { Color } from "@/styles/GlobalStyle";
import { getBrainHexProfileCapabilities } from "@/utils/brainHexCapabilities";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { calcularProgressoTrilha } from "@/utils/progressoTrilha";
import { registrarAlvoTour } from "@/utils/tourTargets";
import { useIsFocused } from "@react-navigation/native";
import { UtilityIcon } from "@/components/UtilityIcon";
import React, { useEffect, useMemo, useRef } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { TrilhaArvoreSimple } from "./ArvoreView";
import { GameHeader } from "./common/GameHeader";
import { TrilhaLinearList } from "./ListaSimplesView";
import { TrilhaMapaHeroStable } from "./MapaViewStable";
import { GuideTargetRefs, ModuleHeaderGuideButton } from "./ModuleHeaderTitle";

export const TrilhaBase: React.FC<{
  chatGuideTargetRef?: React.RefObject<View | null>;
  onOpenBag?: () => void;
}> = ({ chatGuideTargetRef, onOpenBag }) => {
  const {
    classeAtual,
    carregando,
    erro,
    visual,
    mapTheme,
    personalizedTopics,
    progressoPersonalizado,
    perfil,
  } = useTrilha();
  const { usuario } = useUsuario();
  const currentTopicId = useTrailResumeTopic();
  const isFocused = useIsFocused();
  const palette = getProfileShellPalette(perfil);
  const capabilities = getBrainHexProfileCapabilities(perfil);
  const progressGuideTargetRef = useRef<View | null>(null);
  const journeyGuideTargetRef = useRef<View | null>(null);
  const guideTargetRefs = useMemo<GuideTargetRefs>(
    () => ({
      progress: progressGuideTargetRef,
      journey: journeyGuideTargetRef,
      map: journeyGuideTargetRef,
      tree: journeyGuideTargetRef,
      list: journeyGuideTargetRef,
      chat: chatGuideTargetRef,
    }),
    [chatGuideTargetRef]
  );
  const hasTrailPersonalization =
    Object.keys(personalizedTopics ?? {}).length > 0;

  // Hooks precisam ser executados em todas as renderizações, inclusive durante
  // carregamento/erro. O registro aceita refs ainda vazias e as resolve depois.
  useEffect(
    () => {
      if (!isFocused) return;
      return registrarAlvoTour("trilha_resumo", progressGuideTargetRef);
    },
    [isFocused],
  );
  useEffect(
    () => {
      if (!isFocused) return;
      return registrarAlvoTour("trilha_mapa", journeyGuideTargetRef);
    },
    [isFocused],
  );

  if (carregando || !classeAtual) return <View style={st.page} />;
  if (erro) return <View style={st.page} />;

  const nome =
    visual === "mapa"
      ? (mapTheme?.worldName ?? classeAtual.resumo?.materia_nome ?? "Classe")
      : (classeAtual.resumo?.materia_nome ?? "Classe");
  const subtitulo =
    visual === "mapa" ? (mapTheme?.classLabel ?? "Reino da classe") : "";
  const { progresso, totalTopicos, concluidos } = calcularProgressoTrilha(classeAtual, progressoPersonalizado);

  return (
    <View style={[st.page, { backgroundColor: palette.background }]}>
      <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
        <Image
          key={perfil}
          source={getProfileArtwork(perfil, 'trail')}
          resizeMode="cover"
          style={st.scenery}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, opacity: 0.3 }]} />
      </View>
      <GameHeader
        titulo={nome}
        subtitulo={subtitulo}
        // Sem o bonus de slides: ele e XP, e somar XP a uma taxa de conclusao
        // fazia a barra bater 100% com topicos ainda pendentes -- e, acima de
        // 90%, o bonus sumia no clamp sem o aluno entender por que. O calculo
        // continua no TrilhaContext (trilhaSlideBonusPercent) para quando o XP
        // ganhar um indicador proprio.
        xp={Math.round(progresso)}
        meta={100}
        palette={palette}
        progressTargetRef={progressGuideTargetRef}
        rightSlot={
          <View style={st.headerActions}>
            {onOpenBag ? <Pressable onPress={onOpenBag} accessibilityRole="button" accessibilityLabel="Abrir Bag" style={({ pressed }) => ({ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}><UtilityIcon kind="bag" size={34} /></Pressable> : null}
            <ModuleHeaderGuideButton
              profile={perfil}
              title={nome}
              totalBlocks={totalTopicos}
              completedBlocks={concluidos}
              scope="trilha"
              variant="icon"
              guideVariant={
                hasTrailPersonalization ? "personalizado" : "padrao_trilha"
              }
              visibleElements={{
                visualMode: visual,
                hasChat: capabilities.hasChat,
                hasProgress: true,
              }}
              perfis={usuario?.perfis ?? null}
              targetRefs={guideTargetRefs}
            />
          </View>
        }
      />
      <View
        ref={visual === "arvore" ? journeyGuideTargetRef : undefined}
        collapsable={false}
        style={{ flex: 1 }}
      >
        {visual === "mapa" && <TrilhaMapaHeroStable currentTopicId={currentTopicId} tourTargetRef={journeyGuideTargetRef} />}
        {visual === "arvore" && <TrilhaArvoreSimple currentTopicId={currentTopicId} />}
        {visual === "lista" && <TrilhaLinearList currentTopicId={currentTopicId} tourTargetRef={journeyGuideTargetRef} />}
      </View>
    </View>
  );
};

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: Color.background },
  scenery: { width: '100%', height: '100%' },
  headerActions: { flexDirection: "row", alignItems: "center" },
});
