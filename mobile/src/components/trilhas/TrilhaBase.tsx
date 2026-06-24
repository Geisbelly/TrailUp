// src/components/trilhas/TrilhaBase.tsx
import { normalizeBrainHexProfile } from "@/constants/profileImages";
import { useUsuario } from "@/context/SessaoContext";
import { useTrilha } from "@/context/TrilhaContext";
import { Color } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import React from "react";
import { StyleSheet, View } from "react-native";
import { TrilhaArvoreSimple } from "./ArvoreView";
import { GameHeader } from "./common/GameHeader";
import { TrilhaLinearList } from "./ListaSimplesView";
import { TrilhaMapaHeroStable } from "./MapaViewStable";
import { ModuleHeaderGuideButton } from "./ModuleHeaderTitle";

export const TrilhaBase: React.FC = () => {
  const {
    classeAtual,
    carregando,
    erro,
    visual,
    mapTheme,
    personalizedTopics,
  } = useTrilha();
  const { usuario } = useUsuario();
  const palette = getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null);
  const profile =
    normalizeBrainHexProfile(usuario?.perfis?.[0]?.nome) ?? "mastermind";
  const hasTrailPersonalization =
    Object.keys(personalizedTopics ?? {}).length > 0;

  if (carregando || !classeAtual) return <View style={st.page} />;
  if (erro) return <View style={st.page} />;

  const nome =
    visual === "mapa"
      ? (mapTheme?.worldName ?? classeAtual.resumo?.materia_nome ?? "Classe")
      : (classeAtual.resumo?.materia_nome ?? "Classe");
  const subtitulo =
    visual === "mapa" ? (mapTheme?.classLabel ?? "Reino da classe") : "Trilha";
  const progressoBruto =
    typeof (classeAtual as any).getProgressoGeral === "function"
      ? (classeAtual as any).getProgressoGeral()
      : ((classeAtual.resumo?.porcentagemConcluida as number | undefined) ?? 0);
  const progresso = Math.max(0, Math.min(100, Number(progressoBruto) || 0));
  const totalTopicos = classeAtual.topicos.length;
  const concluidos = classeAtual.topicos.filter((topico) => {
    const status = String(topico.status ?? "").toLowerCase();
    const pct = Number(topico.percentual_concluido ?? 0);
    return status.includes("concl") || pct >= 100;
  }).length;

  return (
    <View style={[st.page, { backgroundColor: palette.background }]}>
      <GameHeader
        titulo={nome}
        subtitulo={subtitulo}
        xp={Math.round(progresso)}
        meta={100}
        palette={palette}
        rightSlot={
          <ModuleHeaderGuideButton
            profile={profile}
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
              hasChat: true,
              hasProgress: true,
            }}
            perfis={usuario?.perfis ?? null}
          />
        }
      />
      <View style={{ flex: 1 }}>
        {visual === "mapa" && <TrilhaMapaHeroStable />}
        {visual === "arvore" && <TrilhaArvoreSimple />}
        {visual === "lista" && <TrilhaLinearList />}
      </View>
    </View>
  );
};

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: Color.background },
});
