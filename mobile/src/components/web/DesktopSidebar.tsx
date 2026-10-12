import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { usePathname, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { StoreModal } from "@/components/loja/StoreModal";
import { useDialog } from "@/context/DialogContext";
import { useUsuario } from "@/context/SessaoContext";
import { useTrilha } from "@/context/TrilhaContext";
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
  const { usuario, sair } = useUsuario();
  const { classeAtual, perfil } = useTrilha();
  const [lojaAberta, setLojaAberta] = useState(false);
  const alvoTour = useRef<View | null>(null);
  useEffect(() => registrarAlvoTour("abas_principais", alvoTour), []);

  const rotaAtual = state.routes[state.index]?.name;
  const naConfiguracao = pathname.startsWith("/perfil/settings");

  const abrir = (rota: string) => {
    const alvo = state.routes.find((r) => r.name === rota);
    if (!alvo) return;
    // Mesmo evento que a barra de abas dispara: os bloqueios de Social e
    // Ranking são `listeners.tabPress` em (tabs)/_layout.tsx.
    const evento = navigation.emit({ type: "tabPress", target: alvo.key, canPreventDefault: true });
    if (!evento.defaultPrevented) navigation.navigate(alvo.name as never);
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

  const item = (chave: string, rotulo: string, icone: IconName, ativo: boolean, onPress: () => void, opcoes?: { bloqueado?: boolean; perigo?: boolean }) => (
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
    </Pressable>
  );

  return (
    <View ref={alvoTour} collapsable={false} style={[s.barra, { backgroundColor: palette.surface, borderRightColor: palette.border }]}>
      {ITENS.map(({ rota, rotulo, icone, portao }) => {
        const bloqueado = portao ? !aberturas[portao] : false;
        const elemento = item(rota, rotulo, icone, rota === rotaAtual && !naConfiguracao, () =>
          bloqueado && portao ? onBloqueado(portao) : abrir(rota),
          { bloqueado });
        // A Loja ainda não é uma rota (vira página na fase 3 da #346): por ora abre o mesmo modal do Social.
        return rota === "social"
          ? [elemento, item("loja", "Loja", "storefront-outline", false, () => setLojaAberta(true))]
          : elemento;
      })}

      <View style={[s.pe, { borderTopColor: palette.border }]}>
        {item("configuracoes", "Configurações", "cog-outline", naConfiguracao, () => router.push("/perfil/settings"))}
        {item("sair", "Sair", "logout", false, () => void sairDoApp())}
      </View>

      {usuario?.id && classeAtual?.classe_id ? (
        <StoreModal visible={lojaAberta} alunoId={usuario.id} classeId={classeAtual.classe_id} profileName={perfil} onClose={() => setLojaAberta(false)} />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  barra: { width: 212, paddingVertical: 20, paddingHorizontal: 12, gap: 6, borderRightWidth: 1 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1, borderColor: "transparent" },
  rotulo: { fontFamily: FontFamily.interMedium, fontSize: 13.5 },
  fim: { marginLeft: "auto" },
  pe: { marginTop: "auto", paddingTop: 12, borderTopWidth: 1, gap: 6 },
});
