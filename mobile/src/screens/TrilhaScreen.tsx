import CardSemDados from "@/components/CardSemDados";
import { HallBackground } from "@/components/HallTheme";
import { IAMentorPanel } from "@/components/ia/IAMentorPanel";
import { LoadingState } from "@/components/LoadingState";
import { TrilhaBase } from "@/components/trilhas/TrilhaBase";
import { useIA } from "@/context/IAContext";
import { useUsuario } from "@/context/SessaoContext";
import { useTrilha } from "@/context/TrilhaContext";
import { Color } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TrilhasIndex() {
  const { carregando, erro, classes, classeAtual, personalizedTopics } =
    useTrilha();
  const { usuario } = useUsuario();
  const { pushMentorCue } = useIA();
  const palette = getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null);
  const personalizationCueKeyRef = useRef<string | null>(null);

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
        style={[styles.root, { backgroundColor: palette.background }]}
      >
        <CardSemDados
          title="Sem trilhas"
          description="Nenhuma trilha disponivel no momento."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: palette.background }]}
    >
      {/* Fundo do salão (sutil) */}
      <View style={[StyleSheet.absoluteFill, { opacity: 0.4 }]} pointerEvents="none">
        <HallBackground palette={palette} />
      </View>
      <TrilhaBase />
      <IAMentorPanel
        classeId={classeAtual?.classe_id ?? null}
        topicoId={trailMentorCue?.topicoId ?? null}
        scope="trilha_home"
        bottomOffset={10}
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
