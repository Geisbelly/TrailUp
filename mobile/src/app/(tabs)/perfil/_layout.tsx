import { Stack } from "expo-router";

import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";

export default function PerfilStack() {
  const { usuario } = useUsuario();
  const palette = getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null);

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
          letterSpacing: 1.5,
          fontSize: 15,
        },
        headerTintColor: "#fff",
        headerShadowVisible: false,
        headerBottomShadowVisible: false,
        contentStyle: { backgroundColor: palette.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: "MEU PERFIL", headerShown: false }}
      />
      <Stack.Screen
        name="settings"
        options={{ title: "CONFIGURAÇÕES GERAIS" }}
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
      <Stack.Screen
        name="relatorio"
        options={{ title: "RELATÓRIO DO USUÁRIO" }}
      />
      <Stack.Screen
        name="biblioteca-conquistas"
        options={{ title: "BIBLIOTECA DE CONQUISTAS" }}
      />
    </Stack>
  );
}
