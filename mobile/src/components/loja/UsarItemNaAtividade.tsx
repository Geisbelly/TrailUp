import { SeloDePrazo } from "@/components/SeloDePrazo";
import { useUsuario } from "@/context/SessaoContext";
import { supabase } from "@/database/supabase";
import { carregarInventario, usarItem, usosPermitidos } from "@/services/loja/lojaService";
import {
  botaoDeUso,
  itensUsaveisNaAtividade,
  mensagemDeUso,
  prazoVisivel,
  rotuloDeTempoExtra,
  type ItemUsavel,
  type PermissaoDeUso,
} from "@/services/loja/usoItem";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  alunoId: string;
  classeId: number;
  atividadeId: number;
  dataEntrega?: string | null;
  onSegundaChance?: () => void;
};

/**
 * Itens da Bag que valem nesta atividade. Um botão por tipo de item: cada uso
 * gasta uma unidade (a mais antiga). O botão diz quantas ainda dá para usar
 * aqui; quando um limite do professor segura, fica desligado com o motivo.
 */
export function UsarItemNaAtividade({
  alunoId,
  classeId,
  atividadeId,
  dataEntrega,
  onSegundaChance,
}: Props) {
  const { usuario } = useUsuario();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfilAtivo, usuario?.perfis]
  );
  const [itens, setItens] = useState<ItemUsavel[]>([]);
  const [permissoes, setPermissoes] = useState<Record<string, PermissaoDeUso>>({});
  const [prazoEfetivo, setPrazoEfetivo] = useState<string | null>(null);
  const [minutos, setMinutos] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [usando, setUsando] = useState<string | null>(null);
  const trava = useRef(false);

  const carregar = useCallback(async () => {
    const [inventario, prazoRes, tempoRes, nomesRes] = await Promise.all([
      carregarInventario(classeId),
      supabase
        .from("atividade_prazo_aluno")
        .select("prazo_efetivo")
        .eq("aluno_id", alunoId)
        .eq("atividade_id", atividadeId)
        .maybeSingle(),
      supabase
        .from("atividade_tempo_aluno")
        .select("minutos_extras")
        .eq("aluno_id", alunoId)
        .eq("atividade_id", atividadeId)
        .maybeSingle(),
      supabase.from("loja_itens").select("codigo,nome"),
    ]);
    const nomes = new Map<string, string>();
    for (const item of nomesRes.data ?? []) nomes.set(String(item.codigo), String(item.nome));
    // A segunda chance é gasta na própria questão (QuestionActivity), não aqui.
    const usaveis = itensUsaveisNaAtividade(inventario, nomes).filter((i) => i.codigo !== "segunda_chance");
    const lidas = await Promise.all(usaveis.map((i) => usosPermitidos(classeId, i.codigo, "atividade", atividadeId)));
    setItens(usaveis);
    setPermissoes(Object.fromEntries(usaveis.map((i, n) => [i.codigo, lidas[n]])));
    setPrazoEfetivo((prazoRes.data?.prazo_efetivo as string | null) ?? null);
    setMinutos(Number(tempoRes.data?.minutos_extras ?? 0));
  }, [alunoId, atividadeId, classeId]);

  useEffect(() => {
    void carregar().catch(() => setItens([]));
  }, [carregar]);

  async function usar(item: ItemUsavel) {
    if (trava.current) return;
    trava.current = true;
    setUsando(item.codigo);
    setAviso(null);
    try {
      const resposta = await usarItem(classeId, item.codigo, "atividade", atividadeId);
      if (!resposta.ok) {
        setAviso(mensagemDeUso(resposta.erro));
        await carregar();
        return;
      }
      if (resposta.prazoEfetivo) setPrazoEfetivo(resposta.prazoEfetivo);
      if (resposta.efeito === "segunda_chance") onSegundaChance?.();
      setAviso(`${item.nome} usado nesta atividade.`);
      await carregar();
    } catch (caught) {
      setAviso(caught instanceof Error ? caught.message : "Não foi possível usar o item.");
    } finally {
      trava.current = false;
      setUsando(null);
    }
  }

  const prazo = prazoVisivel(dataEntrega, prazoEfetivo);
  const tempo = rotuloDeTempoExtra(minutos);
  if (!prazo && !tempo && itens.length === 0 && !aviso) return null;

  return (
    <View style={s.caixa}>
      <SeloDePrazo dataEntrega={prazo} />
      {tempo ? <Text style={[s.tempo, { color: palette.textMuted }]}>{tempo}</Text> : null}
      {itens.map((item) => {
        const botao = botaoDeUso(item, permissoes[item.codigo] ?? null);
        const desligado = usando != null || !botao.habilitado;
        return (
          <View key={item.codigo} style={s.linha}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${botao.texto}. ${botao.motivo ?? botao.detalhe}`}
              accessibilityState={{ disabled: desligado, busy: usando === item.codigo }}
              disabled={desligado}
              onPress={() => void usar(item)}
              style={[s.botao, { backgroundColor: palette.surface, borderColor: palette.border }, !botao.habilitado && s.botaoDesligado]}
            >
              {usando === item.codigo ? (
                <ActivityIndicator color={palette.accent} />
              ) : (
                <Text style={[s.botaoTexto, { color: botao.habilitado ? palette.text : palette.textSubtle }]}>{botao.texto}</Text>
              )}
            </Pressable>
            <Text style={[s.detalhe, { color: palette.textSubtle }]}>{botao.motivo ?? botao.detalhe}</Text>
          </View>
        );
      })}
      {aviso ? (
        <Text accessibilityLiveRegion="polite" style={[s.aviso, { color: palette.textMuted }]}>
          {aviso}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  caixa: { gap: 8, marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
  tempo: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  linha: { gap: 4 },
  botao: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  botaoDesligado: { opacity: 0.55 },
  botaoTexto: { fontFamily: FontFamily.inikaBold, fontSize: 13 },
  detalhe: { fontFamily: FontFamily.interMedium, fontSize: 12 },
  aviso: { fontFamily: FontFamily.interMedium, fontSize: 13 },
});
