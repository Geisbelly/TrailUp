import { LoadingState } from "@/components/LoadingState";
import { TelemetryConsentGate } from "@/components/TelemetryConsentGate";
import LoadingScreen from "@/components/funcionais/Loading";
import { DialogProvider, useDialog } from "@/context/DialogContext";
import { PersonalizacaoProviderProvider } from "@/services/personalizacao/PersonalizacaoProviderContext";
import { LoadingProvider, useLoading } from "@/context/LoadingContext";
import { SessionProvider, useUsuario } from "@/context/SessaoContext";
import { PortoesProvider } from "@/context/PortoesContext";
import { consumeSupabaseUrlAuthError, getSessionSafe, supabase } from "@/database/supabase";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { consumePendingRoute, setPendingRoute } from "@/utils/pendingRoute";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Redirect, Stack, usePathname, useSegments, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

export const unstable_settings = {
  anchor: "(tabs)",
};

function LoadingOverlay() {
  const { loading } = useLoading();
  const { carregando, autenticado } = useUsuario();
  const segments = useSegments();
  const inAuthGroup = segments[0] === "(auth)";
  const blockBySession = carregando && !autenticado;
  const blockByGlobalLoading = loading && (!autenticado || inAuthGroup);
  if (!blockByGlobalLoading && !blockBySession) return null;
  return <LoadingScreen forceShow />;
}

function VerificacaoDeRota() {
  const segments = useSegments();
  const pathname = usePathname();
  const { usuario, autenticado, carregando } = useUsuario();
  const { showDialog } = useDialog();

  useEffect(() => {
    // Token invalido/expirado na URL (link de confirmacao vencido, consentimento
    // OAuth negado etc.): sem isso o aluno so via a sessao nao se estabelecer,
    // sem nenhuma pista do motivo.
    const urlError = consumeSupabaseUrlAuthError();
    if (urlError) {
      showDialog({ title: "Não foi possível entrar", description: urlError, tone: "error" });
    }
  }, [showDialog]);

  console.log("[VerificacaoDeRota] Carregando:", carregando, "Usuario:", !!usuario, "Autenticado:", autenticado);

  if (carregando && !autenticado) return null;

  const currentGroup = segments[0];
  const inAuthGroup = currentGroup === "(auth)";
  const inTabsGroup = currentGroup === "(tabs)";

  if (autenticado && inTabsGroup) return null;
  if (!autenticado && inAuthGroup) return null;

  // `<Redirect>` troca a rota (e a URL, na web) de forma sincrona durante o
  // render — diferente do `router.replace` num useEffect, que so navegava
  // depois do commit e deixava a barra de enderecos presa na rota protegida
  // (issue #27).
  if (autenticado) {
    const destino = consumePendingRoute();
    return <Redirect href={(destino ?? "/(tabs)") as Href} />;
  }

  if (inTabsGroup && pathname) {
    setPendingRoute(pathname);
  }
  return <Redirect href="/(auth)" />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    const verificarSessao = async () => {
      try {
        const session = await getSessionSafe();
        console.log("[RootLayout] Sessao inicial verificada:", !!session);
      } catch (error) {
        console.warn("[RootLayout] Falha ao verificar sessao inicial:", error);
      } finally {
        setSessionChecked(true);
      }
    };

    void verificarSessao();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[RootLayout] Mudanca no estado de autenticacao:", event, !!session);
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  if (!sessionChecked) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <LoadingState title="Preparando sessão" message="Validando suas credenciais..." />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <LoadingProvider>
          <SessionProvider>
            <PersonalizacaoProviderProvider>
            <PortoesProvider>
            <DialogProvider>
              <LoadingOverlay />
              <VerificacaoDeRota />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="(auth)" />
              </Stack>
              <TelemetryConsentGate />
            </DialogProvider>
            </PortoesProvider>
            </PersonalizacaoProviderProvider>
          </SessionProvider>
        </LoadingProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
