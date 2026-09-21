import { detalhesDoErro, mensagemDoErro } from "@/utils/detalhesDoErro";
import type { ErrorBoundaryProps } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

/**
 * O que aparece quando uma tela quebra no render.
 *
 * Antes disto o app **não tinha error boundary nenhum** — `componentDidCatch`,
 * `getDerivedStateFromError` e `ErrorBoundary` não apareciam em lugar algum de
 * `mobile/src`. Erro de render virava tela branca, e tela branca não diz nada:
 * não dá para saber se foi dado que não chegou, componente que estourou ou
 * navegação que foi para lugar nenhum.
 *
 * Em desenvolvimento o LogBox já mostra o erro. Isto existe para a versão
 * **publicada**, onde o LogBox não roda e quem recebe o relato fica sem
 * informação nenhuma.
 *
 * Três decisões que não são acidentais:
 *
 * 1. **Não importa contexto, tema, serviço nem dependência nova.** Um boundary
 *    que dependesse de `SessaoContext`, de `getProfileShellPalette` ou de um
 *    pacote a instalar pode quebrar exatamente quando é chamado — e boundary
 *    que quebra volta a ser tela branca. As cores são literais e os imports
 *    são só `react` e `react-native`.
 * 2. **O texto é `selectable`.** Dá para segurar e copiar pelo menu do próprio
 *    sistema. Um botão "copiar" exigiria `expo-clipboard`, que não está
 *    instalado — e instalar pacote para a tela de emergência funcionar é
 *    exatamente o tipo de acoplamento que a decisão 1 evita.
 * 3. **`retry` vem do expo-router** e limpa o estado de erro re-renderizando a
 *    rota. Não é reload do app: se a causa foi dado que faltou e já chegou, a
 *    tela volta sem o aluno perder a sessão.
 */
export function TelaDeErro({ error, retry }: ErrorBoundaryProps) {
  // A montagem do texto mora em `utils/detalhesDoErro`, sem import de
  // `react-native`, porque é a parte que PRECISA de teste: o que chega aqui
  // nem sempre é um `Error` (dá para `throw "texto"`), e a tela de erro
  // estourar lendo `.name` de uma string a devolveria para a tela branca —
  // agora por culpa dela mesma.
  const detalhe = detalhesDoErro(error, { os: Platform.OS, versao: Platform.Version });

  return (
    <View style={s.tela}>
      <ScrollView contentContainerStyle={s.conteudo}>
        <Text style={s.titulo}>Algo quebrou nesta tela</Text>
        <Text style={s.subtitulo}>
          O erro está abaixo. Segure o texto para copiar e mande para quem cuida
          do app — é o que transforma uma tela em branco em algo que dá para
          consertar.
        </Text>

        <View style={s.caixa}>
          <Text selectable style={s.mensagem}>
            {mensagemDoErro(error)}
          </Text>
        </View>

        <Pressable onPress={() => void retry()} style={s.botao}>
          <Text style={s.botaoTexto}>Tentar de novo</Text>
        </Pressable>

        <Text style={s.rotulo}>DETALHES</Text>
        <View style={s.caixa}>
          <Text selectable style={s.stack}>
            {detalhe}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  // Literais de propósito: o boundary não pode depender do tema para desenhar.
  tela: { flex: 1, backgroundColor: "#0b0a16" },
  conteudo: { padding: 22, paddingTop: 70, paddingBottom: 60, gap: 14 },
  titulo: { color: "#f2f7fa", fontSize: 21, fontWeight: "800" },
  subtitulo: { color: "#b9b7c7", fontSize: 14, lineHeight: 20 },
  caixa: {
    backgroundColor: "rgba(242,247,250,.07)",
    borderColor: "rgba(242,247,250,.14)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
  },
  mensagem: { color: "#f87171", fontSize: 14, lineHeight: 20 },
  rotulo: { color: "#8f8da3", fontSize: 10, fontWeight: "800", letterSpacing: 1, marginTop: 8 },
  stack: {
    color: "#9aa0b4",
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  botao: {
    alignItems: "center",
    backgroundColor: "#9db8ff",
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 4,
  },
  botaoTexto: { color: "#0b0a16", fontSize: 13, fontWeight: "800" },
});
