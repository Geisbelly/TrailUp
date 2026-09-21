import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import CardSemDados from "@/components/CardSemDados";
import { HallBackground } from "@/components/HallTheme";
import {
  BrainHexProfile,
  normalizeBrainHexProfile,
} from "@/constants/profileImages";
import { useUsuario } from "@/context/SessaoContext";
import { Credito } from "@/models/Credito";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import {
  agruparPorDia,
  descreverCredito,
  formatarDia,
  iconeDoCredito,
  rotularTipoDeCredito,
  somarPontos,
  type CreditoDoAluno,
} from "@/utils/creditosDoAluno";
import { getProfileShellPalette } from "@/utils/profileShellTheme";

/**
 * Histórico de presença, participação e atividade em sala.
 *
 * Estes pontos não têm rastro em nenhuma outra tela: eles não vêm do que o
 * aluno fez no app, vêm do que o professor registrou. Sem esta tela, o número
 * aparecia na pontuação total sem nada explicando de onde veio.
 */
export default function CreditosScreen() {
  const { usuario } = useUsuario();
  const [creditos, setCreditos] = useState<CreditoDoAluno[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  const perfil = (normalizeBrainHexProfile(usuario?.perfilAtivo) ??
    normalizeBrainHexProfile(usuario?.perfis?.[0]?.nome) ??
    "mastermind") as BrainHexProfile;
  const palette = useMemo(() => getProfileShellPalette(perfil), [perfil]);

  const carregar = useCallback(async () => {
    if (!usuario?.id) {
      setCreditos([]);
      setCarregando(false);
      return;
    }
    const lista = await Credito.listarDoAluno(usuario.id);
    setCreditos(lista);
    setCarregando(false);
  }, [usuario?.id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const dias = useMemo(() => agruparPorDia(creditos), [creditos]);
  const total = useMemo(() => somarPontos(creditos), [creditos]);

  async function atualizar() {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }

  return (
    <View style={[st.root, { backgroundColor: palette.background }]}>
      <Stack.Screen options={{ title: "Presença e créditos" }} />
      <View style={[StyleSheet.absoluteFill, { opacity: 0.4 }]} pointerEvents="none">
        <HallBackground palette={palette} />
      </View>

      <ScrollView
        contentContainerStyle={st.conteudo}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={atualizar}
            tintColor={palette.accent}
          />
        }
      >
        <View
          style={[
            st.resumo,
            { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
          ]}
        >
          <Text style={[st.resumoRotulo, { color: palette.textMuted }]}>
            CONCEDIDO PELO PROFESSOR
          </Text>
          <View style={st.resumoLinha}>
            <Text style={[st.resumoValor, { color: palette.accent }]}>{total}</Text>
            <Text style={[st.resumoUnidade, { color: palette.text }]}>pts</Text>
          </View>
          <Text style={[st.resumoApoio, { color: palette.textMuted }]}>
            {creditos.length === 0
              ? "Nada registrado ainda."
              : creditos.length === 1
                ? "1 registro, somado à sua pontuação."
                : `${creditos.length} registros, somados à sua pontuação.`}
          </Text>
        </View>

        {carregando ? (
          <Text style={[st.aviso, { color: palette.textMuted }]}>Carregando…</Text>
        ) : dias.length === 0 ? (
          <CardSemDados
            title="Sem registros"
            description="Quando o professor registrar presença, participação ou uma atividade em sala, ela aparece aqui."
            accentColor={palette.accent}
          />
        ) : (
          dias.map((dia) => (
            <View key={dia.data || "sem-data"} style={st.dia}>
              <View style={st.diaCabecalho}>
                <Text style={[st.diaData, { color: palette.text }]}>
                  {formatarDia(dia.data)}
                </Text>
                <Text style={[st.diaPontos, { color: palette.textMuted }]}>
                  +{dia.pontos} pts
                </Text>
              </View>

              {dia.creditos.map((credito) => (
                <View
                  key={credito.id}
                  style={[
                    st.item,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={iconeDoCredito(credito.tipo) as never}
                    size={22}
                    color={palette.accent}
                  />
                  <View style={st.itemTexto}>
                    <Text style={[st.itemTitulo, { color: palette.text }]}>
                      {rotularTipoDeCredito(credito.tipo)}
                    </Text>
                    <Text
                      style={[st.itemApoio, { color: palette.textMuted }]}
                      numberOfLines={2}
                    >
                      {descreverCredito(credito)}
                    </Text>
                  </View>
                  <Text style={[st.itemPontos, { color: palette.accent }]}>
                    +{Number(credito.valor ?? 0)}
                  </Text>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: Color.background },
  conteudo: { padding: 16, paddingBottom: 40, gap: 16 },
  resumo: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 2,
  },
  resumoRotulo: {
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: FontFamily.interMedium,
  },
  resumoLinha: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  resumoValor: { fontSize: 34, fontFamily: FontFamily.poppinsExtraBold },
  resumoUnidade: { fontSize: 15, fontFamily: FontFamily.interMedium },
  resumoApoio: { fontSize: 12, fontFamily: FontFamily.interMedium, marginTop: 2 },
  aviso: {
    textAlign: "center",
    paddingVertical: 32,
    fontSize: 14,
    fontFamily: FontFamily.interMedium,
  },
  dia: { gap: 8 },
  diaCabecalho: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  diaData: { fontSize: 15, fontFamily: FontFamily.poppinsExtraBold },
  diaPontos: { fontSize: 12, fontFamily: FontFamily.interMedium },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  // `flex: 1` no texto para o numero da direita nunca ser empurrado fora da
  // tela por um motivo comprido.
  itemTexto: { flex: 1, gap: 2 },
  itemTitulo: { fontSize: 14, fontFamily: FontFamily.poppinsExtraBold },
  itemApoio: { fontSize: 12, fontFamily: FontFamily.interMedium },
  itemPontos: { fontSize: 16, fontFamily: FontFamily.poppinsExtraBold },
});
