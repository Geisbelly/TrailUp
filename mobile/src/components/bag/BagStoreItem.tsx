import { StoreItemIcon } from "@/components/loja/StoreItemIcon";
import { resolveStoreAccent } from "@/services/loja/storeTheme";
import type { BagItem } from "@/services/bag/bagModel";
import { FontFamily } from "@/styles/GlobalStyle";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = {
  item: BagItem;
  profile?: string | null;
  muted: string;
  surface: string;
  border: string;
};

const EFFECT_LABELS: Record<string, string> = {
  prazo_extra: "PRAZO EXTRA",
  segunda_chance: "SEGUNDA CHANCE",
  dica: "DICA",
  troca_formato: "TROCA DE FORMATO",
};

function metadataText(item: BagItem, key: string): string | null {
  const value = item.metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function BagStoreItem({ item, profile, muted, surface, border }: Props) {
  const accent = resolveStoreAccent(profile);
  const effect = metadataText(item, "efeito");
  const status = metadataText(item, "status") === "consumida" ? "CONSUMIDO" : "DISPONÍVEL";
  const price = Number(item.metadata.preco_pago);
  const priceLabel = Number.isFinite(price) ? `${price} ◉` : "COMPRA";

  return (
    <View accessibilityLabel={`Item comprado: ${item.title}`} style={[styles.item, { backgroundColor: surface, borderColor: border }]}>
      <View style={[styles.iconBox, { backgroundColor: `${accent}22`, borderColor: accent }]}>
        <StoreItemIcon effect={effect} color={accent} size={46} />
      </View>
      <View style={styles.info}>
        <View style={styles.heading}>
          <Text style={[styles.title, { color: "#fff" }]}>{item.title}</Text>
          <Text style={[styles.status, { color: status === "CONSUMIDO" ? muted : accent }]}>{status}</Text>
        </View>
        <Text style={[styles.kind, { color: accent }]}>{EFFECT_LABELS[effect ?? ""] ?? "ITEM DA LOJA"}</Text>
        {item.content ? <Text style={[styles.description, { color: muted }]}>{item.content}</Text> : null}
        <View style={styles.footer}>
          <Text style={[styles.price, { color: "#fff" }]}>{priceLabel}</Text>
          <Text style={[styles.purchased, { color: muted }]}>COMPRADO</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: "row", gap: 12, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  iconBox: { width: 64, height: 64, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  info: { flex: 1, minWidth: 0, gap: 4 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { flex: 1, fontFamily: FontFamily.poppinsExtraBold, fontSize: 14 },
  status: { fontFamily: FontFamily.inikaBold, fontSize: 9, letterSpacing: 0.5 },
  kind: { fontFamily: FontFamily.inikaBold, fontSize: 9, letterSpacing: 1 },
  description: { fontFamily: FontFamily.interMedium, fontSize: 12, lineHeight: 17 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  price: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 12 },
  purchased: { fontFamily: FontFamily.inikaBold, fontSize: 9, letterSpacing: 0.8 },
});
