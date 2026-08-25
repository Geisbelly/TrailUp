import { HapticTab } from "@/components/haptic-tab";
import { bannerImages, brainHexConfig, brainHexImageMap, getProfileImageByString } from "@/constants/profileImages";
import { ConquistaRankProvider } from "@/context/ConquistaRankContext";
import { IAProvider } from "@/context/IAContext";
import { NotificationsProvider } from "@/context/NotificacaoContext";
import { TrilhaProvider } from "@/context/TrilhaContext";
// 1. Importando MaterialCommunityIcons (mais criativo/detalhado)
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs, useSegments } from "expo-router";
import { Image, View } from "react-native";

import { ToastContainer } from "@/components/ToastContainer";
import { useUsuario } from "@/context/SessaoContext";
import { MetricasProvider } from "@/context/MetricasContext";
import { user } from "@/database/mockUser";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";

export default function TabLayout() {
  const { usuario } = useUsuario();
  const segments = useSegments() as string[];

  const brainProfile =
    (usuario?.perfis?.[0]?.nome as keyof typeof brainHexImageMap | undefined) ||
    (usuario?.perfis?.[0]?.nome as keyof typeof brainHexImageMap | undefined);
  const perfilImage =
    (brainProfile && brainHexImageMap[brainProfile] !== undefined
      ? bannerImages[brainHexImageMap[brainProfile]]
      : getProfileImageByString(usuario?.perfis?.[0]?.nome ?? "")) || user.avatar;
  const perfilConfig = brainProfile ? brainHexConfig[brainProfile] : undefined;
  const palette = getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null);

  const perfilFoto =
    usuario?.foto_url
      ? { uri: usuario.foto_url }
      : perfilImage;
  const trilhaIndex = segments.indexOf("trilha");
  const nextTrilhaSegment = trilhaIndex >= 0 ? segments[trilhaIndex + 1] : null;
  const hideTabBarOnModule = Boolean(
    nextTrilhaSegment &&
      nextTrilhaSegment !== "index" &&
      nextTrilhaSegment !== "_layout"
  );

  return (
    <IAProvider>
      <MetricasProvider>
        <NotificationsProvider>
          <TrilhaProvider>
            <ConquistaRankProvider>
              <Tabs
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
              name="ranking"
              options={{
                title: "Ranking",
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
            </ConquistaRankProvider>
            <ToastContainer />
          </TrilhaProvider>
        </NotificationsProvider>
      </MetricasProvider>
    </IAProvider>
  );
}
