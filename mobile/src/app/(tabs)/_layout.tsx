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
import React, { useEffect, useRef } from "react";
import { Image, View } from "react-native";

import { ToastContainer } from "@/components/ToastContainer";
import { VigiaDePresenca } from "@/components/VigiaDePresenca";
import DesbloqueioModal from "@/components/DesbloqueioModal";
import { usePortoes } from "@/context/PortoesContext";
import { FirstAccessTour } from "@/components/FirstAccessTour";
import { useUsuario } from "@/context/SessaoContext";
import { MetricasProvider } from "@/context/MetricasContext";
import { user } from "@/database/mockUser";
import { FontFamily } from "@/styles/GlobalStyle";
import { useMonitorDeSessao } from "@/hooks/useMonitorDeSessao";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { estaNaTrilhaDeEstudo } from "@/utils/presencaDeEstudo";
import { registrarAlvoTour } from "@/utils/tourTargets";

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
              sceneStyle: {
                backgroundColor: palette.background,
              },
              tabBarStyle: {
                backgroundColor: palette.background,
                borderTopColor: palette.border,
                borderTopWidth: hideTabBarOnModule ? 0 : 1,
                height: hideTabBarOnModule ? 0 : 100,
                marginBottom: hideTabBarOnModule ? 0 : 10,
                paddingTop: hideTabBarOnModule ? 0 : 10,
                display: hideTabBarOnModule ? "none" : "flex",
              },
              headerStyle: { backgroundColor: palette.background },
              headerTitleStyle: { color: palette.text
                , fontFamily: FontFamily.poppinsExtraBold
              },
              tabBarLabelStyle: {
                fontFamily: FontFamily.inikaBold,
                fontSize: 12,
                letterSpacing: 0.2,
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
                    <MaterialCommunityIcons name={focused ? perfilConfig.icon : perfilConfig.icon_focus} size={focused ? 28 : 26} color={color} />
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
                tabBarIcon: ({ color, focused }) => <MaterialCommunityIcons 
                    size={focused ? 28 : 26} 
                    name={focused ? "bell" : "bell-outline"} 
                    color={color} 
                  />,
              }}
            />

            <Tabs.Screen
              name="social"
              options={{
                title: "Social",
                href: aberturas.social ? undefined : null,
                tabBarIcon: ({ color, focused }) => (
                  <MaterialCommunityIcons
                    size={focused ? 28 : 26}
                    name={focused ? "account-heart" : "account-heart-outline"}
                    color={color}
                  />
                ),
              }}
            />

             <Tabs.Screen 
              name="ranking"
              options={{
                title: "Ranking",
                // Travado nao e' so' escondido: o aluno continua pontuando, e a
                // posicao dele ja existe no banco quando a aba aparece.
                href: aberturas.rank ? undefined : null,
                // Ícone de Pódio (fiel à referência do ranking/liderança)
                // Outra opção boa seria "trophy-variant" se preferir o troféu detalhado
                tabBarIcon: ({ color, focused }) => (
                  <MaterialCommunityIcons 
                    size={focused ? 28 : 26} 
                    name={focused ? "podium" : "podium-bronze"} 
                    color={color} 
                  />
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
            </ConquistaRankProvider>
            <ToastContainer />
          </TrilhaProvider>
        </NotificationsProvider>
      </MetricasProvider>
      </VigiaDePresenca>
    </IAProvider>
  );
}
