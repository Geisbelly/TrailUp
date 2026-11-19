import { Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EstadoDeErro } from "@/components/EstadoDeErro";
import { LoadingState } from "@/components/LoadingState";
import { Cruzadinha } from "@/components/missoes/Cruzadinha";
import { DesafioDeLogica } from "@/components/missoes/DesafioDeLogica";
import { PremioDoDesafio } from "@/components/missoes/PremioDoDesafio";
import { useUsuario } from "@/context/SessaoContext";
import {
  carregarDesafioDaMissao,
  estaCompleta,
  respostaDaGrade,
  retornoDoConferir,
  type DesafioDaMissao,
  type Preenchimento,
  type RetornoDoConferir,
} from "@/services/missoes/desafios";
import { marcarDesafioResolvido } from "@/services/missoes/desafiosResolvidos";
import { criarGravacaoAdiada } from "@/services/missoes/gravacaoAdiada";
import { conferirComRascunho, lerRascunho, salvarRascunho, type RascunhoDoDesafio } from "@/services/missoes/rascunhoDoDesafio";
import { FontFamily } from "@/styles/GlobalStyle";
import { perfilVisualDoAluno, resolveRepresentativeBrainHexProfiles } from "@/utils/brainHex";
import { getProfileShellPalette } from "@/utils/profileShellTheme";

// Cores de estado fixas, como as do rastreador: não derivam do accent do perfil (AAA).
const ATENCAO = "#F5B544";

/** Quanto o rascunho espera a digitação parar antes de ir ao aparelho. */
const ESPERA_DO_RASCUNHO_MS = 400;

type Estado = "carregando" | "pronto" | "vazio" | "erro";

type GravacaoDoRascunho = { alunoId: string; grupo: string; rascunho: RascunhoDoDesafio };

/**
 * A tela do desafio da missão (`/desafio/<missao_id>`): o desafio de lógica ou a cruzadinha, e o
 * "Conferir".
 *
 * Mora na pilha raiz, fora das abas (registrada em `app/_layout.tsx`): aberta pelo "Resolver" do
 * rastreador da Trilha dentro da aba Social, ela passava por cima do cadeado da aba e deixava a
 * pilha da Social sem "voltar".
 *
 * Quem corrige, limita e paga é o banco (`missao_desafio_responder`), direto pelo Supabase. O app
 * não tem a resposta. O que o aluno escreve fica no aparelho (`rascunhoDoDesafio`) até ele acertar:
 * sem conexão, a resposta continua aqui e nenhum prêmio aparece. Resolvido (agora ou antes, por
 * qualquer perfil do grupo), a tela fica só leitura com "Desafio resolvido".
 */
export default function DesafioDaMissaoTela() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const missaoId = Number(id);
  const { usuario } = useUsuario();
  const alunoId = usuario?.id ?? null;
  const palette = getProfileShellPalette(perfilVisualDoAluno(usuario));
  // Em texto, para a leitura não refazer a cada render: o vetor de perfis é um array novo a cada vez.
  const perfisRepresentativos = resolveRepresentativeBrainHexProfiles(usuario?.perfis).join(",");

  const [estado, setEstado] = useState<Estado>("carregando");
  const [dados, setDados] = useState<DesafioDaMissao | null>(null);
  const [celulas, setCelulas] = useState<Preenchimento>({});
  const [resposta, setResposta] = useState("");
  const [resolvido, setResolvido] = useState(false);
  const [retorno, setRetorno] = useState<RetornoDoConferir | null>(null);
  const [conferindo, setConferindo] = useState(false);
  // O rascunho só é gravado depois de relido: senão a tela vazia apagaria o parcial de antes.
  const [rascunhoLido, setRascunhoLido] = useState(false);
  const [gravacao] = useState(() =>
    criarGravacaoAdiada<GravacaoDoRascunho>((g) => void salvarRascunho(g.alunoId, g.grupo, g.rascunho), ESPERA_DO_RASCUNHO_MS),
  );
  // Dois toques antes do novo render: o segundo não sai (o banco não pagaria duas vezes, mas
  // contaria duas tentativas no limite da hora).
  const enviando = useRef(false);

  const carregar = useCallback(async () => {
    if (!Number.isInteger(missaoId) || missaoId <= 0) {
      setEstado("vazio");
      return;
    }
    setEstado("carregando");
    setRascunhoLido(false);
    try {
      const d = await carregarDesafioDaMissao(missaoId, alunoId, perfisRepresentativos ? perfisRepresentativos.split(",") : []);
      if (!d) {
        setEstado("vazio");
        return;
      }
      // Resolvido antes (por esta linha ou pela de outro perfil do grupo): a Social também mostra.
      if (d.resolvido) marcarDesafioResolvido(alunoId, d.missaoId);
      const rascunho = d.resolvido ? null : await lerRascunho(alunoId, d.desafioGrupo);
      setDados(d);
      setResolvido(d.resolvido);
      setRetorno(null);
      if (rascunho?.tipo === "cruzadinha" && d.desafio.tipo === "cruzadinha") setCelulas(rascunho.celulas);
      if (rascunho?.tipo === "logica" && d.desafio.tipo === "logica") setResposta(rascunho.resposta);
      setRascunhoLido(true);
      setEstado("pronto");
    } catch (e) {
      console.warn("[Desafio]", e instanceof Error ? e.message : e);
      setEstado("erro");
    }
  }, [alunoId, missaoId, perfisRepresentativos]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const rascunhoAtual = useCallback((): RascunhoDoDesafio | null => {
    if (!dados) return null;
    return dados.desafio.tipo === "cruzadinha" ? { tipo: "cruzadinha", celulas } : { tipo: "logica", resposta };
  }, [celulas, dados, resposta]);

  // O parcial vai ao aparelho quando a digitação para. Sem aluno não há rascunho, e resolvido não
  // grava mais nada: o acerto apagou o rascunho, e a gravação pendente o recriaria.
  useEffect(() => {
    const rascunho = rascunhoAtual();
    if (resolvido) {
      gravacao.cancelar();
      return;
    }
    if (!dados || !rascunho || !alunoId || !rascunhoLido) return;
    gravacao.agendar({ alunoId, grupo: dados.desafioGrupo, rascunho });
  }, [alunoId, dados, gravacao, rascunhoAtual, rascunhoLido, resolvido]);

  // Saiu da tela antes da espera: o que estava pendente vai ao aparelho agora, não se perde.
  useEffect(() => () => gravacao.descarregar(), [gravacao]);

  const conferir = async () => {
    const rascunho = rascunhoAtual();
    if (!dados || !rascunho || enviando.current || resolvido || retorno?.indisponivel) return;
    // A gravação pendente não pode cair depois do acerto e recriar o rascunho apagado. O
    // `conferirComRascunho` grava o que está na tela antes de ir à rede.
    gravacao.cancelar();
    enviando.current = true;
    setConferindo(true);
    try {
      const r = await conferirComRascunho({
        alunoId,
        missaoId: dados.missaoId,
        grupo: dados.desafioGrupo,
        rascunho,
        resposta: dados.desafio.tipo === "cruzadinha" ? respostaDaGrade(dados.desafio, celulas) : { resposta: resposta.trim() },
      });
      const ret = retornoDoConferir(r);
      setRetorno(ret);
      if (ret.resolvido) {
        setResolvido(true);
        // A Social e o rastreador mostram a missão cumprida ao voltar, sem consulta nova.
        marcarDesafioResolvido(alunoId, dados.missaoId);
      }
    } finally {
      enviando.current = false;
      setConferindo(false);
    }
  };

  // "Desafio" sozinho já é a métrica de atividades e o título da Ember (CLAUDE.md): sem o tipo
  // (carregando, erro), o nome é "Missão".
  const titulo = dados?.desafio.tipo === "cruzadinha" ? "Cruzadinha" : "Desafio de lógica";
  const cabecalho = (
    <Stack.Screen
      options={{
        headerShown: true,
        title: estado === "pronto" && dados ? titulo : "Missão",
        headerBackTitle: "Voltar",
        headerTitleAlign: "center",
        headerStyle: { backgroundColor: palette.background },
        headerTintColor: palette.text,
        headerTitleStyle: { color: palette.text, fontFamily: FontFamily.inikaBold, fontSize: 15 },
        headerShadowVisible: false,
      }}
    />
  );

  if (estado === "carregando") {
    return (
      <View style={[s.tela, { backgroundColor: palette.background }]}>
        {cabecalho}
        <LoadingState title="Carregando a missão" message="Só um instante." palette={palette} />
      </View>
    );
  }
  if (estado !== "pronto" || !dados) {
    return (
      <View style={[s.tela, { backgroundColor: palette.background }]}>
        {cabecalho}
        <EstadoDeErro
          palette={palette}
          titulo={estado === "erro" ? "Não foi possível carregar" : "Missão não encontrada"}
          mensagem={
            estado === "erro"
              ? "Confira a conexão e tente de novo."
              : "Ela pode ter saído do ar ou não ser para o seu perfil."
          }
          onTentarDeNovo={estado === "erro" ? () => void carregar() : undefined}
        />
      </View>
    );
  }

  const { desafio } = dados;
  // Sem acesso (42501): tentar de novo não muda nada, então nem a grade nem o "Conferir" respondem.
  const indisponivel = retorno?.indisponivel === true;
  const preenchido = desafio.tipo === "cruzadinha" ? estaCompleta(desafio, celulas) : resposta.trim() !== "";
  const pode = preenchido && !indisponivel;
  const somenteLeitura = resolvido || conferindo || indisponivel;
  // O prêmio só no primeiro acerto, com o que o banco pagou. Já resolvido antes: só o selo.
  const premio = retorno?.premio ? dados.recompensa : null;

  return (
    <View style={[s.tela, { backgroundColor: palette.background }]}>
      {cabecalho}
      <SafeAreaView style={s.tela} edges={["left", "right", "bottom"]}>
        <KeyboardAvoidingView style={s.tela} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={s.conteudo} keyboardShouldPersistTaps="handled">
            <Text style={[s.titulo, { color: palette.text }]} accessibilityRole="header">
              {dados.titulo || titulo}
            </Text>
            {dados.descricao ? <Text style={[s.descricao, { color: palette.textMuted }]}>{dados.descricao}</Text> : null}

            {/* Durante o "Conferir" nada muda: a gravação adiada não pode recriar o rascunho que o
                acerto apagou. */}
            {desafio.tipo === "cruzadinha" ? (
              <Cruzadinha desafio={desafio} celulas={celulas} onMudar={setCelulas} somenteLeitura={somenteLeitura} palette={palette} />
            ) : (
              <DesafioDeLogica desafio={desafio} resposta={resposta} onMudar={setResposta} somenteLeitura={somenteLeitura} palette={palette} />
            )}

            {resolvido ? <PremioDoDesafio premio={premio} palette={palette} /> : null}

            {!resolvido && retorno ? (
              <View
                style={[s.retorno, { borderColor: ATENCAO, backgroundColor: palette.surfaceElevated }]}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                <Text style={[s.retornoTexto, { color: palette.text }]}>{retorno.texto}</Text>
                {retorno.detalhe ? <Text style={[s.retornoDetalhe, { color: palette.textMuted }]}>{retorno.detalhe}</Text> : null}
              </View>
            ) : null}

            {!resolvido ? (
              <Pressable
                onPress={() => void conferir()}
                disabled={!pode || conferindo}
                accessibilityRole="button"
                accessibilityLabel="Conferir"
                accessibilityHint={
                  pode || indisponivel
                    ? undefined
                    : desafio.tipo === "cruzadinha"
                      ? "Preencha todas as casas para conferir"
                      : "Escreva ou escolha a resposta para conferir"
                }
                accessibilityState={{ disabled: !pode || conferindo, busy: conferindo }}
                style={({ pressed }) => [
                  s.botao,
                  { backgroundColor: palette.accent, opacity: !pode || conferindo ? 0.5 : pressed ? 0.85 : 1 },
                ]}
              >
                {conferindo ? <ActivityIndicator color={palette.background} /> : null}
                <Text style={[s.botaoTexto, { color: palette.background }]}>Conferir</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { padding: 16, paddingBottom: 32, gap: 16, width: "100%", maxWidth: 640, alignSelf: "center" },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 20, lineHeight: 26 },
  descricao: { fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 20 },
  retorno: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  retornoTexto: { fontFamily: FontFamily.interMedium, fontSize: 15, fontWeight: "700" },
  retornoDetalhe: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  botao: { minHeight: 48, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  // Texto grande (≥ 19px em negrito): o fundo da paleta sobre o accent mede 6,0 a 8,8:1, que é AAA
  // só para texto grande (4,5:1). Em 16px seria AA.
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 19, fontWeight: "700" },
});
