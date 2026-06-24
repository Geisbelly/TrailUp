import {
  ModuleHeaderGuideButton,
  ModuleHeaderTitle,
} from "@/components/trilhas/ModuleHeaderTitle";
import { normalizeBrainHexProfile } from "@/constants/profileImages";
import { useUsuario } from "@/context/SessaoContext";
import { useTrilha } from "@/context/TrilhaContext";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { HeaderBackButton } from "@react-navigation/elements";
import { router, Stack } from "expo-router";

function countTopicBlocks(topico: any) {
  const conteudos = Array.isArray(topico?.conteudos) ? topico.conteudos : [];
  const atividades = Array.isArray(topico?.atividades) ? topico.atividades : [];
  return conteudos.length + atividades.length;
}

function countCompletedTopicBlocks(topico: any) {
  const conteudos = Array.isArray(topico?.conteudos) ? topico.conteudos : [];
  const atividades = Array.isArray(topico?.atividades) ? topico.atividades : [];

  const conteudosConcluidos = conteudos.filter((conteudo: any) => {
    const status = String(conteudo?.status ?? "").toLowerCase();
    const percentual = Number(conteudo?.percentual_concluido ?? 0);
    return status.includes("concl") || percentual >= 100;
  }).length;

  const atividadesConcluidas = atividades.filter((atividade: any) => {
    const status = String(atividade?.status ?? "").toLowerCase();
    const percentual = Number(atividade?.percentual_concluido ?? 0);
    return status.includes("concl") || percentual >= 100;
  }).length;

  return conteudosConcluidos + atividadesConcluidas;
}

export default function TrilhaStack() {
  const { grafo, classeAtual, perfil, personalizedTopics } = useTrilha();
  const { usuario } = useUsuario();
  const palette = getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? perfil ?? null);
  const normalizedProfile = normalizeBrainHexProfile(usuario?.perfis?.[0]?.nome ?? perfil) ?? "mastermind";

  const headerForId = ({ route }: any) => {
    const { id }: any = route.params || {};
    const trilhaNode = grafo?.nodes?.find((n) => String(n.id) === String(id)) || null;
    const topico: any = classeAtual?.topicos?.find((t) => t.id === Number(id)) || null;

    const titulo = trilhaNode?.titulo || topico?.titulo || "Detalhes";
    const descricao = topico?.descricao || "";
    const totalBlocos = countTopicBlocks(topico);
    const concluidos = countCompletedTopicBlocks(topico);
    const hasTopicPersonalization = Boolean(personalizedTopics?.[Number(id)]);
    const hasTimer = ["survivor", "mastermind", "achiever", "conqueror", "daredevil"].includes(
      String(perfil)
    );
    const hasBattle = String(perfil) === "survivor";

    return {
      headerTitle: () => (
        <ModuleHeaderTitle
          title={titulo}
          description={descricao}
          profile={normalizedProfile}
          totalBlocks={totalBlocos}
          completedBlocks={concluidos}
          hideGuideButton
          guideVariant={hasTopicPersonalization ? "personalizado" : "mock_modulo"}
          visibleElements={{
            hasChat: true,
            hasProgress: totalBlocos > 0,
            hasTimer,
            hasBattle,
          }}
          perfis={usuario?.perfis ?? null}
        />
      ),
      headerRight: () => (
        <ModuleHeaderGuideButton
          profile={normalizedProfile}
          title={titulo}
          totalBlocks={totalBlocos}
          completedBlocks={concluidos}
          guideVariant={hasTopicPersonalization ? "personalizado" : "mock_modulo"}
          visibleElements={{
            hasChat: true,
            hasProgress: totalBlocos > 0,
            hasTimer,
            hasBattle,
          }}
          perfis={usuario?.perfis ?? null}
        />
      ),
      headerLeft: () => (
        <HeaderBackButton tintColor={palette.text} onPress={() => router.push("/(tabs)")} />
      ),
    };
  };

  return (
    <Stack
      screenOptions={{
        headerTitleAlign: "center",
        headerStyle: { backgroundColor: palette.background },
        headerTintColor: palette.text,
        contentStyle: { backgroundColor: palette.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Trilha",
          headerShown: true,
        }}
      />

      <Stack.Screen name="[id]" options={headerForId} />
    </Stack>
  );
}
