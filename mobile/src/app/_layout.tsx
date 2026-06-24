import { LoadingState } from "@/components/LoadingState";
import { TelemetryConsentGate } from "@/components/TelemetryConsentGate";
import LoadingScreen from "@/components/funcionais/Loading";
import { DialogProvider } from "@/context/DialogContext";
import { PersonalizacaoProviderProvider } from "@/services/personalizacao/PersonalizacaoProviderContext";
import { LoadingProvider, useLoading } from "@/context/LoadingContext";
import { SessionProvider, useUsuario } from "@/context/SessaoContext";
import { getSessionSafe, supabase } from "@/database/supabase";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
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
  const router = useRouter();
  const segments = useSegments();
  const { usuario, autenticado, carregando } = useUsuario();

  useEffect(() => {
    console.log("[VerificacaoDeRota] Carregando:", carregando, "Usuario:", !!usuario, "Autenticado:", autenticado);
    if (carregando && !autenticado) return;

    const currentGroup = segments[0];
    const inAuthGroup = currentGroup === "(auth)";
    const inTabsGroup = currentGroup === "(tabs)";

    if (autenticado && inTabsGroup) return;
    if (!autenticado && inAuthGroup) return;

    router.replace(autenticado ? "/(tabs)" : "/(auth)");
  }, [autenticado, carregando, usuario, router, segments]);

  return null;
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
        <LoadingState title="Preparando sessao" message="Validando suas credenciais..." />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <LoadingProvider>
          <SessionProvider>
            <PersonalizacaoProviderProvider>
            <DialogProvider>
              <LoadingOverlay />
              <VerificacaoDeRota />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen
                  name="cadastrarServico"
                  options={{
                    headerShown: true,
                    title: "Oferecer Novo Servico",
                  }}
                />
              </Stack>
              <TelemetryConsentGate />
            </DialogProvider>
            </PersonalizacaoProviderProvider>
          </SessionProvider>
        </LoadingProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
