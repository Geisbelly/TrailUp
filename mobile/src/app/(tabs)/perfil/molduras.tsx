import { HallBackground } from "@/components/HallTheme";
import { FramedProfileImage } from "@/components/FramedProfileImage";
import { useUsuario } from "@/context/SessaoContext";
import { useAviso } from "@/hooks/useAviso";
import { useMolduraEquipada } from "@/hooks/useMolduras";
import {
  carregarMolduras,
  comprarMoldura,
  equiparMoldura,
  type MolduraDoCatalogo,
  type OrigemDeMoldura,
} from "@/services/molduras";
import { supabase } from "@/database/supabase";
import { FontFamily } from "@/styles/GlobalStyle";
import { perfilVisualDoAluno } from "@/utils/brainHex";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

const ABAS: { id: OrigemDeMoldura; rotulo: string; ajuda: string }[] = [
  { id: "loja", rotulo: "Loja", ajuda: "Compre com as moedas que você ganha estudando." },
  { id: "conquista", rotulo: "Conquistas", ajuda: "Saem sozinhas quando você conclui a conquista." },
  { id: "acao", rotulo: "Raras", ajuda: "Saem uma vez, quando você faz algo especial no app." },
];

export default function MoldurasScreen() {
  const { usuario } = useUsuario();
  const { avisar, confirmar } = useAviso();
  const equipada = useMolduraEquipada();
  const perfil = perfilVisualDoAluno(usuario);
  const palette = useMemo(() => getProfileShellPalette(perfil), [perfil]);
  const [aba, setAba] = useState<OrigemDeMoldura>("loja");
  const [itens, setItens] = useState<MolduraDoCatalogo[] | null>(null);
  const [saldo, setSaldo] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const trava = useRef(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [catalogo, saldoAtual] = await Promise.all([carregarMolduras(), supabase.rpc("loja_saldo")]);
      setItens(catalogo);
      setSaldo(saldoAtual.error ? null : Number(saldoAtual.data ?? 0));
    } catch {
      setErro("Não foi possível carregar as molduras.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  async function executar(codigo: string, acao: () => Promise<unknown>, sucesso?: string) {
    if (trava.current) return;
    trava.current = true;
    setOcupada(codigo);
    try {
      await acao();
      if (sucesso) avisar(sucesso, undefined, "success");
      await carregar();
    } catch (e) {
      avisar("Molduras", e instanceof Error ? e.message : "Não foi possível concluir.", "error");
    } finally {
      trava.current = false;
      setOcupada(null);
    }
  }

  function comprar(m: MolduraDoCatalogo) {
    confirmar({
      titulo: `Comprar ${m.nome}?`,
      texto: `Custa ${m.preco} moedas.${saldo != null ? ` Você tem ${saldo}.` : ""}`,
      rotuloConfirmar: "Comprar",
      onConfirmar: () => executar(m.codigo, () => comprarMoldura(m.codigo), `${m.nome} é sua!`),
    });
  }

  const daAba = (itens ?? []).filter((m) => m.origem === aba);
  const ajuda = ABAS.find((a) => a.id === aba)?.ajuda ?? "";
  const foto = usuario?.foto_url ? { uri: usuario.foto_url } : undefined;

  return (
    <View style={[s.outer, { backgroundColor: palette.background }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: 0.35, pointerEvents: "none" }]}>
        <HallBackground palette={palette} />
      </View>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} tintColor={palette.accent} />}
      >
        <View style={[s.topo, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
          <FramedProfileImage profile={perfil} source={foto} moldura={equipada} size={96} label="Sua foto com a moldura equipada" />
          <View style={s.topoTexto}>
            <Text style={[s.titulo, { color: palette.text }]}>Sua moldura</Text>
            <Text style={[s.ajuda, { color: palette.textMuted }]}>
              {equipada ? "Aparece em volta da sua foto no perfil." : "Você está com a moldura do seu perfil."}
            </Text>
            {equipada ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => executar("__perfil", () => equiparMoldura(null))}
                style={[s.botaoSecundario, { borderColor: palette.border }]}
              >
                <Text style={[s.botaoSecundarioTexto, { color: palette.accent }]}>Voltar para a do perfil</Text>
              </Pressable>
            ) : null}
          </View>
          {saldo != null ? (
            <View style={[s.saldo, { borderColor: palette.border }]} accessibilityLabel={`Saldo: ${saldo} moedas`}>
              <MaterialCommunityIcons name="circle-multiple" size={16} color={palette.accent} />
              <Text style={[s.saldoTexto, { color: palette.text }]}>{saldo}</Text>
            </View>
          ) : null}
        </View>

        <View style={s.abas} accessibilityRole="tablist">
          {ABAS.map((a) => {
            const ativa = a.id === aba;
            return (
              <Pressable
                key={a.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: ativa }}
                onPress={() => setAba(a.id)}
                style={[s.aba, { borderColor: ativa ? palette.accent : palette.border, backgroundColor: ativa ? palette.surfaceElevated : "transparent" }]}
              >
                <Text style={[s.abaTexto, { color: ativa ? palette.text : palette.textMuted }]}>{a.rotulo}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[s.ajuda, { color: palette.textMuted }]}>{ajuda}</Text>

        {erro ? <Text style={[s.ajuda, { color: palette.textMuted }]}>{erro}</Text> : null}
        {itens == null && !erro ? <ActivityIndicator color={palette.accent} style={{ marginTop: 24 }} /> : null}

        <View style={s.grade}>
          {daAba.map((m) => {
            const estaEquipada = m.codigo === equipada;
            const ocupado = ocupada === m.codigo;
            return (
              <View
                key={m.codigo}
                style={[s.cartao, { backgroundColor: palette.surfaceElevated, borderColor: estaEquipada ? palette.accent : palette.border }]}
              >
                <View style={!m.tenho ? s.bloqueada : undefined}>
                  <FramedProfileImage profile={perfil} source={foto} moldura={m.codigo} size={88} label={`Moldura ${m.nome}`} />
                </View>
                <Text style={[s.nome, { color: palette.text }]} numberOfLines={1}>{m.nome}</Text>
                <Text style={[s.como, { color: palette.textMuted }]} numberOfLines={2}>
                  {m.tenho ? "Na sua coleção" : m.comoGanhar}
                </Text>
                {ocupado ? (
                  <ActivityIndicator color={palette.accent} />
                ) : m.tenho ? (
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
                  <View style={[s.botao, { borderColor: palette.border }]}>
                    <MaterialCommunityIcons name="lock-outline" size={16} color={palette.textMuted} />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  outer: { flex: 1 },
  content: { paddingHorizontal: 16, paddingVertical: 20, gap: 12 },
  topo: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderRadius: 16, padding: 14 },
  topoTexto: { flex: 1, gap: 4 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 18 },
  ajuda: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  saldo: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  saldoTexto: { fontFamily: FontFamily.interMedium, fontSize: 14 },
  abas: { flexDirection: "row", gap: 8 },
  aba: { flex: 1, borderWidth: 1, borderRadius: 999, paddingVertical: 8, alignItems: "center" },
  abaTexto: { fontFamily: FontFamily.interMedium, fontSize: 14 },
  grade: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  cartao: { width: "48%", borderWidth: 1, borderRadius: 16, padding: 12, alignItems: "center", gap: 6 },
  bloqueada: { opacity: 0.55 },
  nome: { fontFamily: FontFamily.inikaBold, fontSize: 15, textAlign: "center" },
  como: { fontFamily: FontFamily.interMedium, fontSize: 12, textAlign: "center", minHeight: 32 },
  botao: { minHeight: 36, minWidth: 110, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 14 },
  botaoSecundario: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 4 },
  botaoSecundarioTexto: { fontFamily: FontFamily.interMedium, fontSize: 13 },
});
