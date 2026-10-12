import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import Aparencia from "@/app/(tabs)/perfil/appearance";
import ColetaDados from "@/app/(tabs)/perfil/coleta-dados";
import ExcluirConta from "@/app/(tabs)/perfil/excluir";
import { EmbutidoConfiguracoes } from "@/context/EmbutidoConfiguracoesContext";
import InformacoesPessoais from "@/app/(tabs)/perfil/info";
import InfoApp from "@/app/(tabs)/perfil/info-app";
import InfoVersao from "@/app/(tabs)/perfil/info-versao";
import LembreteDiario from "@/app/(tabs)/perfil/lembrete-diario";
import { MetricasEstilo } from "@/app/(tabs)/perfil/metricas-estilo";
import ResetarSenha from "@/app/(tabs)/perfil/resetar-senha";
import { HallBackground } from "@/components/HallTheme";
import { ResumoColeta } from "@/components/web/ResumoColeta";
import { useUsuario } from "@/context/SessaoContext";
import { useAcoesConta } from "@/hooks/useAcoesConta";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { filtrarGrupos, subtelaDaUrl, type IdSubtela, type Subtela } from "@/utils/subtelasConfiguracao";

const pkg = require("../../../package.json");
const PERIGO = "#ff8f8f";

// A subtela aberta é a própria tela do app, embutida no painel da direita.
const TELAS: Partial<Record<IdSubtela, () => React.ReactElement>> = {
  info: () => <InformacoesPessoais />,
  senha: () => <ResetarSenha />,
  coleta: () => <ColetaDados />,
  excluir: () => <ExcluirConta />,
  lembrete: () => <LembreteDiario />,
  aparencia: () => <Aparencia />,
  metricas: () => <MetricasEstilo embutido />,
  app: () => <InfoApp />,
  versao: () => <InfoVersao />,
};

/**
 * Configurações na web em tela larga (#346, protótipo v4): a lista de seções
 * fica à esquerda e a seção aberta ocupa a direita, em vez de uma página por
 * seção. A seção aberta vai para a URL (`?sub=`).
 */
export function ConfiguracoesDesktop() {
  const { usuario } = useUsuario();
  const palette = getProfileShellPalette(usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome ?? null);
  const { sub } = useLocalSearchParams<{ sub?: string }>();
  const aberta = subtelaDaUrl(sub);
  const [busca, setBusca] = useState("");
  const { sairDoAparelho, abrirLink, reverTutorialComAbrirAgora } = useAcoesConta();
  const grupos = filtrarGrupos(busca);
  const Tela = TELAS[aberta.id];

  const escolher = (s: Subtela) => {
    if (s.id === "relatorio") return router.push("/(tabs)/perfil/relatorio");
    if (s.id === "privacidade")
      return abrirLink("https://trailup.vercel.app/privacidade", "Não foi possível abrir a política de privacidade.");
    if (s.id === "termos") return abrirLink("https://trailup.vercel.app/termos", "Não foi possível abrir os termos de uso.");
    if (s.id === "tutorial") return void reverTutorialComAbrirAgora();
    router.setParams({ sub: s.id });
  };

  return (
    <View style={[s.tela, { backgroundColor: palette.background }]}>
      <View style={[s.lado, { borderRightColor: palette.border }]}>
        <ScrollView contentContainerStyle={s.ladoConteudo}>
          <Text style={[s.titulo, { color: palette.text }]}>Configurações</Text>
          <View style={[s.busca, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
            <Feather name="search" size={16} color={palette.textMuted} />
            <TextInput
              placeholder="Pesquisar"
              placeholderTextColor={palette.textSubtle}
              value={busca}
              onChangeText={setBusca}
              style={[s.buscaCampo, { color: palette.text }]}
            />
          </View>

          {grupos.map((grupo) => (
            <View key={grupo.titulo}>
              <Text style={[s.grupo, { color: palette.textSubtle }]}>{grupo.titulo.toUpperCase()}</Text>
              {grupo.itens.map((item) => {
                const ativa = !item.acao && item.id === aberta.id;
                const rotulo = item.id === "versao" ? `Versão · ${pkg?.version ?? "-"}` : item.rotulo;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole={item.acao ? "link" : "tab"}
                    accessibilityState={item.acao ? undefined : { selected: ativa }}
                    onPress={() => escolher(item)}
                    style={({ hovered }: { hovered?: boolean; pressed: boolean }) => [
                      s.linha,
                      ativa || hovered ? { backgroundColor: palette.surfaceElevated } : null,
                    ]}
                  >
                    <Text
                      style={[
                        s.linhaTexto,
                        { color: item.perigo ? PERIGO : ativa ? palette.text : palette.textMuted },
                        ativa && s.linhaAtiva,
                      ]}
                    >
                      {rotulo}
                    </Text>
                    {item.acao ? <Feather name="arrow-up-right" size={14} color={palette.textSubtle} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
          {!grupos.length ? <Text style={[s.vazio, { color: palette.textMuted }]}>Nada encontrado.</Text> : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => void sairDoAparelho()}
            style={({ hovered }: { hovered?: boolean; pressed: boolean }) => [
              s.sair,
              { borderColor: palette.borderStrong },
              hovered ? { backgroundColor: palette.surfaceElevated } : null,
            ]}
          >
            <Text style={[s.sairTexto, { color: palette.textMuted }]}>Sair deste aparelho</Text>
          </Pressable>
        </ScrollView>
      </View>

      <View style={s.painel}>
        <HallBackground palette={palette} />
        <View style={s.cabecalho}>
          <Text style={[s.eyebrow, { color: palette.accent }]}>{aberta.grupo.toUpperCase()}</Text>
          <Text style={[s.painelTitulo, { color: palette.text }]}>{aberta.titulo}</Text>
          {aberta.descricao ? <Text style={[s.descricao, { color: palette.textMuted }]}>{aberta.descricao}</Text> : null}
        </View>
        <View style={s.conteudo}>
          <View style={s.subtela}>
            {/* O painel já mostra título e descrição; a tela embutida não repete. */}
            <EmbutidoConfiguracoes.Provider value>{Tela ? <Tela key={aberta.id} /> : null}</EmbutidoConfiguracoes.Provider>
          </View>
          {/* Coleta e acessos: o resumo da coleta fica ao lado dos interruptores. */}
          {aberta.id === "coleta" ? (
            <ResumoColeta
              palette={palette}
              atalhos={[
                { rotulo: "Gerar relatório dos dados", onPress: () => router.push("/(tabs)/perfil/relatorio") },
                {
                  rotulo: "Política de privacidade",
                  onPress: () =>
                    abrirLink("https://trailup.vercel.app/privacidade", "Não foi possível abrir a política de privacidade."),
                },
                { rotulo: "Solicitar exclusão da conta", onPress: () => router.setParams({ sub: "excluir" }), perigo: true },
              ]}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, flexDirection: "row" },
  lado: { width: 320, borderRightWidth: 1 },
  ladoConteudo: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 40 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 24, marginBottom: 14 },
  busca: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  // Sem o contorno de foco do navegador: a caixa da busca já marca o campo.
  buscaCampo: { flex: 1, paddingVertical: 9, fontSize: 14, fontFamily: FontFamily.interMedium, outlineStyle: "none" } as object,
  grupo: { fontFamily: FontFamily.interMedium, fontSize: 11, letterSpacing: 0.9, marginTop: 18, marginBottom: 8 },
  linha: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 10, borderRadius: 8 },
  linhaTexto: { flex: 1, fontFamily: FontFamily.interMedium, fontSize: 13.5 },
  linhaAtiva: { fontWeight: "600" },
  vazio: { marginTop: 18, fontSize: 13 },
  sair: { marginTop: 24, padding: 12, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  sairTexto: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  painel: { flex: 1, minWidth: 0 },
  cabecalho: { paddingHorizontal: 32, paddingTop: 28, paddingBottom: 8, maxWidth: 820 },
  eyebrow: { fontFamily: FontFamily.interMedium, fontSize: 11, letterSpacing: 1.1, marginBottom: 6 },
  painelTitulo: { fontFamily: FontFamily.inikaBold, fontSize: 24, marginBottom: 6 },
  descricao: { fontFamily: FontFamily.interMedium, fontSize: 13.5, lineHeight: 20 },
  conteudo: { flex: 1, flexDirection: "row", gap: 12, paddingHorizontal: 12 },
  subtela: { flex: 1, minWidth: 0 },
});
