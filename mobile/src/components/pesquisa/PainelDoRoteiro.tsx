import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import {
  DEPOIS_DO_APP,
  ETAPAS_DO_ALUNO,
  LIMITE_DA_ANOTACAO,
  PRIVACIDADE_DAS_ANOTACOES,
  andamentoDoRoteiro,
  anotacoesPorEtapa,
  mostraPainelDoRoteiro,
  proximaEtapaDoAluno,
  textoDaAnotacao,
  tituloDaEtapaDoAluno,
  type Anotacao,
  type EtapaDoAluno,
  type MeuRoteiro,
} from "@/services/pesquisa/roteiro";
import {
  anotar,
  apagarAnotacao,
  carregarAnotacoes,
  carregarMeuRoteiro,
  desmarcarEtapa,
  editarAnotacao,
  marcarEtapa,
} from "@/services/pesquisa/roteiroApi";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import tinycolor from "tinycolor2";

const SEM_ETAPA = "__sem_etapa__";

const quando = (iso: string) => {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

/**
 * Roteiro da avaliação e anotações, para o aluno de teste da pesquisa com professores. Uma aba na
 * lateral da tela abre a gaveta. Para qualquer outro aluno, `pesquisa_meu_roteiro()` devolve null e
 * nada aparece.
 */
export function PainelDoRoteiro({ palette, usuarioId }: { palette: ProfileShellPalette; usuarioId?: string | null }) {
  const [roteiro, setRoteiro] = useState<MeuRoteiro | null>(null);
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const recarregar = useCallback(async () => {
    const meu = await carregarMeuRoteiro();
    setRoteiro(meu);
    if (!mostraPainelDoRoteiro(meu)) return;
    try {
      setAnotacoes(await carregarAnotacoes());
    } catch {
      setErro("Não consegui carregar as anotações agora.");
    }
  }, []);

  useEffect(() => {
    if (!usuarioId) {
      setRoteiro(null);
      return;
    }
    void recarregar();
    // O que se marca ou anota no console aparece quando o app volta para a frente. Sem Realtime.
    const assinatura = AppState.addEventListener("change", (estado) => {
      if (estado === "active") void recarregar();
    });
    return () => assinatura.remove();
  }, [usuarioId, recarregar]);

  const cores = useMemo(() => coresDoPainel(palette), [palette]);

  if (!roteiro || !mostraPainelDoRoteiro(roteiro)) return null;

  const { doApp, totalDoApp } = andamentoDoRoteiro(roteiro.marcadas);
  const larguraDaGaveta = Math.min(420, Math.round(width * 0.92));

  async function alternarMarca(etapa: EtapaDoAluno) {
    if (!roteiro) return;
    const antes = roteiro.marcadas;
    const marcar = !antes.has(etapa.id);
    const depois = new Set(antes);
    if (marcar) depois.add(etapa.id);
    else depois.delete(etapa.id);
    setRoteiro({ ...roteiro, marcadas: depois });
    setErro(null);
    try {
      await (marcar ? marcarEtapa(etapa.id) : desmarcarEtapa(etapa.id));
    } catch {
      setRoteiro({ ...roteiro, marcadas: antes });
      setErro("Não consegui salvar a marcação. Tente de novo.");
    }
  }

  return (
    <>
      <Pressable
        onPress={() => setAberto(true)}
        accessibilityRole="button"
        accessibilityLabel={`Roteiro da avaliação, ${doApp} de ${totalDoApp} etapas do app feitas`}
        style={[styles.aba, { backgroundColor: cores.aba, borderColor: cores.borda }]}
        hitSlop={8}
      >
        <MaterialCommunityIcons name="clipboard-check-outline" size={22} color={cores.textoDaAba} />
        <Text style={[styles.abaContagem, { color: cores.textoDaAba }]}>
          {doApp}/{totalDoApp}
        </Text>
      </Pressable>

      <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)}>
        <View style={styles.fundo}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAberto(false)} accessibilityLabel="Fechar o roteiro" />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={[
              styles.gaveta,
              {
                width: larguraDaGaveta,
                backgroundColor: cores.fundo,
                borderColor: cores.borda,
                paddingTop: insets.top + 12,
                paddingBottom: insets.bottom + 12,
              },
            ]}
          >
            <View style={styles.cabecalho}>
              <MaterialCommunityIcons name="clipboard-check-outline" size={22} color={cores.destaque} />
              <Text style={[styles.titulo, { color: cores.texto }]} accessibilityRole="header">
                Roteiro da avaliação
              </Text>
              <Pressable onPress={() => setAberto(false)} accessibilityRole="button" accessibilityLabel="Fechar" hitSlop={10}>
                <MaterialCommunityIcons name="close" size={22} color={cores.textoSuave} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
              <ConteudoDoRoteiro
                roteiro={roteiro}
                anotacoes={anotacoes}
                setAnotacoes={setAnotacoes}
                cores={cores}
                erro={erro}
                setErro={setErro}
                aoAlternar={alternarMarca}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

type Cores = ReturnType<typeof coresDoPainel>;

function coresDoPainel(palette: ProfileShellPalette) {
  return {
    fundo: palette.surface,
    cartao: palette.surfaceElevated,
    borda: palette.borderStrong,
    texto: palette.text,
    textoSuave: palette.textMuted,
    destaque: palette.accentStrong,
    aba: palette.accent,
    textoDaAba: tinycolor.mostReadable(palette.accent, ["#ffffff", "#111111"]).toHexString(),
    erro: "#ffb4ab",
  };
}

function ConteudoDoRoteiro({
  roteiro,
  anotacoes,
  setAnotacoes,
  cores,
  erro,
  setErro,
  aoAlternar,
}: {
  roteiro: MeuRoteiro;
  anotacoes: Anotacao[];
  setAnotacoes: React.Dispatch<React.SetStateAction<Anotacao[]>>;
  cores: Cores;
  erro: string | null;
  setErro: (erro: string | null) => void;
  aoAlternar: (etapa: EtapaDoAluno) => void;
}) {
  const { feitas, total } = andamentoDoRoteiro(roteiro.marcadas);
  const proxima = proximaEtapaDoAluno(roteiro.marcadas);
  const [etapa, setEtapa] = useState<string>(proxima?.id ?? ETAPAS_DO_ALUNO[ETAPAS_DO_ALUNO.length - 1].id);
  const [texto, setTexto] = useState("");
  const [gravando, setGravando] = useState(false);
  const grupos = useMemo(() => anotacoesPorEtapa(anotacoes), [anotacoes]);

  async function enviar() {
    const limpo = textoDaAnotacao(texto);
    if (!limpo || gravando) return;
    setGravando(true);
    setErro(null);
    try {
      const nova = await anotar(limpo, etapa === SEM_ETAPA ? null : etapa);
      setAnotacoes((atuais) => [...atuais, nova]);
      setTexto("");
    } catch {
      setErro("Não consegui salvar a anotação. O texto continua no campo.");
    } finally {
      setGravando(false);
    }
  }

  return (
    <View style={styles.pilha}>
      <View style={styles.pilhaCurta}>
        <View style={styles.linhaEntre}>
          <Text style={[styles.rotulo, { color: cores.textoSuave }]}>Etapas feitas (console e app)</Text>
          <Text style={[styles.forte, { color: cores.texto }]}>
            {feitas} de {total}
          </Text>
        </View>
        <View style={[styles.trilho, { backgroundColor: cores.cartao }]}>
          <View style={[styles.barra, { width: `${Math.round((feitas / total) * 100)}%`, backgroundColor: cores.destaque }]} />
        </View>
      </View>

      {erro && (
        <Text accessibilityRole="alert" style={[styles.erro, { color: cores.erro, borderColor: cores.erro }]}>
          {erro}
        </Text>
      )}

      <Text style={[styles.secao, { color: cores.textoSuave }]}>No app</Text>
      {ETAPAS_DO_ALUNO.map((e) => {
        const feita = roteiro.marcadas.has(e.id);
        const ehProxima = proxima?.id === e.id;
        return (
          <View key={e.id} style={[styles.cartao, { backgroundColor: cores.cartao, borderColor: ehProxima ? cores.destaque : cores.borda }]}>
            <Pressable
              onPress={() => aoAlternar(e)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: feita }}
              accessibilityLabel={tituloDaEtapaDoAluno(e)}
              style={styles.linha}
            >
              <MaterialCommunityIcons
                name={feita ? "checkbox-marked" : "checkbox-blank-outline"}
                size={24}
                color={feita ? cores.destaque : cores.textoSuave}
              />
              <View style={styles.flex}>
                {ehProxima && <Text style={[styles.rotulo, { color: cores.destaque }]}>Próxima etapa</Text>}
                <Text style={[styles.forte, { color: cores.texto }, feita && styles.riscado]}>{tituloDaEtapaDoAluno(e)}</Text>
              </View>
            </Pressable>
            {!feita &&
              e.passos.map((passo) => (
                <Text key={passo} style={[styles.passo, { color: cores.textoSuave }]}>
                  • {passo}
                </Text>
              ))}
            {!feita && e.observar && (
              <Text style={[styles.passo, { color: cores.textoSuave }]}>
                <Text style={{ color: cores.texto, fontWeight: "700" }}>Repare: </Text>
                {e.observar}
              </Text>
            )}
          </View>
        );
      })}
      <Text style={[styles.passo, { color: cores.textoSuave }]}>{DEPOIS_DO_APP}</Text>

      <Text style={[styles.secao, { color: cores.textoSuave }]}>Anotações</Text>
      <TextInput
        value={texto}
        onChangeText={setTexto}
        maxLength={LIMITE_DA_ANOTACAO}
        multiline
        placeholder="O que travou, confundiu ou chamou a atenção?"
        placeholderTextColor={cores.textoSuave}
        accessibilityLabel="Nova anotação"
        style={[styles.campo, { color: cores.texto, borderColor: cores.borda, backgroundColor: cores.cartao }]}
      />
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Etapa da anotação">
        {[...ETAPAS_DO_ALUNO.map((e) => [e.id, e.tarefa ?? "Entrar"] as const), [SEM_ETAPA, "Sem etapa"] as const].map(([id, rotulo]) => {
          const ativo = etapa === id;
          return (
            <Pressable
              key={id}
              onPress={() => setEtapa(id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: ativo }}
              style={[styles.chip, { borderColor: ativo ? cores.destaque : cores.borda, backgroundColor: ativo ? cores.destaque : "transparent" }]}
            >
              <Text style={[styles.chipTexto, { color: ativo ? cores.fundo : cores.texto }]}>{rotulo}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={enviar}
        disabled={!textoDaAnotacao(texto) || gravando}
        accessibilityRole="button"
        style={[styles.botao, { backgroundColor: cores.destaque, opacity: !textoDaAnotacao(texto) || gravando ? 0.5 : 1 }]}
      >
        <Text style={[styles.botaoTexto, { color: cores.fundo }]}>{gravando ? "Salvando…" : "Anotar"}</Text>
      </Pressable>
      <Text style={[styles.miudo, { color: cores.textoSuave }]}>{PRIVACIDADE_DAS_ANOTACOES}</Text>

      {grupos.length === 0 ? (
        <Text style={[styles.miudo, styles.centro, { color: cores.textoSuave }]}>Nenhuma anotação ainda.</Text>
      ) : (
        grupos.map((grupo) => (
          <View key={grupo.etapa ?? SEM_ETAPA} style={styles.pilhaCurta}>
            <Text style={[styles.forte, { color: cores.texto }]}>{grupo.titulo}</Text>
            {grupo.anotacoes.map((a) => (
              <ItemDaAnotacao key={a.id} anotacao={a} cores={cores} setAnotacoes={setAnotacoes} setErro={setErro} />
            ))}
          </View>
        ))
      )}
    </View>
  );
}

function ItemDaAnotacao({
  anotacao,
  cores,
  setAnotacoes,
  setErro,
}: {
  anotacao: Anotacao;
  cores: Cores;
  setAnotacoes: React.Dispatch<React.SetStateAction<Anotacao[]>>;
  setErro: (erro: string | null) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(anotacao.texto);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function salvar() {
    const limpo = textoDaAnotacao(rascunho);
    if (!limpo) return;
    setOcupado(true);
    setErro(null);
    try {
      const editada = await editarAnotacao(anotacao.id, limpo);
      setAnotacoes((atuais) => atuais.map((a) => (a.id === editada.id ? editada : a)));
      setEditando(false);
    } catch {
      setErro("Não consegui salvar a edição.");
    } finally {
      setOcupado(false);
    }
  }

  async function apagar() {
    setOcupado(true);
    setErro(null);
    try {
      await apagarAnotacao(anotacao.id);
      setAnotacoes((atuais) => atuais.filter((a) => a.id !== anotacao.id));
    } catch {
      setErro("Não consegui apagar a anotação.");
      setOcupado(false);
    }
  }

  return (
    <View style={[styles.cartao, { backgroundColor: cores.cartao, borderColor: cores.borda }]}>
      {editando ? (
        <>
          <TextInput
            value={rascunho}
            onChangeText={setRascunho}
            maxLength={LIMITE_DA_ANOTACAO}
            multiline
            accessibilityLabel="Editar anotação"
            style={[styles.campo, { color: cores.texto, borderColor: cores.borda, backgroundColor: cores.fundo }]}
          />
          <View style={styles.acoes}>
            <Pressable onPress={() => { setEditando(false); setRascunho(anotacao.texto); }} accessibilityRole="button" hitSlop={8}>
              <Text style={[styles.link, { color: cores.textoSuave }]}>Cancelar</Text>
            </Pressable>
            <Pressable onPress={salvar} disabled={ocupado || !textoDaAnotacao(rascunho)} accessibilityRole="button" hitSlop={8}>
              <Text style={[styles.link, { color: cores.destaque }]}>Salvar</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <Text style={[styles.corpo, { color: cores.texto }]}>{anotacao.texto}</Text>
          <View style={styles.linhaEntre}>
            <Text style={[styles.miudo, { color: cores.textoSuave }]}>
              {anotacao.plataforma === "app" ? "no app" : "no console"} · {quando(anotacao.criadaEm)}
            </Text>
            {confirmando ? (
              <View style={styles.acoes}>
                <Text style={[styles.miudo, { color: cores.textoSuave }]}>Apagar?</Text>
                <Pressable onPress={apagar} disabled={ocupado} accessibilityRole="button" accessibilityLabel="Sim, apagar" hitSlop={8}>
                  <Text style={[styles.link, { color: cores.erro }]}>Sim</Text>
                </Pressable>
                <Pressable onPress={() => setConfirmando(false)} accessibilityRole="button" accessibilityLabel="Não apagar" hitSlop={8}>
                  <Text style={[styles.link, { color: cores.textoSuave }]}>Não</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.acoes}>
                <Pressable onPress={() => setEditando(true)} accessibilityRole="button" accessibilityLabel="Editar anotação" hitSlop={8}>
                  <MaterialCommunityIcons name="pencil-outline" size={18} color={cores.textoSuave} />
                </Pressable>
                <Pressable onPress={() => setConfirmando(true)} accessibilityRole="button" accessibilityLabel="Apagar anotação" hitSlop={8}>
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color={cores.textoSuave} />
                </Pressable>
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  aba: {
    position: "absolute",
    right: 0,
    top: "42%",
    zIndex: 50,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    borderWidth: 1,
    borderRightWidth: 0,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: -2, height: 2 },
  },
  abaContagem: { fontSize: 12, fontWeight: "700" },
  fundo: { flex: 1, flexDirection: "row", justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  gaveta: { height: "100%", borderLeftWidth: 1, paddingHorizontal: 16 },
  cabecalho: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 12 },
  titulo: { flex: 1, fontSize: 18, fontFamily: FontFamily.inikaBold },
  conteudo: { paddingBottom: 24 },
  pilha: { gap: 12 },
  pilhaCurta: { gap: 6 },
  linha: { flexDirection: "row", alignItems: "center", gap: 10 },
  linhaEntre: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  flex: { flex: 1 },
  trilho: { height: 8, borderRadius: 4, overflow: "hidden" },
  barra: { height: "100%", borderRadius: 4 },
  secao: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginTop: 4 },
  rotulo: { fontSize: 12, fontWeight: "600" },
  forte: { fontSize: 15, fontWeight: "700", fontFamily: FontFamily.interMedium },
  riscado: { textDecorationLine: "line-through", opacity: 0.7 },
  corpo: { fontSize: 15, lineHeight: 21, fontFamily: FontFamily.interMedium },
  passo: { fontSize: 14, lineHeight: 20, fontFamily: FontFamily.interMedium },
  miudo: { fontSize: 12, lineHeight: 17 },
  centro: { textAlign: "center" },
  cartao: { gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  erro: { fontSize: 13, padding: 10, borderWidth: 1, borderRadius: 10 },
  campo: { minHeight: 84, borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 15, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  chipTexto: { fontSize: 13, fontWeight: "600" },
  botao: { alignSelf: "center", paddingHorizontal: 28, paddingVertical: 10, borderRadius: 999 },
  botaoTexto: { fontSize: 15, fontWeight: "700" },
  acoes: { flexDirection: "row", alignItems: "center", gap: 14 },
  link: { fontSize: 14, fontWeight: "700" },
});
