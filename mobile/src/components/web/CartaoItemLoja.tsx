import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { StoreItemIcon } from "@/components/loja/StoreItemIcon";
import { UtilityIcon } from "@/components/UtilityIcon";
import type { StoreItem } from "@/services/loja/lojaService";
import { FontFamily } from "@/styles/GlobalStyle";
import { estadoCompra, gratisRestantes } from "@/utils/compraLoja";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

const NOTA_ESTADO: Partial<Record<StoreItem["state"], string>> = {
  unavailable: "Seu professor desligou este item nesta turma.",
  blocked: "Libera depois que você revisar o material do tópico.",
};

/**
 * Card de item da Loja na web em tela larga (#346, protótipo v4, 12-loja.md
 * §4.2–4.4): chip da dotação, preço ou "Grátis", barra de quanto falta e o
 * aviso da compra dentro do próprio card.
 */
export function CartaoItemLoja({
  item,
  saldo,
  palette,
  comprando,
  ocupado,
  aviso,
  erro,
  onComprar,
}: {
  item: StoreItem;
  saldo: number;
  palette: ProfileShellPalette;
  comprando: boolean;
  ocupado: boolean;
  aviso?: string | null;
  erro?: string | null;
  onComprar: () => void;
}) {
  const estado = estadoCompra(item, saldo);
  const gratis = gratisRestantes(item);
  const desabilitado = !estado.habilitado || ocupado;
  const nota = NOTA_ESTADO[item.state];

  return (
    <View style={[s.card, { backgroundColor: palette.surface, borderColor: aviso ? palette.accent : palette.border }]}>
      <View style={s.topo}>
        <StoreItemIcon effect={item.assetKey} color={palette.accent} size={60} />
        <View style={s.copia}>
          <Text style={[s.nome, { color: palette.text }]}>{item.name}</Text>
          <Text style={[s.descricao, { color: palette.textMuted }]}>{item.description}</Text>
        </View>
      </View>

      {gratis > 0 ? (
        <View style={s.chips}>
          <View style={[s.chip, { backgroundColor: palette.accentMuted }]}>
            <Text style={[s.chipTexto, { color: palette.accent }]}>
              {gratis === 1 ? "1 grátis restante" : `${gratis} grátis restantes`}
            </Text>
          </View>
        </View>
      ) : null}

      {nota ? (
        <View style={[s.nota, { backgroundColor: palette.surfaceElevated }]}>
          <MaterialCommunityIcons name={item.state === "blocked" ? "lock-outline" : "information-outline"} size={16} color={palette.textSubtle} />
          <Text style={[s.notaTexto, { color: palette.textMuted }]}>{nota}</Text>
        </View>
      ) : null}

      {aviso ? (
        <View accessibilityLiveRegion="polite" style={[s.faixa, { borderColor: palette.accent }]}>
          <MaterialCommunityIcons name="check-circle-outline" size={18} color={palette.accent} />
          <Text style={[s.notaTexto, { color: palette.text }]}>{aviso}</Text>
        </View>
      ) : null}
      {erro ? (
        <View accessibilityRole="alert" style={[s.faixa, { borderColor: palette.borderStrong }]}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={palette.textMuted} />
          <Text style={[s.notaTexto, { color: palette.text }]}>{erro}</Text>
        </View>
      ) : null}

      <View style={[s.rodape, { borderTopColor: palette.border }]}>
        <View style={s.preco}>
          {estado.gratis ? (
            <Text style={[s.valor, { color: palette.text }]}>Grátis</Text>
          ) : (
            <>
              <UtilityIcon kind="coin" profile={palette.profile} size={20} height={24} />
              <Text style={[s.valor, { color: palette.text }]}>{item.price}</Text>
            </>
          )}
        </View>
        <View style={s.acao}>
          {/* Quem pode pagar não vê barra (mesma gramática da biblioteca de conquistas). */}
          {estado.falta > 0 && item.state === "available" ? (
            <View style={[s.trilho, { backgroundColor: palette.progressTrack }]}>
              <View style={[s.preenchido, { width: `${Math.min(100, (saldo / Math.max(1, estado.custo)) * 100)}%`, backgroundColor: palette.accent }]} />
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${estado.rotulo}: ${item.name}`}
            accessibilityState={{ disabled: desabilitado, busy: comprando }}
            disabled={desabilitado}
            onPress={onComprar}
            style={({ hovered }: { hovered?: boolean; pressed: boolean }) => [
              s.botao,
              desabilitado
                ? { backgroundColor: palette.surfaceElevated }
                : { backgroundColor: palette.accent, opacity: hovered ? 0.9 : 1 },
            ]}
          >
            {comprando ? <ActivityIndicator size="small" color={palette.textMuted} /> : null}
            <Text style={[s.botaoTexto, { color: desabilitado ? palette.textMuted : palette.background }]}>
              {comprando ? "Comprando..." : estado.rotulo}
            </Text>
          </Pressable>
        </View>
      </View>

      {item.assetKey === "segunda_chance" ? (
        <Text style={[s.rodapeNota, { color: palette.textSubtle }]}>Também aparece quando você revisa uma atividade.</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, paddingVertical: 18, paddingHorizontal: 20, gap: 12 },
  topo: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  copia: { flex: 1, minWidth: 0, gap: 4 },
  nome: { fontFamily: FontFamily.inikaBold, fontSize: 18 },
  descricao: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 19.5 },
  chips: { flexDirection: "row", gap: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  chipTexto: { fontFamily: FontFamily.interMedium, fontSize: 12, fontWeight: "700" },
  nota: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: 12, padding: 10 },
  notaTexto: { flex: 1, fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 18 },
  faixa: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 10 },
  rodape: { flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, paddingTop: 12 },
  preco: { flexDirection: "row", alignItems: "center", gap: 6 },
  valor: { fontFamily: FontFamily.interMedium, fontSize: 16, fontWeight: "700" },
  acao: { marginLeft: "auto", alignItems: "stretch", gap: 6, minWidth: 150 },
  trilho: { height: 6, borderRadius: 3, overflow: "hidden" },
  preenchido: { height: "100%", borderRadius: 3 },
  botao: { height: 38, borderRadius: 999, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 13.5, fontWeight: "700" },
  rodapeNota: { fontFamily: FontFamily.interMedium, fontSize: 12 },
});
