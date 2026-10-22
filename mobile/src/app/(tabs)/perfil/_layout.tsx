import { Stack } from "expo-router";

import { useUsuario } from "@/context/SessaoContext";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { perfilVisualDoAluno } from "@/utils/brainHex";

export default function PerfilStack() {
  const { usuario } = useUsuario();
  // Na web em tela larga (#346) as Configurações têm título próprio no painel.
  const desktop = useDesktopWeb();
  const palette = getProfileShellPalette(perfilVisualDoAluno(usuario));

  return (
    <Stack
      screenOptions={{
        headerTitleAlign: "center",
        headerStyle: {
          backgroundColor: palette.background,
        },
        headerTitleStyle: {
          color: "#fff",
          fontFamily: FontFamily.inikaBold,
          fontSize: 15,
        },
        headerTintColor: "#fff",
        headerShadowVisible: false,
        contentStyle: { backgroundColor: palette.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: "MEU PERFIL", headerShown: false }}
      />
      <Stack.Screen
        name="settings"
        options={{ title: "CONFIGURAÇÕES GERAIS", headerShown: !desktop }}
      />
      <Stack.Screen
        name="coleta-dados"
        options={{ title: "COLETA E ACESSOS" }}
      />
      <Stack.Screen name="info" options={{ title: "INFORMAÇÕES" }} />
      <Stack.Screen
        name="info-versao"
        options={{ title: "INFORMAÇÕES DA VERSÃO" }}
      />
      <Stack.Screen name="info-app" options={{ title: "INFORMAÇÕES DO APP" }} />
      <Stack.Screen name="excluir" options={{ title: "SOLICITAR EXCLUSÃO" }} />
      <Stack.Screen name="study" options={{ title: "ESTUDOS" }} />
      <Stack.Screen name="notifications" options={{ title: "NOTIFICAÇÕES" }} />
      <Stack.Screen
        name="metricas-estilo"
        options={{ title: "ESTILO DAS MÉTRICAS" }}
      />
      <Stack.Screen name="appearance" options={{ title: "APARÊNCIA" }} />
      <Stack.Screen
        name="resetar-senha"
        options={{ title: "REDEFINIR SENHA" }}
      />
      {/* Só existe na web em tela larga (#346); lá o título está na própria página. */}
      <Stack.Screen name="loja" options={{ title: "LOJA", headerShown: false }} />
      <Stack.Screen
        name="relatorio"
        // Na web em tela larga (#346) o título está na própria página.
        options={{ title: "RELATÓRIO DO USUÁRIO", headerShown: !desktop }}
      />
      <Stack.Screen
        name="biblioteca-conquistas"
        // Na web em tela larga (#346) o título está na própria página.
        options={{ title: "BIBLIOTECA DE CONQUISTAS", headerShown: !desktop }}
      />
    </Stack>
  );
}
