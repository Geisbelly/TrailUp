import { SeloDePrazo } from "@/components/SeloDePrazo";
import { supabase } from "@/database/supabase";
import {
  comprasUsaveisNaAtividade,
  lerRespostaDeUso,
  mensagemDeUso,
  prazoVisivel,
  rotuloDeTempoExtra,
  type CompraUsavel,
} from "@/services/loja/usoItem";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  alunoId: string;
  classeId: number;
  atividadeId: number;
  dataEntrega?: string | null;
  onSegundaChance?: () => void;
};

function chaveDoPedido() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function UsarItemNaAtividade({
  alunoId,
  classeId,
  atividadeId,
  dataEntrega,
  onSegundaChance,
}: Props) {
  const [compras, setCompras] = useState<CompraUsavel[]>([]);
  const [prazoEfetivo, setPrazoEfetivo] = useState<string | null>(null);
  const [minutos, setMinutos] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [usando, setUsando] = useState<number | null>(null);
  const trava = useRef(false);

  const carregar = useCallback(async () => {
    const [comprasRes, prazoRes, tempoRes, nomesRes] = await Promise.all([
      supabase
        .from("loja_compras")
        .select("id,item_codigo,status")
        .eq("aluno_id", alunoId)
        .eq("classe_id", classeId)
        .eq("status", "ativa"),
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
    if (comprasRes.error) throw comprasRes.error;
    const nomes = new Map<string, string>();
    for (const item of nomesRes.data ?? []) nomes.set(String(item.codigo), String(item.nome));
    setCompras(comprasUsaveisNaAtividade(comprasRes.data ?? [], nomes));
    setPrazoEfetivo((prazoRes.data?.prazo_efetivo as string | null) ?? null);
    setMinutos(Number(tempoRes.data?.minutos_extras ?? 0));
  }, [alunoId, atividadeId, classeId]);

  useEffect(() => {
    void carregar().catch(() => setCompras([]));
  }, [carregar]);

  async function usar(compra: CompraUsavel) {
    if (trava.current) return;
    trava.current = true;
    setUsando(compra.id);
    setAviso(null);
    try {
      const { data, error } = await supabase.rpc("loja_usar", {
        p_compra_id: compra.id,
        p_alvo_tipo: "atividade",
        p_alvo_id: atividadeId,
        p_idempotency_key: chaveDoPedido(),
        p_parametro: null,
      });
      if (error) throw error;
      const resposta = lerRespostaDeUso(data);
      if (!resposta.ok) {
        setAviso(mensagemDeUso(resposta.erro));
        return;
      }
      if (resposta.prazoEfetivo) setPrazoEfetivo(resposta.prazoEfetivo);
      if (resposta.efeito === "segunda_chance") onSegundaChance?.();
      setAviso(`${compra.nome} usado nesta atividade.`);
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
  if (!prazo && !tempo && compras.length === 0 && !aviso) return null;

  return (
    <View style={s.caixa}>
      <SeloDePrazo dataEntrega={prazo} />
      {tempo ? <Text style={s.tempo}>{tempo}</Text> : null}
      {compras.map((compra) => (
        <Pressable
          key={compra.id}
          accessibilityRole="button"
          accessibilityLabel={`Usar ${compra.nome}`}
          disabled={usando != null}
          onPress={() => void usar(compra)}
          style={s.botao}
        >
          {usando === compra.id ? (
            <ActivityIndicator color="#e8e8e8" />
          ) : (
            <Text style={s.botaoTexto}>Usar {compra.nome}</Text>
          )}
        </Pressable>
      ))}
      {aviso ? (
        <Text accessibilityLiveRegion="polite" style={s.aviso}>
          {aviso}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  caixa: { gap: 8, marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
  tempo: { color: "#C9CED6", fontSize: 13, fontWeight: "600" },
  botao: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3A4150",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  botaoTexto: { color: "#e8e8e8", fontSize: 13, fontWeight: "700" },
  aviso: { color: "#C9CED6", fontSize: 13 },
});
