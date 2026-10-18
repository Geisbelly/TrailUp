import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { CommonActions } from "@react-navigation/native";
import { usePathname, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useDialog } from "@/context/DialogContext";
import { UtilityIcon } from "@/components/UtilityIcon";
import { useNotifications } from "@/context/NotificacaoContext";
import { useUsuario } from "@/context/SessaoContext";
import { supabase } from "@/database/supabase";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellPalette";
import type { Aberturas, Funcionalidade } from "@/utils/portoes";
import { registrarAlvoTour } from "@/utils/tourTargets";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

// Ordem e rótulos do protótipo v4 (prototipos/aluno/v4). `portao` liga o item
// ao mesmo bloqueio que a barra de abas aplica em Social e Ranking.
const ITENS: { rota: string; rotulo: string; icone: IconName; portao?: Funcionalidade }[] = [
  { rota: "index", rotulo: "Trilha", icone: "map-outline" },
  { rota: "notificacoes", rotulo: "Notificações", icone: "bell-outline" },
  { rota: "social", rotulo: "Social", icone: "account-group-outline", portao: "social" },
  { rota: "ranking", rotulo: "Ranking", icone: "podium", portao: "rank" },
  { rota: "perfil", rotulo: "Perfil", icone: "account-circle-outline" },
];

type Props = BottomTabBarProps & {
  palette: ProfileShellPalette;
  aberturas: Aberturas;
  onBloqueado: (funcionalidade: Funcionalidade) => void;
};

/** Barra lateral da web em tela larga (#346): entra no lugar da barra de abas. */
export function DesktopSidebar({ state, navigation, palette, aberturas, onBloqueado }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { showDialog } = useDialog();
  const { sair } = useUsuario();
  const alvoTour = useRef<View | null>(null);
  useEffect(() => registrarAlvoTour("abas_principais", alvoTour), []);

  const rotaAtual = state.routes[state.index]?.name;
  const naConfiguracao = pathname.startsWith("/perfil/settings");
  const naLoja = pathname.startsWith("/perfil/loja");

  // Contadores do protótipo v4: não lidas ao lado de Notificações e o saldo ao lado de Loja.
  const { itens: notificacoes } = useNotifications();
  const naoLidas = notificacoes.filter((n) => !(n.read ?? n.status === "lida")).length;
  const [saldo, setSaldo] = useState<number | null>(null);
  useEffect(() => {
    // Relido a cada troca de tela: o saldo muda com o estudo e com as compras.
    let ativo = true;
    void supabase.rpc("loja_saldo").then(({ data, error }) => {
      if (ativo && !error) setSaldo(Number(data ?? 0));
    });
    return () => {
      ativo = false;
    };
  }, [pathname]);

  const abrir = (rota: string) => {
    const alvo = state.routes.find((r) => r.name === rota);
    if (!alvo) return;
    // Mesmo evento que a barra de abas dispara: os bloqueios de Social e
    // Ranking são `listeners.tabPress` em (tabs)/_layout.tsx.
    const evento = navigation.emit({ type: "tabPress", target: alvo.key, canPreventDefault: true });
    if (evento.defaultPrevented) return;
    // Loja e Configurações são telas da pilha do Perfil: sem refazer a pilha,
    // o item Perfil reabria a última delas em vez da página do perfil. É reset
    // e não popToTop porque, aberta direto pela URL (/perfil/loja), a pilha
    // nasce sem o índice embaixo — e com estado parcial, sem `key`, até a
    // primeira troca de tela; aí só dá para pedir o índice pela navegação.
    const pilha = alvo.state;
    if (rota === "perfil" && pilha && (pilha.routes.length > 1 || pilha.routes[0]?.name !== "index")) {
      if (!pilha.key) {
        navigation.dispatch(CommonActions.navigate({ name: "perfil", params: { screen: "index" } }));
        return;
      }
      navigation.dispatch({ ...CommonActions.reset({ index: 0, routes: [{ name: "index" }] }), target: pilha.key });
    }
    navigation.navigate(alvo.name as never);
  };

  // Mesmo fluxo de "Sair deste aparelho" em perfil/settings.tsx.
  const sairDoApp = async () => {
    const { remotoOk } = await sair();
    router.replace("/(auth)/login");
    if (!remotoOk) {
      showDialog({
        title: "Você saiu deste aparelho",
        description: "Não deu para avisar o servidor, então a sua sessão pode continuar aberta em outros aparelhos.",
        tone: "warning",
      });
    }
  };

  const item = (
    chave: string,
    rotulo: string,
    icone: IconName,
    ativo: boolean,
    onPress: () => void,
    opcoes?: { bloqueado?: boolean; perigo?: boolean; fim?: React.ReactNode },
  ) => (
    <Pressable
      key={chave}
      accessibilityRole="link"
      accessibilityState={{ selected: ativo }}
      accessibilityLabel={opcoes?.bloqueado ? `${rotulo} (bloqueado)` : rotulo}
      onPress={onPress}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
        s.item,
        ativo && { backgroundColor: palette.surfaceElevated, borderColor: palette.borderStrong },
        !ativo && (hovered || pressed) && { backgroundColor: palette.accentMuted },
      ]}
    >
      <MaterialCommunityIcons name={icone} size={20} color={ativo ? palette.accent : palette.textMuted} />
      <Text style={[s.rotulo, { color: ativo ? palette.text : palette.textMuted }, opcoes?.bloqueado && { opacity: 0.55 }]}>{rotulo}</Text>
      {opcoes?.bloqueado ? <MaterialCommunityIcons name="lock" size={14} color={palette.textSubtle} style={s.fim} /> : null}
      {!opcoes?.bloqueado && opcoes?.fim ? <View style={s.fim}>{opcoes.fim}</View> : null}
    </Pressable>
  );

  return (
    <View ref={alvoTour} collapsable={false} style={[s.barra, { backgroundColor: palette.surface, borderRightColor: palette.border }]}>
      {ITENS.map(({ rota, rotulo, icone, portao }) => {
        const bloqueado = portao ? !aberturas[portao] : false;
        const contador =
          rota === "notificacoes" && naoLidas > 0 ? (
            <View accessibilityLabel={`${naoLidas} não lidas`} style={[s.contador, { backgroundColor: palette.accent }]}>
              <Text style={[s.contadorTexto, { color: palette.background }]}>{naoLidas > 99 ? "99+" : naoLidas}</Text>
            </View>
          ) : null;
        const elemento = item(rota, rotulo, icone, rota === rotaAtual && !naConfiguracao && !naLoja, () =>
          bloqueado && portao ? onBloqueado(portao) : abrir(rota),
          { bloqueado, fim: contador });
        // A Loja é uma página da pilha do Perfil (perfil/loja.tsx), só na tela larga.
        return rota === "social"
          ? [
              elemento,
              item("loja", "Loja", "storefront-outline", naLoja, () => router.push("/perfil/loja"), {
                fim:
                  saldo !== null ? (
                    <View accessibilityLabel={`Saldo: ${saldo} moedas`} style={s.saldo}>
                      <Text style={[s.saldoTexto, { color: palette.textMuted }]}>{saldo}</Text>
                      <UtilityIcon kind="coin" profile={palette.profile} size={16} height={18} />
                    </View>
                  ) : null,
              }),
            ]
          : elemento;
      })}

      <View style={[s.pe, { borderTopColor: palette.border }]}>
        {item("configuracoes", "Configurações", "cog-outline", naConfiguracao, () => router.push("/perfil/settings"))}
        {item("sair", "Sair", "logout", false, () => void sairDoApp())}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  barra: { width: 212, paddingVertical: 20, paddingHorizontal: 12, gap: 6, borderRightWidth: 1 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1, borderColor: "transparent" },
  rotulo: { fontFamily: FontFamily.interMedium, fontSize: 13.5 },
  contador: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  contadorTexto: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700" },
  saldo: { flexDirection: "row", alignItems: "center", gap: 4 },
  saldoTexto: { fontFamily: FontFamily.interMedium, fontSize: 12.5, fontWeight: "700" },
  fim: { marginLeft: "auto" },
  pe: { marginTop: "auto", paddingTop: 12, borderTopWidth: 1, gap: 6 },
});
