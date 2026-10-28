import { HapticTab } from "@/components/haptic-tab";
import { DesktopSidebar } from "@/components/web/DesktopSidebar";
import { DesktopTopBar } from "@/components/web/DesktopTopBar";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { useRolagemTematica } from "@/hooks/useRolagemTematica";
import { BossVictoryModal } from '@/components/ia/BossVictoryModal';
import { ClassSelectionGate } from "@/components/ClassSelectionGate";
import { bannerImages, brainHexConfig, brainHexImageMap, getProfileImageByString, normalizeBrainHexProfile } from "@/constants/profileImages";
import { ConquistaRankProvider } from "@/context/ConquistaRankContext";
import { IAProvider } from "@/context/IAContext";
import { NotificationsProvider, useNotifications } from "@/context/NotificacaoContext";
import { TrilhaProvider } from "@/context/TrilhaContext";
// 1. Importando MaterialCommunityIcons (mais criativo/detalhado)
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BottomTabBar, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Tabs, useSegments } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Image, Text, View } from "react-native";

import { ToastContainer } from "@/components/ToastContainer";
import { VigiaDePresenca } from "@/components/VigiaDePresenca";
import DesbloqueioModal from "@/components/DesbloqueioModal";
import { usePortoes } from "@/context/PortoesContext";
import { FirstAccessTour } from "@/components/FirstAccessTour";
import { useUsuario } from "@/context/SessaoContext";
import { MetricasProvider } from "@/context/MetricasContext";
import { user } from "@/database/mockUser";
import { FontFamily } from "@/styles/GlobalStyle";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMonitorDeSessao } from "@/hooks/useMonitorDeSessao";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { estaNaTrilhaDeEstudo } from "@/utils/presencaDeEstudo";
import { registrarAlvoTour } from "@/utils/tourTargets";
import type { Funcionalidade } from "@/utils/portoes";
import { perfilVisualDoAluno } from "@/utils/brainHex";
import { useUrlDeImagem } from "@/hooks/useFonteDeImagem";

// Contador de não lidas no ícone da aba (mobile-v1). Lê o contexto, então só pode
// ser montado dentro do NotificationsProvider — por isso é tabBarIcon e não prop.
function IconeNotificacoes({ focused, color, fundo }: { focused: boolean; color: string; fundo: string }) {
  const { itens } = useNotifications();
  const naoLidas = itens.filter((n) => !n.read).length;
  return (
    <View accessibilityLabel={naoLidas > 0 ? `Notificações, ${naoLidas} não lidas` : "Notificações"}>
      <MaterialCommunityIcons size={focused ? 28 : 26} name={focused ? "bell" : "bell-outline"} color={color} />
      {naoLidas > 0 ? (
        <View style={{ position: "absolute", top: -4, right: -9, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", backgroundColor: color, borderWidth: 1.5, borderColor: fundo }}>
          <Text style={{ fontSize: 10, lineHeight: 12, fontWeight: "700", color: fundo }}>{naoLidas > 9 ? "9+" : naoLidas}</Text>
        </View>
      ) : null}
    </View>
  );
}

function TourAwareTabBar(props: BottomTabBarProps) {
  const targetRef = useRef<View | null>(null);
  useEffect(() => registrarAlvoTour("abas_principais", targetRef), []);

  return (
    <View ref={targetRef} collapsable={false}>
      <BottomTabBar {...props} />
    </View>
  );
}

// Fora do desktop devolve só os filhos (fragmento): a árvore do iOS/Android e da
// web estreita fica idêntica à de antes da #346.
function ComMolduraDesktop({ ativo, topo, children }: { ativo: boolean; topo: React.ReactNode; children: React.ReactNode }) {
  if (!ativo) return <>{children}</>;
  return (
    <View style={{ flex: 1 }}>
      {topo}
      {children}
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

  const activeProfileName = perfilVisualDoAluno(usuario);
  const brainProfile = normalizeBrainHexProfile(activeProfileName) ?? undefined;
  const perfilImage =
    (brainProfile && brainHexImageMap[brainProfile] !== undefined
      ? bannerImages[brainHexImageMap[brainProfile]]
      : getProfileImageByString(activeProfileName ?? "")) || user.avatar;
  const perfilConfig = brainProfile ? brainHexConfig[brainProfile] : undefined;
  const palette = getProfileShellPalette(activeProfileName ?? null);
  const { aberturas, cerimoniaAtual, concluirCerimonia } = usePortoes();
  const [portaoBloqueado, setPortaoBloqueado] = useState<Funcionalidade | null>(null);

  // Foto privada do Storage (#195): URL assinada curta; enquanto isso, o padrao.
  const fotoAssinada = useUrlDeImagem(usuario?.foto_url);
  const perfilFoto = fotoAssinada ? { uri: fotoAssinada } : perfilImage;
  // Mesma leitura de rota que o vigia de presença usa para saber se o aluno
  // está estudando: esconder a barra e "não perguntar agora" respondem à mesma
  // pergunta, e duas cópias divergiriam.
  const hideTabBarOnModule = estaNaTrilhaDeEstudo(segments as readonly string[]);
  // Web em tela larga (#346): barra lateral no lugar da barra de abas e barra
  // superior acima das telas. No iOS/Android e na web estreita, nada muda.
  // No modo de estudo a moldura some, como a barra de abas.
  const desktop = useDesktopWeb();
  useRolagemTematica(desktop, palette.borderStrong);
  const molduraDesktop = desktop && !hideTabBarOnModule;

  return (
    <IAProvider>
      <VigiaDePresenca>
      <MetricasProvider>
        <NotificationsProvider>
          <TrilhaProvider key={usuario?.id ?? "sem-aluno"}>
            <ClassSelectionGate>
            <ConquistaRankProvider>
              <ComMolduraDesktop
                ativo={desktop}
                topo={molduraDesktop ? (
                  <DesktopTopBar palette={palette} nome={usuario?.nome ?? "Aluno"} perfilAtivo={activeProfileName} foto={perfilFoto || user.avatar} />
                ) : null}
              >
              <Tabs
            tabBar={(props) =>
              desktop ? (
                molduraDesktop ? <DesktopSidebar {...props} palette={palette} aberturas={aberturas} onBloqueado={setPortaoBloqueado} /> : null
              ) : (
                <TourAwareTabBar {...props} />
              )
            }
            screenOptions={{
              ...(desktop ? { tabBarPosition: "left" as const } : null),
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
                height: hideTabBarOnModule ? 0 : 64 + insets.bottom,
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
                fontSize: 11,
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
                tabBarIcon: ({ focused, color }) => <IconeNotificacoes focused={focused} color={color} fundo={palette.surface} />,
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
                tabBarIcon: ({ focused, color }) => (
                  <View style={{ opacity: aberturas.social ? 1 : 0.5 }}>
                    <MaterialCommunityIcons
                      size={focused ? 28 : 26}
                      name={focused ? "account-group" : "account-group-outline"}
                      color={color}
                    />
                    {!aberturas.social ? <MaterialCommunityIcons name="lock" size={12} color={color} style={{ position: "absolute", right: -5, bottom: -2 }} /> : null}
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
                tabBarIcon: ({ focused, color }) => (
                  <View style={{ opacity: aberturas.rank ? 1 : 0.5 }}>
                    <MaterialCommunityIcons
                      size={focused ? 28 : 26}
                      name={focused ? "podium" : "podium-bronze"}
                      color={color}
                    />
                    {!aberturas.rank ? <MaterialCommunityIcons name="lock" size={12} color={color} style={{ position: "absolute", right: -5, bottom: -2 }} /> : null}
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
              </ComMolduraDesktop>
              <BossVictoryModal />
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
            </ClassSelectionGate>
            <ToastContainer />
          </TrilhaProvider>
        </NotificationsProvider>
      </MetricasProvider>
      </VigiaDePresenca>
    </IAProvider>
  );
}
