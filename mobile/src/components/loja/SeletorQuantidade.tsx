import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

/** − 1 + para escolher quantas unidades comprar num pedido. */
export function SeletorQuantidade({
  valor,
  maximo,
  desabilitado,
  cor,
  corApagada,
  nome,
  onMudar,
}: {
  valor: number;
  maximo: number;
  desabilitado?: boolean;
  cor: string;
  corApagada: string;
  nome: string;
  onMudar: (n: number) => void;
}) {
  const podeMenos = !desabilitado && valor > 1;
  const podeMais = !desabilitado && valor < maximo;
  return (
    <View style={s.linha} accessibilityLabel={`Quantidade de ${nome}: ${valor}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Menos uma unidade de ${nome}`}
        accessibilityState={{ disabled: !podeMenos }}
        disabled={!podeMenos}
        onPress={() => onMudar(valor - 1)}
        style={s.botao}
      >
        <MaterialCommunityIcons name="minus" size={16} color={podeMenos ? cor : corApagada} />
      </Pressable>
      <Text style={[s.valor, { color: cor }]}>{valor}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Mais uma unidade de ${nome}`}
        accessibilityState={{ disabled: !podeMais }}
        disabled={!podeMais}
        onPress={() => onMudar(valor + 1)}
        style={s.botao}
      >
        <MaterialCommunityIcons name="plus" size={16} color={podeMais ? cor : corApagada} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  linha: { flexDirection: "row", alignItems: "center", gap: 4 },
  botao: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 999 },
  valor: { minWidth: 22, textAlign: "center", fontSize: 15, fontWeight: "700" },
});
