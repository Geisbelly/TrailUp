import CardSemDados from "@/components/CardSemDados";
import { IAMentorPanel } from "@/components/ia/IAMentorPanel";
import { LoadingState } from "@/components/LoadingState";
import { BagModal } from "@/components/bag/BagModal";
import { TrilhaBase } from "@/components/trilhas/TrilhaBase";
import { TrilhaDesktop } from "@/components/web/TrilhaDesktop";
import { useIA } from "@/context/IAContext";
import { useTrilha } from "@/context/TrilhaContext";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { Color } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TrilhasIndex() {
  const { carregando, erro, classes, classeAtual, perfil, personalizedTopics } =
    useTrilha();
  const { pushMentorCue } = useIA();
  const palette = getProfileShellPalette(perfil);
  const personalizationCueKeyRef = useRef<string | null>(null);
  const chatGuideTargetRef = useRef<View | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const desktop = useDesktopWeb();

  const trailMentorCue = useMemo(() => {
    const currentClass = classeAtual;
    if (!currentClass) return null;

    const entry = Object.entries(personalizedTopics ?? {}).find(
      ([topicoId, payload]) => {
        if (!payload) return false;
        const summary = String(payload.planMeta?.justification ?? "").trim();
        if (!summary) return false;
        return currentClass.topicos.some(
          (topico) => topico.id === Number(topicoId),
        );
      },
    );

    if (!entry) return null;

    const [topicoId, payload] = entry;
    const topico = currentClass.topicos.find(
      (item) => item.id === Number(topicoId),
    );

    return {
      key: `${currentClass.classe_id}:${topicoId}:${payload.planMeta?.heroFormat ?? "guia"}`,
      topicoId: Number(topicoId),
      title: topico?.nome ?? "Módulo personalizado",
      message:
        String(payload.planMeta?.justification ?? "").trim() ||
        "Eu adaptei um módulo para combinar melhor com seu perfil. Se quiser, eu explico essa decisão.",
    };
  }, [classeAtual, personalizedTopics]);

  useEffect(() => {
    if (!trailMentorCue) return;
    if (personalizationCueKeyRef.current === trailMentorCue.key) return;
    personalizationCueKeyRef.current = trailMentorCue.key;
    pushMentorCue({
      message: trailMentorCue.message,
      title: trailMentorCue.title,
      topicoId: trailMentorCue.topicoId,
      actionLabel: "Conversar",
    });
  }, [pushMentorCue, trailMentorCue]);

  if (carregando) {
    return (
      <SafeAreaView
        edges={["top", "left", "right"]}
        style={[styles.root, { backgroundColor: palette.background }]}
      >
        <LoadingState
          title="Carregando trilhas"
          message="Preparando sua jornada."
          palette={palette}
        />
      </SafeAreaView>
    );
  }

  if (erro) {
    return (
      <SafeAreaView
        edges={["top", "left", "right"]}
        style={[styles.root, { backgroundColor: palette.background }]}
      >
        <Text style={{ color: "salmon" }}>Erro</Text>
        <Text style={{ color: "#ccc" }}>{erro.message}</Text>
      </SafeAreaView>
    );
  }

  if (!classes?.length) {
    return (
      <SafeAreaView
        edges={["top", "left", "right"]}
        style={[styles.root, { backgroundColor: palette.background }]}
      >
        <CardSemDados
          title="Sem trilhas"
          description="Nenhuma trilha disponivel no momento."
          accentColor={palette.accent}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.root, { backgroundColor: palette.background }]}
    >
      {/* Na web em tela larga (#346) a Trilha tem o painel do tópico ao lado, e a Bag fica na barra superior. */}
      {desktop ? (
        <TrilhaDesktop chatGuideTargetRef={chatGuideTargetRef} />
      ) : (
        <>
          <TrilhaBase chatGuideTargetRef={chatGuideTargetRef} onOpenBag={() => setBagOpen(true)} />
          <BagModal visible={bagOpen} classeId={classeAtual?.classe_id ?? null} profile={perfil} onClose={() => setBagOpen(false)} />
        </>
      )}
      <IAMentorPanel
        classeId={classeAtual?.classe_id ?? null}
        topicoId={trailMentorCue?.topicoId ?? null}
        scope="trilha_home"
        bottomOffset={10}
        guideTargetRef={chatGuideTargetRef}
        // Na tela larga o guia fica no canto do mapa, à esquerda do painel do tópico, como no protótipo v4.
        ancora={desktop ? { direita: 380, base: 44, largura: 380 } : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Color.background,
  },
  content: {
    flex: 1,
  },
});
