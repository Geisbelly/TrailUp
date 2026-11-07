// Molduras dentro da Loja, das Conquistas e da Bag (06/11). Antes moravam numa aba própria
// (Perfil › Molduras) com Loja/Conquistas/Raras lado a lado; agora cada uma fica onde o aluno
// já procura: comprar na Loja, ganhar nas Conquistas e as que ele tem na Bag.
import { FramedProfileImage } from "@/components/FramedProfileImage";
import { useUsuario } from "@/context/SessaoContext";
import { useAviso } from "@/hooks/useAviso";
import { useMolduraEquipada } from "@/hooks/useMolduras";
import { carregarMolduras, comprarMoldura, equiparMoldura, type MolduraDoCatalogo } from "@/services/molduras";
import { moldurasDaSecao, type SecaoDeMoldura } from "@/services/moldurasModel";
import { FontFamily } from "@/styles/GlobalStyle";
import { perfilVisualDoAluno } from "@/utils/brainHex";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import { textoDeErro } from "@/utils/textoDeErro";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  secao: SecaoDeMoldura;
  palette: ProfileShellPalette;
  /** Mostra o título da seção. A Bag usa a própria aba como título. */
  comTitulo?: boolean;
  /** Recarrega quando muda (ex.: o modal da Bag ou da Loja reabriu). */
  recarregarQuando?: unknown;
  /** Avisa o pai que o saldo mudou (a Loja mostra o saldo no topo). */
  onSaldoMudou?: () => void;
};

const TITULOS: Record<SecaoDeMoldura, { titulo: string; ajuda: string; vazio: string }> = {
  loja: {
    titulo: "Molduras",
    ajuda: "Compre com as moedas que você ganha estudando.",
    vazio: "Nenhuma moldura à venda agora.",
  },
  conquistas: {
    titulo: "Molduras de conquista",
    ajuda: "Saem sozinhas quando você conclui a conquista ou faz algo especial no app.",
    vazio: "Nenhuma moldura de conquista por enquanto.",
  },
  minhas: {
    titulo: "Minhas molduras",
    ajuda: "Toque para equipar. Ela aparece em volta da sua foto.",
    vazio: "Você ainda não tem molduras. Compre na Loja ou ganhe nas Conquistas.",
  },
};

export function SecaoDeMolduras({ secao, palette, comTitulo = true, recarregarQuando, onSaldoMudou }: Props) {
  const { usuario } = useUsuario();
  const { avisar, confirmar } = useAviso();
  const equipada = useMolduraEquipada();
  const perfil = perfilVisualDoAluno(usuario);
  const [itens, setItens] = useState<MolduraDoCatalogo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const trava = useRef(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setItens(await carregarMolduras());
    } catch {
      setErro("Não foi possível carregar as molduras.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );
  useEffect(() => {
    void carregar();
  }, [carregar, recarregarQuando]);

  async function executar(codigo: string, acao: () => Promise<unknown>, sucesso?: string) {
    if (trava.current) return;
    trava.current = true;
    setOcupada(codigo);
    try {
      await acao();
      if (sucesso) avisar(sucesso, undefined, "success");
      await carregar();
      onSaldoMudou?.();
    } catch (e) {
      avisar("Molduras", textoDeErro(e, "Não foi possível concluir."), "error");
    } finally {
      trava.current = false;
      setOcupada(null);
    }
  }

  function comprar(m: MolduraDoCatalogo) {
    confirmar({
      titulo: `Comprar ${m.nome}?`,
      texto: `Custa ${m.preco} moedas.`,
      rotuloConfirmar: "Comprar",
      onConfirmar: () => executar(m.codigo, () => comprarMoldura(m.codigo), `${m.nome} é sua! Equipe na sua Bag.`),
    });
  }

  const textos = TITULOS[secao];
  const lista = moldurasDaSecao(itens ?? [], secao);
  const foto = usuario?.foto_url ? { uri: usuario.foto_url } : undefined;

  return (
    <View style={s.raiz}>
      {comTitulo ? (
        <View style={s.cabeca}>
          <Text style={[s.titulo, { color: palette.text }]}>{textos.titulo}</Text>
          <Text style={[s.ajuda, { color: palette.textMuted }]}>{textos.ajuda}</Text>
        </View>
      ) : (
        <Text style={[s.ajuda, { color: palette.textMuted }]}>{textos.ajuda}</Text>
      )}

      {secao === "minhas" && equipada ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => executar("__perfil", () => equiparMoldura(null))}
          style={[s.voltar, { borderColor: palette.border }]}
        >
          <Text style={[s.voltarTexto, { color: palette.accent }]}>Voltar para a moldura do perfil</Text>
        </Pressable>
      ) : null}

      {erro ? <Text style={[s.ajuda, { color: palette.textMuted }]}>{erro}</Text> : null}
      {itens == null && !erro ? <ActivityIndicator color={palette.accent} style={s.carregando} /> : null}
      {itens != null && !lista.length ? <Text style={[s.ajuda, { color: palette.textMuted }]}>{textos.vazio}</Text> : null}

      <View style={s.grade}>
        {lista.map((m) => {
          const estaEquipada = m.codigo === equipada;
          const ocupado = ocupada === m.codigo;
          return (
            <View
              key={m.codigo}
              style={[s.cartao, { backgroundColor: palette.surfaceElevated, borderColor: estaEquipada ? palette.accent : palette.border }]}
            >
              <View style={!m.tenho ? s.bloqueada : undefined}>
                <FramedProfileImage profile={perfil} source={foto} moldura={m.codigo} size={72} label={`Moldura ${m.nome}`} />
              </View>
              <Text style={[s.nome, { color: palette.text }]} numberOfLines={1}>{m.nome}</Text>
              <Text style={[s.como, { color: palette.textMuted }]} numberOfLines={2}>
                {m.tenho ? (estaEquipada ? "Equipada" : "Na sua Bag") : m.comoGanhar}
              </Text>
              {ocupado ? (
                <ActivityIndicator color={palette.accent} />
              ) : m.tenho ? (
                secao === "minhas" ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={estaEquipada ? `${m.nome} equipada` : `Equipar ${m.nome}`}
                    disabled={estaEquipada}
                    onPress={() => executar(m.codigo, () => equiparMoldura(m.codigo))}
                    style={[s.botao, { backgroundColor: estaEquipada ? "transparent" : palette.accent, borderColor: palette.accent }]}
                  >
                    <Text style={[s.botaoTexto, { color: estaEquipada ? palette.accent : palette.background }]}>
                      {estaEquipada ? "Equipada" : "Equipar"}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={[s.botao, { borderColor: palette.border }]} accessibilityLabel={`${m.nome} já é sua`}>
                    <MaterialCommunityIcons name="check" size={16} color={palette.accent} />
                  </View>
                )
              ) : m.origem === "loja" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Comprar ${m.nome} por ${m.preco} moedas`}
                  onPress={() => comprar(m)}
                  style={[s.botao, { backgroundColor: palette.accent, borderColor: palette.accent }]}
                >
                  <Text style={[s.botaoTexto, { color: palette.background }]}>{m.preco} moedas</Text>
                </Pressable>
              ) : (
                <View style={[s.botao, { borderColor: palette.border }]} accessibilityLabel="Bloqueada">
                  <MaterialCommunityIcons name="lock-outline" size={16} color={palette.textMuted} />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  raiz: { gap: 10 },
  cabeca: { gap: 2 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 17 },
  ajuda: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  carregando: { marginTop: 12 },
  voltar: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  voltarTexto: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  grade: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  cartao: { width: "48%", borderWidth: 1, borderRadius: 14, padding: 10, alignItems: "center", gap: 4 },
  bloqueada: { opacity: 0.55 },
  nome: { fontFamily: FontFamily.inikaBold, fontSize: 14, textAlign: "center" },
  como: { fontFamily: FontFamily.interMedium, fontSize: 12, textAlign: "center", minHeight: 30 },
  botao: { minHeight: 34, minWidth: 100, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 13 },
});
