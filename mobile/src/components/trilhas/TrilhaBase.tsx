// src/components/trilhas/TrilhaBase.tsx
import { normalizeBrainHexProfile } from "@/constants/profileImages";
import { useUsuario } from "@/context/SessaoContext";
import { useTrilha } from "@/context/TrilhaContext";
import { Color } from "@/styles/GlobalStyle";
import { buildClasseAcademicMetrics } from "@/utils/classeMetrics";
import { unificarContadores } from "@/utils/progressoPersonalizado";
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
    progressoPersonalizado,
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
  // O progresso soma os DOIS livros-caixa. `getProgressoGeral` conta apenas
  // conteudo/atividade do professor, entao a barra ficava parada enquanto o
  // aluno avancava no material personalizado e nos quizzes da apresentacao --
  // que e o "progresso desatualizado" relatado. Ver progressoPersonalizado.ts.
  const academico = buildClasseAcademicMetrics(classeAtual);
  const unificado = unificarContadores({
    academico: {
      conteudosConcluidos: academico.conteudosConcluidos,
      totalConteudos: academico.totalConteudos,
      atividadesConcluidas: academico.atividadesConcluidas,
      totalAtividades: academico.totalAtividades,
      conteudoIds: classeAtual.topicos.flatMap((topico: any) =>
        ((topico?.conteudos ?? []) as any[])
          .map((conteudo) => Number(conteudo?.id))
          .filter((id) => Number.isFinite(id))
      ),
    },
    personalizado: progressoPersonalizado,
  });
  const totalBlocos = unificado.totalConteudos + unificado.totalAtividades;
  const blocosFeitos = unificado.conteudosConcluidos + unificado.atividadesConcluidas;
  const progressoBruto =
    totalBlocos > 0
      ? (blocosFeitos / totalBlocos) * 100
      : typeof (classeAtual as any).getProgressoGeral === "function"
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
        // Sem o bonus de slides: ele e XP, e somar XP a uma taxa de conclusao
        // fazia a barra bater 100% com topicos ainda pendentes -- e, acima de
        // 90%, o bonus sumia no clamp sem o aluno entender por que. O calculo
        // continua no TrilhaContext (trilhaSlideBonusPercent) para quando o XP
        // ganhar um indicador proprio.
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
