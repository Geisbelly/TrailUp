import { HapticTab } from "@/components/haptic-tab";
import { bannerImages, brainHexConfig, brainHexImageMap, getProfileImageByString, normalizeBrainHexProfile } from "@/constants/profileImages";
import { ConquistaRankProvider } from "@/context/ConquistaRankContext";
import { IAProvider } from "@/context/IAContext";
import { NotificationsProvider } from "@/context/NotificacaoContext";
import { TrilhaProvider } from "@/context/TrilhaContext";
// 1. Importando MaterialCommunityIcons (mais criativo/detalhado)
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BottomTabBar, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Tabs, useSegments } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Image, View } from "react-native";

import { ToastContainer } from "@/components/ToastContainer";
import { VigiaDePresenca } from "@/components/VigiaDePresenca";
import DesbloqueioModal from "@/components/DesbloqueioModal";
import { usePortoes } from "@/context/PortoesContext";
import { FirstAccessTour } from "@/components/FirstAccessTour";
import { useUsuario } from "@/context/SessaoContext";
import { MetricasProvider } from "@/context/MetricasContext";
import { user } from "@/database/mockUser";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMonitorDeSessao } from "@/hooks/useMonitorDeSessao";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { estaNaTrilhaDeEstudo } from "@/utils/presencaDeEstudo";
import { registrarAlvoTour } from "@/utils/tourTargets";
import type { Funcionalidade } from "@/utils/portoes";

function TourAwareTabBar(props: BottomTabBarProps) {
  const targetRef = useRef<View | null>(null);
  useEffect(() => registrarAlvoTour("abas_principais", targetRef), []);

  return (
    <View ref={targetRef} collapsable={false}>
      <BottomTabBar {...props} />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { usuario } = useUsuario();
  const segments = useSegments() as string[];

  // Login, tempo de uso, push token e lembretes locais. Fica aqui e nao no
  // layout raiz porque so faz sentido dentro da area autenticada — no grupo
  // (auth) nao existe aluno para monitorar.
  useMonitorDeSessao();

  const activeProfileName = usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome;
  const brainProfile = normalizeBrainHexProfile(activeProfileName) ?? undefined;
  const perfilImage =
    (brainProfile && brainHexImageMap[brainProfile] !== undefined
      ? bannerImages[brainHexImageMap[brainProfile]]
      : getProfileImageByString(activeProfileName ?? "")) || user.avatar;
  const perfilConfig = brainProfile ? brainHexConfig[brainProfile] : undefined;
  const palette = getProfileShellPalette(activeProfileName ?? null);
  const { aberturas, cerimoniaAtual, concluirCerimonia } = usePortoes();
  const [portaoBloqueado, setPortaoBloqueado] = useState<Funcionalidade | null>(null);

  const perfilFoto =
    usuario?.foto_url
      ? { uri: usuario.foto_url }
      : perfilImage;
  // Mesma leitura de rota que o vigia de presença usa para saber se o aluno
  // está estudando: esconder a barra e "não perguntar agora" respondem à mesma
  // pergunta, e duas cópias divergiriam.
  const hideTabBarOnModule = estaNaTrilhaDeEstudo(segments as readonly string[]);

  return (
    <IAProvider>
      <VigiaDePresenca>
      <MetricasProvider>
        <NotificationsProvider>
          <TrilhaProvider>
            <ConquistaRankProvider>
              <Tabs
            tabBar={(props) => <TourAwareTabBar {...props} />}
            screenOptions={{
              tabBarActiveTintColor: palette.accent,
              tabBarInactiveTintColor: palette.inactive,
              tabBarActiveBackgroundColor: palette.accentMuted,
              tabBarItemStyle: { borderRadius: 6, marginHorizontal: 2 },
              sceneStyle: {
                backgroundColor: palette.background,
              },
              tabBarStyle: {
                backgroundColor: palette.surface,
                borderTopColor: palette.borderStrong,
                borderTopWidth: hideTabBarOnModule ? 0 : 1,
                height: hideTabBarOnModule ? 0 : 66 + insets.bottom,
                paddingBottom: hideTabBarOnModule ? 0 : Math.max(insets.bottom, 8),
                paddingTop: hideTabBarOnModule ? 0 : 8,
                display: hideTabBarOnModule ? "none" : "flex",
              },
              headerStyle: { backgroundColor: palette.background },
              headerTitleStyle: { color: palette.text
                , fontFamily: FontFamily.poppinsExtraBold
              },
              tabBarLabelStyle: {
                fontFamily: FontFamily.interMedium,
                fontSize: 10,
                fontWeight: "600",
                letterSpacing: 0,
              },
              headerShown: false,
              tabBarButton: HapticTab,
            }}>

            <Tabs.Screen
              name="index"
              options={{
                title: 'Trilha',
                tabBarIcon: ({ color, focused }) =>
                  perfilConfig ? (
                    <MaterialCommunityIcons
                      name={focused ? perfilConfig.icon : perfilConfig.icon_focus}
                      size={focused ? 28 : 26}
                      color={color}
                    />
                  ) : (
                    // 2. Usando 'bookshelf' para representar uma biblioteca cheia e visual
                    // Outra opção boa seria 'library-shelves' ou 'book-open-variant'
                    <MaterialCommunityIcons size={focused ? 28 : 26} name="bookshelf" color={color} />
                  ),
              }}
            />

            <Tabs.Screen
              name="notificacoes"
              options={{
                title: 'Notificações',
                tabBarIcon: ({ focused }) => <MaterialCommunityIcons
                    size={focused ? 28 : 26}
                    name={focused ? "bell" : "bell-outline"}
                    color={Color.colorWhite}
                  />,
              }}
            />

            <Tabs.Screen
              name="social"
              listeners={{
                tabPress: (event) => {
                  if (!aberturas.social) {
                    event.preventDefault();
                    setPortaoBloqueado("social");
                  }
                },
              }}
              options={{
                title: "Social",
                href: undefined,
                tabBarIcon: ({ focused }) => (
                  <View style={{ opacity: aberturas.social ? 1 : 0.5 }}>
                    <MaterialCommunityIcons
                      size={focused ? 28 : 26}
                      name={focused ? "account-group" : "account-group-outline"}
                      color={Color.colorWhite}
                    />
                    {!aberturas.social ? <MaterialCommunityIcons name="lock" size={12} color={Color.colorWhite} style={{ position: "absolute", right: -5, bottom: -2 }} /> : null}
                  </View>
                ),
              }}
            />

             <Tabs.Screen 
              name="ranking"
              listeners={{
                tabPress: (event) => {
                  if (!aberturas.rank) {
                    event.preventDefault();
                    setPortaoBloqueado("rank");
                  }
                },
              }}
              options={{
                title: "Ranking",
                href: undefined,
                // Ícone de Pódio (fiel à referência do ranking/liderança)
                // Outra opção boa seria "trophy-variant" se preferir o troféu detalhado
                tabBarIcon: ({ focused }) => (
                  <View style={{ opacity: aberturas.rank ? 1 : 0.5 }}>
                    <MaterialCommunityIcons
                      size={focused ? 28 : 26}
                      name={focused ? "podium" : "podium-bronze"}
                      color={Color.colorWhite}
                    />
                    {!aberturas.rank ? <MaterialCommunityIcons name="lock" size={12} color={Color.colorWhite} style={{ position: "absolute", right: -5, bottom: -2 }} /> : null}
                  </View>
                ),
              }}
            />

            <Tabs.Screen 
              name="perfil"
              options={{
                title: "Perfil",
  
                tabBarIcon: ({ color, focused }) => (
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      borderWidth: focused ? 2 : 1,
                      borderColor: focused ? color : palette.border,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: focused ? palette.accentSoft : "transparent",
                      overflow: "hidden",
                    }}
                  >
                    <Image
                      source={perfilFoto || user.avatar}
                      style={{ width: focused ? 28 : 26, height: focused ? 28 : 26, borderRadius: 15 }}
                    />
                  </View>
                ),
              }}
            />
      
            <Tabs.Screen
              name="trilha"
              options={{
                href: null, 
              }}
            />
              </Tabs>
              <FirstAccessTour
                userId={usuario?.id}
                profile={activeProfileName}
              />
              <DesbloqueioModal
                funcionalidade={cerimoniaAtual}
                color={palette.accent}
                onClose={concluirCerimonia}
              />
              <DesbloqueioModal
                funcionalidade={portaoBloqueado}
                color={palette.accent}
                bloqueado
                onClose={() => setPortaoBloqueado(null)}
              />
            </ConquistaRankProvider>
            <ToastContainer />
          </TrilhaProvider>
        </NotificationsProvider>
      </MetricasProvider>
      </VigiaDePresenca>
    </IAProvider>
  );
}
