// src/components/trilhas/TrilhaBase.tsx
import { getBrainHexGuideName } from "@/constants/profileImages";
import { useIA } from "@/context/IAContext";
import { useTrilha } from "@/context/TrilhaContext";
import { useTrailResumeTopic } from '@/hooks/useTrailResume';
import { useUsuario } from "@/context/SessaoContext";
import { getProfileArtwork, profileEmblems } from "@/constants/designAssets";
import { Color } from "@/styles/GlobalStyle";
import { getBrainHexProfileCapabilities } from "@/utils/brainHexCapabilities";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { aoTocarNoCelular, estadoDoTopico, montarPainelTopico, rotaDoTopico, topicoInicial } from "@/utils/painelTopicoTrilha";
import { calcularProgressoTrilha } from "@/utils/progressoTrilha";
import { mapaDoCelular } from "@/utils/gradeMapaTrilha";
import { registrarAlvoTour } from "@/utils/tourTargets";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import { UtilityIcon } from "@/components/UtilityIcon";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { ArvoreCelular } from "./ArvoreCelular";
import { TrilhaArvoreSimple } from "./ArvoreView";
import { GameHeader } from "./common/GameHeader";
import { ALTURA_FOLHA_RECOLHIDA, FolhaTopicoTrilha } from "./FolhaTopicoTrilha";
import { ListaCelular } from "./ListaCelular";
import { TrilhaLinearList } from "./ListaSimplesView";
import { MapaMosaicoCelular } from "./MapaMosaicoCelular";
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
    grafo,
  } = useTrilha();
  const { pushMentorCue, resolveFeature } = useIA();
  // Toque no nó: o primeiro seleciona e mostra o botão na folha; o segundo, no mesmo nó, abre.
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [folhaExpandida, setFolhaExpandida] = useState(false);
  const { usuario } = useUsuario();
  const currentTopicId = useTrailResumeTopic();
  const isFocused = useIsFocused();
  const { width: larguraJanela } = useWindowDimensions();
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

  const nos = grafo.nodes;
  const idFolha =
    selecionado !== null && nos.some((n) => String(n.id) === selecionado) ? selecionado : topicoInicial(nos, currentTopicId);
  const noFolha = nos.find((n) => String(n.id) === idFolha);
  const topicoDe = (id: string) => classeAtual.topicos.find((t) => String(t.id) === String(id));
  const painel = noFolha ? montarPainelTopico(noFolha, topicoDe(noFolha.id), currentTopicId, nos, grafo.edges) : null;
  const todos = [...nos]
    .sort((a, b) => a.sequence - b.sequence)
    .map((n, i) => {
      const estado = estadoDoTopico(n, currentTopicId);
      const pct = Number(topicoDe(n.id)?.percentual_concluido ?? 0);
      return { id: String(n.id), titulo: n.titulo, estado, percentual: estado === "done" ? 100 : Math.round(pct) || 0, numero: i + 1 };
    });
  const itemFolha = todos.find((t) => t.id === idFolha);
  // Celular (mobile-v1): mapa em mosaico de países e árvore por níveis, como no protótipo.
  const celular = mapaDoCelular(larguraJanela);
  const mosaico = visual === "mapa" && celular;
  const arvoreCelular = visual === "arvore" && celular;
  const listaCelular = visual === "lista" && celular;
  const itens = todos.map((t) => ({
    id: t.id,
    nome: t.titulo,
    estado: t.estado,
    percentual: t.percentual,
    personalizado: Boolean(personalizedTopics?.[Number(t.id)]),
  }));
  // No mapa, cada tópico é um país do tema da turma (sem tema, o próprio título).
  const paises = itens.map((t) => ({ ...t, nome: mapTheme?.countries?.[t.id]?.countryName ?? t.nome }));
  const niveis = grafo.levels.map((nivel) => nivel.map((n) => String(n.id)));
  const pais = idFolha ? mapTheme?.countries?.[idFolha] : undefined;
  const local = visual === "mapa" && pais ? `${pais.countryName} · Capital: ${pais.capitalName}` : null;
  const justificativa = idFolha ? String(personalizedTopics?.[Number(idFolha)]?.planMeta?.justification ?? "").trim() : "";
  const guiaDisponivel = resolveFeature({ scope: "session" }, "mentor_character").enabled;
  const tocarNo = (id: string) => {
    const no = nos.find((n) => String(n.id) === String(id));
    const acao = aoTocarNoCelular(no, selecionado);
    setSelecionado(String(id));
    if (acao === "abrir") router.push(rotaDoTopico(String(id)));
    else setFolhaExpandida(acao === "explicar-bloqueio");
  };

  return (
    <View style={[st.page, { backgroundColor: palette.background }]}>
      <View accessible={false} style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
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
        emblema={profileEmblems[perfil]}
        contagem={`${concluidos} de ${totalTopicos} módulos`}
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
        {mosaico && (
          <MapaMosaicoCelular
            topicos={paises}
            selecionado={idFolha}
            perfil={perfil}
            palette={palette}
            onSelecionar={tocarNo}
            tourTargetRef={journeyGuideTargetRef}
          />
        )}
        {visual === "mapa" && !mosaico && <TrilhaMapaHeroStable currentTopicId={currentTopicId} tourTargetRef={journeyGuideTargetRef} onSelecionarTopico={tocarNo} />}
        {arvoreCelular && (
          <ArvoreCelular
            topicos={itens}
            niveis={niveis}
            arestas={grafo.edges}
            selecionado={idFolha}
            perfil={perfil}
            palette={palette}
            onSelecionar={tocarNo}
            tourTargetRef={journeyGuideTargetRef}
          />
        )}
        {visual === "arvore" && !arvoreCelular && <TrilhaArvoreSimple currentTopicId={currentTopicId} onSelecionarTopico={tocarNo} />}
        {listaCelular && (
          <ListaCelular
            topicos={itens}
            selecionado={idFolha}
            perfil={perfil}
            palette={palette}
            onSelecionar={tocarNo}
            tourTargetRef={journeyGuideTargetRef}
          />
        )}
        {visual === "lista" && !listaCelular && <TrilhaLinearList currentTopicId={currentTopicId} tourTargetRef={journeyGuideTargetRef} onSelecionarTopico={tocarNo} />}
      </View>
      {/* Reserva o espaço da folha recolhida para o último nó não ficar escondido atrás dela. */}
      <View style={{ height: painel ? ALTURA_FOLHA_RECOLHIDA : 0 }} />
      <FolhaTopicoTrilha
        painel={painel}
        todos={todos}
        palette={palette}
        numero={itemFolha?.numero}
        local={local}
        personalizacao={justificativa ? { texto: justificativa, guia: getBrainHexGuideName(perfil) } : null}
        onConversar={
          guiaDisponivel
            ? () =>
                pushMentorCue({
                  message: justificativa,
                  title: itemFolha?.titulo ?? null,
                  topicoId: Number(idFolha),
                  actionLabel: "Conversar",
                  abrir: true,
                })
            : undefined
        }
        onSelecionar={(id) => {
          setSelecionado(id);
          setFolhaExpandida(nos.find((n) => String(n.id) === id)?.locked === true);
        }}
        expandida={folhaExpandida}
        onExpandir={setFolhaExpandida}
      />
    </View>
  );
};

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: Color.background },
  scenery: { width: '100%', height: '100%' },
  headerActions: { flexDirection: "row", alignItems: "center" },
});
