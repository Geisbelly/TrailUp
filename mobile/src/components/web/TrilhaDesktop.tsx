import { useIsFocused } from "@react-navigation/native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { ProfileEmblem } from "@/components/ProfileEmblem";
import { TrilhaArvoreSimple } from "@/components/trilhas/ArvoreView";
import { TrilhaLinearList } from "@/components/trilhas/ListaSimplesView";
import { TrilhaMapaHeroStable } from "@/components/trilhas/MapaViewStable";
import { type GuideTargetRefs, ModuleHeaderGuideButton } from "@/components/trilhas/ModuleHeaderTitle";
import { PainelTopicoTrilha } from "@/components/web/PainelTopicoTrilha";
import { getProfileArtwork } from "@/constants/designAssets";
import { useUsuario } from "@/context/SessaoContext";
import { useTrilha } from "@/context/TrilhaContext";
import { useTrailResumeTopic } from "@/hooks/useTrailResume";
import { FontFamily } from "@/styles/GlobalStyle";
import { getBrainHexProfileCapabilities } from "@/utils/brainHexCapabilities";
import { estadoDoTopico, montarPainelTopico, topicoInicial } from "@/utils/painelTopicoTrilha";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { calcularProgressoTrilha } from "@/utils/progressoTrilha";
import { registrarAlvoTour } from "@/utils/tourTargets";

/**
 * Trilha na web em tela larga (#346, protótipo v4, `03-trilha.html`): o cartão
 * de progresso em cima, o tabuleiro (mapa, árvore ou lista, conforme o perfil)
 * embaixo, e o painel do tópico selecionado numa coluna de 300 px à direita.
 * A Bag fica na barra superior da moldura, não aqui.
 */
export function TrilhaDesktop({ chatGuideTargetRef }: { chatGuideTargetRef?: React.RefObject<View | null> }) {
  const { classeAtual, carregando, erro, visual, mapTheme, personalizedTopics, progressoPersonalizado, perfil, grafo } =
    useTrilha();
  const { usuario } = useUsuario();
  const atualId = useTrailResumeTopic();
  const isFocused = useIsFocused();
  const palette = getProfileShellPalette(perfil);
  const capabilities = getBrainHexProfileCapabilities(perfil);
  const progressoRef = useRef<View | null>(null);
  const jornadaRef = useRef<View | null>(null);
  const guideTargetRefs = useMemo<GuideTargetRefs>(
    () => ({ progress: progressoRef, journey: jornadaRef, map: jornadaRef, tree: jornadaRef, list: jornadaRef, chat: chatGuideTargetRef }),
    [chatGuideTargetRef],
  );
  useEffect(() => (isFocused ? registrarAlvoTour("trilha_resumo", progressoRef) : undefined), [isFocused]);
  useEffect(() => (isFocused ? registrarAlvoTour("trilha_mapa", jornadaRef) : undefined), [isFocused]);

  const [selecionado, setSelecionado] = useState<string | null>(null);
  // As vistas medem pelo tabuleiro, não pela janela; só aparecem depois da primeira medida.
  const [quadro, setQuadro] = useState<{ largura: number; altura: number } | null>(null);
  const nos = grafo.nodes;
  const idPainel =
    selecionado !== null && nos.some((n) => String(n.id) === selecionado) ? selecionado : topicoInicial(nos, atualId);
  const noPainel = nos.find((n) => String(n.id) === idPainel);
  const topicoDe = (id: string) => classeAtual?.topicos.find((t) => String(t.id) === String(id));
  const painel = noPainel ? montarPainelTopico(noPainel, topicoDe(noPainel.id), atualId, nos, grafo.edges) : null;
  const todos = [...nos]
    .sort((a, b) => a.sequence - b.sequence)
    .map((n) => {
      const estado = estadoDoTopico(n, atualId);
      const pct = Number(topicoDe(n.id)?.percentual_concluido ?? 0);
      return { id: String(n.id), titulo: n.titulo, estado, percentual: estado === "done" ? 100 : Math.round(pct) || 0 };
    });

  if (carregando || erro || !classeAtual) return <View style={[s.tela, { backgroundColor: palette.background }]} />;

  const ehMapa = visual === "mapa";
  const nome = ehMapa ? (mapTheme?.worldName ?? classeAtual.resumo?.materia_nome ?? "Classe") : (classeAtual.resumo?.materia_nome ?? "Classe");
  const { progresso, totalTopicos, concluidos } = calcularProgressoTrilha(classeAtual, progressoPersonalizado);
  const pct = Math.round(progresso);

  return (
    <View style={[s.tela, { backgroundColor: palette.background }]}>
      <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
        <Image key={perfil} source={getProfileArtwork(perfil, ehMapa ? "map" : "trail")} resizeMode="cover" style={s.cenario} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, opacity: 0.35 }]} />
      </View>

      <View style={s.esquerda}>
        <View
          ref={progressoRef}
          collapsable={false}
          accessibilityLabel="Progresso da trilha"
          style={[s.hud, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          <ProfileEmblem profile={perfil} size={48} />
          <View style={s.hudTitulo}>
            <Text style={[s.eyebrow, { color: palette.accent }]}>{ehMapa ? "MAPA DA JORNADA" : "SUA TRILHA"}</Text>
            <Text style={[s.titulo, { color: palette.text }]} numberOfLines={1}>{nome}</Text>
          </View>
          <View style={s.hudProgresso}>
            <View style={s.hudLinha}>
              <Text style={[s.pequeno, { color: palette.textSubtle }]}>
                <Text style={[s.pct, { color: palette.text }]}>{pct}%</Text> concluído
              </Text>
              <Text style={[s.pequeno, { color: palette.textSubtle }]}>
                {concluidos} de {totalTopicos} módulos
              </Text>
            </View>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: pct }}
              style={[s.trilho, { backgroundColor: palette.progressTrack }]}
            >
              <View style={[s.preenchido, { width: `${pct}%`, backgroundColor: palette.accent }]} />
            </View>
          </View>
          <View style={[s.separador, { backgroundColor: palette.border }]} />
          <ModuleHeaderGuideButton
            profile={perfil}
            title={nome}
            totalBlocks={totalTopicos}
            completedBlocks={concluidos}
            scope="trilha"
            variant="icon"
            guideVariant={Object.keys(personalizedTopics ?? {}).length > 0 ? "personalizado" : "padrao_trilha"}
            visibleElements={{ visualMode: visual, hasChat: capabilities.hasChat, hasProgress: true }}
            perfis={usuario?.perfis ?? null}
            targetRefs={guideTargetRefs}
          />
        </View>

        <View
          ref={visual === "arvore" ? jornadaRef : undefined}
          collapsable={false}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (width !== quadro?.largura || height !== quadro?.altura) setQuadro({ largura: width, altura: height });
          }}
          style={[s.tabuleiro, { borderColor: palette.border }]}
        >
          {quadro && visual === "mapa" && (
            <TrilhaMapaHeroStable currentTopicId={atualId} tourTargetRef={jornadaRef} onSelecionarTopico={setSelecionado} quadro={quadro} />
          )}
          {quadro && visual === "arvore" && <TrilhaArvoreSimple currentTopicId={atualId} onSelecionarTopico={setSelecionado} quadro={quadro} />}
          {quadro && visual === "lista" && (
            <TrilhaLinearList currentTopicId={atualId} tourTargetRef={jornadaRef} onSelecionarTopico={setSelecionado} quadro={quadro} />
          )}
        </View>
      </View>

      <View style={s.direita}>
        <PainelTopicoTrilha painel={painel} todos={todos} palette={palette} onSelecionar={setSelecionado} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, flexDirection: "row" },
  cenario: { width: "100%", height: "100%" },
  esquerda: { flex: 1, minWidth: 0, paddingLeft: 32, paddingTop: 28, paddingBottom: 28, gap: 20 },
  hud: { height: 88, borderRadius: 20, borderWidth: 1, paddingLeft: 18, paddingRight: 20, flexDirection: "row", alignItems: "center", gap: 18 },
  hudTitulo: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: { fontFamily: FontFamily.interMedium, fontSize: 10.5, fontWeight: "700", letterSpacing: 1.1 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 22 },
  hudProgresso: { width: 260 },
  hudLinha: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 },
  pequeno: { fontFamily: FontFamily.interMedium, fontSize: 12.5 },
  pct: { fontFamily: FontFamily.inikaBold, fontSize: 16 },
  trilho: { height: 8, borderRadius: 4, overflow: "hidden" },
  preenchido: { height: "100%", borderRadius: 4 },
  separador: { width: 1, height: 40 },
  tabuleiro: { flex: 1, minHeight: 0, borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  direita: { paddingHorizontal: 32, paddingTop: 28, paddingBottom: 28 },
});
