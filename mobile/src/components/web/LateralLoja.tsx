import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { BagModal } from "@/components/bag/BagModal";
import { UtilityIcon } from "@/components/UtilityIcon";
import { listBagItems } from "@/services/bag/bagService";
import { filtrarExtrato, type FiltroDeExtrato, type LimitesTurma, type Movimento } from "@/services/loja/extratoModel";
import { carregarExtrato, carregarLimitesTurma, carregarPrazoUsado } from "@/services/loja/lojaService";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

const ENTRADA = "#62db9b";

const FILTROS: { id: FiltroDeExtrato; rotulo: string }[] = [
  { id: "todos", rotulo: "Tudo" },
  { id: "evento", rotulo: "Ganhos" },
  { id: "compra", rotulo: "Compras" },
  { id: "estorno", rotulo: "Estornos" },
];

/**
 * Coluna lateral da Loja na web em tela larga (#346, protótipo v4, 12-loja.md
 * §5): o que está na Bag vindo da Loja, os limites da turma e o extrato.
 * `versao` muda depois de cada compra, para recarregar os três.
 */
export function LateralLoja({
  alunoId,
  classeId,
  nomeTurma,
  perfil,
  palette,
  nomesItens,
  versao,
}: {
  alunoId: string;
  classeId: number;
  nomeTurma: string | null;
  perfil: string | null | undefined;
  palette: ProfileShellPalette;
  nomesItens: ReadonlyMap<string, string>;
  versao: number;
}) {
  const [naBag, setNaBag] = useState<{ titulo: string; quantidade: number }[] | null>(null);
  const [limites, setLimites] = useState<LimitesTurma | null>(null);
  const [prazoUsado, setPrazoUsado] = useState<number | null>(null);
  const [extrato, setExtrato] = useState<Movimento[] | null>(null);
  const [extratoCompleto, setExtratoCompleto] = useState(false);
  const [filtro, setFiltro] = useState<FiltroDeExtrato>("todos");
  const [bagAberta, setBagAberta] = useState(false);

  useEffect(() => {
    let ativo = true;
    // Cada bloco carrega sozinho: um que falhe não esconde os outros.
    void listBagItems({ origin: "loja", classId: classeId })
      .then((itens) => {
        const contagem = new Map<string, number>();
        for (const item of itens) contagem.set(item.title, (contagem.get(item.title) ?? 0) + 1);
        if (ativo) setNaBag([...contagem].map(([titulo, quantidade]) => ({ titulo, quantidade })));
      })
      .catch(() => ativo && setNaBag([]));
    void carregarLimitesTurma(classeId)
      .then((l) => ativo && setLimites(l))
      .catch(() => ativo && setLimites(null));
    void carregarPrazoUsado(alunoId, classeId)
      .then((d) => ativo && setPrazoUsado(d))
      .catch(() => ativo && setPrazoUsado(null));
    void carregarExtrato(alunoId, nomesItens)
      .then((e) => ativo && setExtrato(e))
      .catch(() => ativo && setExtrato([]));
    return () => {
      ativo = false;
    };
  }, [alunoId, classeId, nomesItens, versao]);

  const titulo = (texto: string) => <Text style={[s.titulo, { color: palette.textSubtle }]}>{texto}</Text>;
  const linhasFiltradas = filtrarExtrato(extrato ?? [], filtro);
  const linhasExtrato = extratoCompleto ? linhasFiltradas : linhasFiltradas.slice(0, 6);

  return (
    <View style={[s.coluna, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View style={s.bloco}>
        {titulo("NA SUA BAG")}
        {naBag === null ? null : naBag.length ? (
          naBag.map((item) => (
            <View key={item.titulo} style={s.linha}>
              <UtilityIcon kind="bag" profile={perfil} size={26} height={28} />
              <Text style={[s.texto, s.flex, { color: palette.text }]} numberOfLines={1}>{item.titulo}</Text>
              <Text style={[s.texto, { color: palette.textMuted }]}>×{item.quantidade}</Text>
            </View>
          ))
        ) : (
          <Text style={[s.texto, { color: palette.textMuted }]}>Nada guardado ainda. O que você comprar fica aqui até usar.</Text>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => setBagAberta(true)}
          style={({ hovered }: { hovered?: boolean; pressed: boolean }) => [s.botao, { borderColor: palette.borderStrong }, hovered ? { backgroundColor: palette.surfaceElevated } : null]}
        >
          <UtilityIcon kind="bag" profile={perfil} size={18} height={20} />
          <Text style={[s.botaoTexto, { color: palette.text }]}>Abrir Bag</Text>
        </Pressable>
      </View>

      <View style={[s.bloco, s.separado, { borderTopColor: palette.border }]}>
        {titulo(nomeTurma ? `LIMITES · ${nomeTurma.toUpperCase()}` : "LIMITES DA TURMA")}
        {limites ? (
          <>
            {prazoUsado === null ? (
              <Text style={[s.texto, { color: palette.text }]}>
                <Text style={s.negrito}>Prazo extra:</Text> até {limites.prazoDiasTotal} {limites.prazoDiasTotal === 1 ? "dia" : "dias"} no semestre
              </Text>
            ) : (
              // Protótipo v4 (12-loja): "Prazo extra · 1 de 4 dias", com a barra do que já foi usado.
              <>
                <View style={s.linhaLimite}>
                  <Text style={[s.texto, s.negrito, { color: palette.text }]}>Prazo extra</Text>
                  <Text style={[s.texto, s.negrito, { color: palette.text }]}>
                    {Math.min(prazoUsado, limites.prazoDiasTotal)} de {limites.prazoDiasTotal} {limites.prazoDiasTotal === 1 ? "dia" : "dias"}
                  </Text>
                </View>
                <View
                  accessibilityRole="progressbar"
                  accessibilityLabel="Dias de prazo extra usados no semestre"
                  accessibilityValue={{ min: 0, max: limites.prazoDiasTotal, now: Math.min(prazoUsado, limites.prazoDiasTotal) }}
                  style={[s.trilho, { backgroundColor: palette.surfaceElevated }]}
                >
                  <View
                    style={[
                      s.preenchido,
                      {
                        backgroundColor: palette.accent,
                        width: `${limites.prazoDiasTotal > 0 ? Math.min(100, (prazoUsado / limites.prazoDiasTotal) * 100) : 0}%`,
                      },
                    ]}
                  />
                </View>
              </>
            )}
            <Text style={[s.pequeno, { color: palette.textSubtle }]}>
              {prazoUsado === null ? "" : "usados neste semestre · "}
              Até {limites.prazoPorAtividade} {limites.prazoPorAtividade === 1 ? "dia" : "dias"} por atividade
              {" · "}cada uso entre {limites.prazoMinDias} e {limites.prazoMaxDias} {limites.prazoMaxDias === 1 ? "dia" : "dias"}
            </Text>
            <Text style={[s.texto, { color: palette.text }]}>
              <Text style={s.negrito}>Mais tempo:</Text> {limites.tempoMinMinutos}–{limites.tempoMaxMinutos} min por uso, até {limites.tempoPorAtividade} min na atividade
            </Text>
            <Text style={[s.texto, { color: palette.text }]}>
              <Text style={s.negrito}>Segunda chance:</Text> até {limites.segundaChancePorTopico} por tópico
            </Text>
          </>
        ) : null}
        <Text style={[s.pequeno, { color: palette.textSubtle }]}>Quem define esses limites é seu professor.</Text>
      </View>

      <View style={[s.bloco, s.separado, { borderTopColor: palette.border }]}>
        {titulo("EXTRATO")}
        <View style={s.filtros}>
          {FILTROS.map((opcao) => (
            <Pressable key={opcao.id} accessibilityRole="button" onPress={() => setFiltro(opcao.id)}>
              <Text style={[s.pequeno, { color: filtro === opcao.id ? palette.accent : palette.textSubtle }]}>{opcao.rotulo}</Text>
            </Pressable>
          ))}
        </View>
        {extrato === null ? null : linhasFiltradas.length ? (
          linhasExtrato.map((m) => (
            <View key={m.id} style={s.linha}>
              <Text style={[s.valor, { color: m.valor > 0 ? ENTRADA : palette.textMuted }]}>
                {m.valor > 0 ? `+${m.valor}` : `−${Math.abs(m.valor)}`}
              </Text>
              <Text style={[s.texto, s.flex, { color: palette.text }]} numberOfLines={1}>{m.descricao}</Text>
              <Text style={[s.pequeno, { color: palette.textSubtle }]}>{m.quando}</Text>
            </View>
          ))
        ) : (
          <Text style={[s.texto, { color: palette.textMuted }]}>Nenhuma moeda ganha ou gasta ainda.</Text>
        )}
        {linhasFiltradas.length > 6 ? (
          <Pressable accessibilityRole="button" onPress={() => setExtratoCompleto((v) => !v)}>
            <Text style={[s.link, { color: palette.accent }]}>{extratoCompleto ? "Ver menos" : "Ver extrato completo"}</Text>
          </Pressable>
        ) : null}
      </View>

      <BagModal visible={bagAberta} classeId={classeId} profile={perfil ?? null} onClose={() => setBagAberta(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  coluna: { borderRadius: 16, borderWidth: 1, paddingVertical: 22, paddingHorizontal: 20, gap: 18 },
  bloco: { gap: 10 },
  filtros: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  separado: { borderTopWidth: 1, paddingTop: 18 },
  titulo: { fontFamily: FontFamily.interMedium, fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  linha: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 32 },
  flex: { flex: 1, minWidth: 0 },
  texto: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 19 },
  pequeno: { fontFamily: FontFamily.interMedium, fontSize: 12 },
  negrito: { fontWeight: "700" },
  linhaLimite: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 10 },
  trilho: { height: 6, borderRadius: 999, overflow: "hidden" },
  preenchido: { height: "100%", borderRadius: 999 },
  valor: { fontFamily: FontFamily.interMedium, fontSize: 13.5, fontWeight: "700", minWidth: 34 },
  link: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
  botao: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: 999, paddingVertical: 9 },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
});
