import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { StoreCard } from "@/components/loja/StoreModal";
import { UtilityIcon } from "@/components/UtilityIcon";
import { useUsuario } from "@/context/SessaoContext";
import { useTrilha } from "@/context/TrilhaContext";
import { carregarGanhoMoedas, carregarLoja, comprarItem, type StoreItem, type StoreSnapshot } from "@/services/loja/lojaService";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";

type Ganho = Awaited<ReturnType<typeof carregarGanhoMoedas>>;

/**
 * Loja como página na web em tela larga (#346, protótipo v4, `12-loja.html`):
 * cabeçalho, o saldo com "Como ganhar" e os itens em duas colunas. No celular
 * a Loja continua sendo o modal aberto pelo Social.
 */
export function LojaDesktop() {
  const { usuario } = useUsuario();
  const { classeAtual, perfil } = useTrilha();
  const palette = getProfileShellPalette(perfil);
  const alunoId = usuario?.id ?? null;
  const classeId = classeAtual?.classe_id ?? null;
  const [loja, setLoja] = useState<StoreSnapshot | null>(null);
  const [ganho, setGanho] = useState<Ganho | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [comprando, setComprando] = useState<string | null>(null);
  const trava = useRef(false);
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    if (!alunoId || !classeId) return;
    const atual = ++pedido.current;
    setCarregando(true);
    setErro(null);
    try {
      const [dados, rendimento] = await Promise.all([
        carregarLoja(alunoId, classeId, perfil),
        // "Como ganhar" é extra: se falhar, a loja abre sem ele.
        carregarGanhoMoedas(classeId).catch(() => null),
      ]);
      if (atual !== pedido.current) return;
      setLoja(dados);
      setGanho(rendimento);
    } catch (caught) {
      if (atual === pedido.current) setErro(caught instanceof Error ? caught.message : "Não foi possível carregar a loja.");
    } finally {
      if (atual === pedido.current) setCarregando(false);
    }
  }, [alunoId, classeId, perfil]);

  useFocusEffect(
    useCallback(() => {
      setAviso(null);
      void carregar();
      return () => {
        pedido.current += 1;
      };
    }, [carregar]),
  );

  // Mesma trava de compra do modal do app: uma compra por vez.
  async function comprar(item: StoreItem) {
    if (!classeId || item.state !== "available" || trava.current) return;
    trava.current = true;
    setComprando(item.id);
    setErro(null);
    setAviso(null);
    try {
      await comprarItem(item.id, classeId);
      setAviso(`${item.name} adquirido.`);
      await carregar();
    } catch (caught) {
      setErro(caught instanceof Error ? caught.message : "Não foi possível concluir a compra.");
    } finally {
      trava.current = false;
      setComprando(null);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: palette.background }} contentContainerStyle={s.pagina}>
      <View style={s.cabecalho}>
        <Text style={[s.eyebrow, { color: palette.accent }]}>RECURSOS DA JORNADA</Text>
        <Text style={[s.titulo, { color: palette.text }]}>Loja</Text>
        <Text style={[s.subtitulo, { color: palette.textMuted }]}>Troque moedas por recursos que ajudam no estudo.</Text>
      </View>

      <View style={[s.heroi, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
        <View style={s.metade}>
          <Text style={[s.rotulo, { color: palette.textMuted }]}>SEU SALDO</Text>
          <View style={s.saldoLinha}>
            <Text style={[s.saldo, { color: palette.text }]}>{loja?.balance ?? "--"}</Text>
            <UtilityIcon kind="coin" profile={perfil} size={56} height={60} />
          </View>
          <Text style={[s.texto, { color: palette.textMuted }]}>
            Suas moedas vêm do estudo. Gastar nunca muda seu XP nem sua posição no ranking.
          </Text>
        </View>
        {ganho ? (
          <View style={[s.metade, s.direita, { borderLeftColor: palette.border }]}>
            <Text style={[s.ganhoTitulo, { color: palette.text }]}>Como ganhar</Text>
            {ganho.map((g) => (
              <View key={g.tipo} style={s.ganhoLinha}>
                <Text style={[s.texto, { color: palette.textMuted }]}>{g.rotulo}</Text>
                <Text style={[s.ganhoValor, { color: palette.accent }]}>+{g.moedas}</Text>
              </View>
            ))}
            <Text style={[s.nota, { color: palette.textSubtle }]}>
              Cada ação paga uma vez só. Revisar não paga, para refazer não virar fonte de moedas.
            </Text>
          </View>
        ) : null}
      </View>

      {aviso ? (
        <View accessibilityLiveRegion="polite" style={[s.faixa, { borderColor: palette.accent }]}>
          <MaterialCommunityIcons name="check-circle-outline" size={20} color={palette.accent} />
          <Text style={[s.texto, { color: palette.text }]}>{aviso}</Text>
        </View>
      ) : null}
      {erro ? (
        <View accessibilityRole="alert" style={[s.faixa, { borderColor: palette.borderStrong }]}>
          <Text style={[s.texto, s.flex, { color: palette.text }]}>{erro}</Text>
          <Pressable accessibilityRole="button" onPress={() => void carregar()}>
            <Text style={[s.link, { color: palette.accent }]}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={s.secaoTitulo}>
        <Text style={[s.eyebrowSecao, { color: palette.accent }]}>ITENS</Text>
        {loja ? (
          <View style={[s.chip, { backgroundColor: palette.surfaceElevated }]}>
            <Text style={[s.chipTexto, { color: palette.textMuted }]}>{loja.items.length}</Text>
          </View>
        ) : null}
      </View>
      {carregando && !loja ? (
        <ActivityIndicator color={palette.accent} style={s.vazio} />
      ) : loja?.items.length ? (
        <View style={s.grade}>
          {loja.items.map((item) => (
            <View key={item.id} style={s.celula}>
              <StoreCard
                item={item}
                palette={palette}
                buying={comprando === item.id}
                busy={!!comprando || carregando}
                onBuy={() => void comprar(item)}
              />
            </View>
          ))}
        </View>
      ) : !erro ? (
        <Text style={[s.vazio, { color: palette.textMuted }]}>Nenhum item disponível no momento.</Text>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  pagina: { paddingHorizontal: 32, paddingTop: 28, paddingBottom: 40, gap: 20, maxWidth: 1164, width: "100%" },
  cabecalho: { gap: 4 },
  eyebrow: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 30 },
  subtitulo: { fontFamily: FontFamily.interMedium, fontSize: 14 },
  heroi: { flexDirection: "row", gap: 24, borderRadius: 16, borderWidth: 1, paddingVertical: 24, paddingHorizontal: 26 },
  metade: { flex: 1, minWidth: 0, gap: 8 },
  direita: { borderLeftWidth: 1, paddingLeft: 24 },
  rotulo: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  saldoLinha: { flexDirection: "row", alignItems: "center", gap: 12 },
  saldo: { fontFamily: FontFamily.inikaBold, fontSize: 48 },
  texto: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 19 },
  ganhoTitulo: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
  ganhoLinha: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 32 },
  ganhoValor: { fontFamily: FontFamily.interMedium, fontSize: 14, fontWeight: "700" },
  nota: { fontFamily: FontFamily.interMedium, fontSize: 12, lineHeight: 17 },
  faixa: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1, borderRadius: 12 },
  flex: { flex: 1 },
  link: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
  secaoTitulo: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrowSecao: { fontFamily: FontFamily.interMedium, fontSize: 12, fontWeight: "600", letterSpacing: 1 },
  chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  chipTexto: { fontFamily: FontFamily.interMedium, fontSize: 12 },
  grade: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  celula: { flexBasis: "48%", flexGrow: 1, minWidth: 320 },
  vazio: { marginVertical: 40, textAlign: "center" },
});
