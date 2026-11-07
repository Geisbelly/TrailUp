import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { actionsForBagItem, bagMaterialFormat, type BagItem, type BagMaterialFormat } from "@/services/bag/bagModel";
import { FontFamily } from "@/styles/GlobalStyle";

type Props = {
  item: BagItem;
  accent: string;
  muted: string;
  surface: string;
  border: string;
  onEdit?: (item: BagItem) => void;
  onDelete?: (item: BagItem) => void;
  onShare?: (item: BagItem) => void;
  /** Material salvo: abre o tópico no bloco de onde ele saiu. */
  onOpen?: (item: BagItem) => void;
};

const icons = { resumo: "text-box-outline", anotacao: "note-text-outline", card: "cards-outline", material: "bookmark-outline", loja: "shopping-outline" } as const;
const labels = { resumo: "RESUMO", anotacao: "ANOTAÇÃO", card: "CARD", material: "MATERIAL", loja: "LOJA" } as const;
const materialIcons: Record<BagMaterialFormat, keyof typeof MaterialCommunityIcons.glyphMap> = {
  audio: "headphones",
  apresentacao: "presentation",
  markdown: "text-box-outline",
  pdf: "file-pdf-box",
  video: "play-box-outline",
  documento: "file-document-outline",
  imagem: "image-outline",
};
const materialLabels: Record<BagMaterialFormat, string> = {
  audio: "ÁUDIO",
  apresentacao: "APRESENTAÇÃO",
  markdown: "TEXTO",
  pdf: "PDF",
  video: "VÍDEO",
  documento: "DOCUMENTO",
  imagem: "IMAGEM",
};

export function BagItemCard({ item, accent, muted, surface, border, onEdit, onDelete, onShare, onOpen }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const actions = actionsForBagItem(item);
  const formato = bagMaterialFormat(item);

  return (
    <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={styles.header}>
        <View style={[styles.typeIcon, { backgroundColor: `${accent}22` }]}>
          <MaterialCommunityIcons name={formato ? materialIcons[formato] : icons[item.type]} size={20} color={accent} />
        </View>
        <View style={styles.titleArea}>
          <View style={styles.metaRow}>
            <Text style={[styles.type, { color: accent }]}>{formato ? materialLabels[formato] : labels[item.type]}</Text>
            <Text style={[styles.origin, { color: muted }]}>{item.origin === "aluno" ? "MEU ITEM" : item.origin === "loja" ? "COMPRADO" : "GERADO"}</Text>
          </View>
          <Text numberOfLines={expanded ? undefined : 1} style={styles.title}>{item.title}</Text>
        </View>
        <MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-down"} size={22} color={muted} />
      </Pressable>

      {expanded ? <View style={styles.body}>
        {item.type === "card" ? <Pressable onPress={() => setFlipped((value) => !value)} style={[styles.flashcard, { borderColor: accent }]}>
          <Text style={[styles.sideLabel, { color: accent }]}>{flipped ? "VERSO" : "FRENTE"}</Text>
          <Text style={styles.bodyText}>{flipped ? item.back : item.front}</Text>
          <Text style={[styles.flipHint, { color: muted }]}>Toque para virar</Text>
        </Pressable> : item.content ? <Text style={styles.bodyText}>{item.content}</Text> : null}
        <View style={styles.actions}>
          {actions.includes("abrir") && onOpen ? <Pressable accessibilityLabel="Abrir material no tópico" onPress={() => onOpen(item)} style={[styles.action, { borderColor: border }]}><MaterialCommunityIcons name="open-in-new" size={18} color={accent} /><Text style={[styles.actionText, { color: accent }]}>Abrir</Text></Pressable> : null}
          {actions.includes("editar") ? <Pressable accessibilityLabel="Editar item da Bag" onPress={() => onEdit?.(item)} style={[styles.action, { borderColor: border }]}><MaterialCommunityIcons name="pencil-outline" size={18} color={accent} /><Text style={[styles.actionText, { color: accent }]}>Editar</Text></Pressable> : null}
          {actions.includes("excluir") ? <Pressable accessibilityLabel="Excluir item da Bag" onPress={() => onDelete?.(item)} style={[styles.action, { borderColor: border }]}><MaterialCommunityIcons name="trash-can-outline" size={18} color={accent} /><Text style={styles.deleteText}>Excluir</Text></Pressable> : null}
          {actions.includes("compartilhar") && onShare ? <Pressable accessibilityLabel="Compartilhar item da Bag" onPress={() => onShare(item)} style={[styles.action, { borderColor: border }]}><MaterialCommunityIcons name="share-variant-outline" size={18} color={accent} /><Text style={[styles.actionText, { color: accent }]}>Compartilhar</Text></Pressable> : null}
        </View>
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 6, marginBottom: 12, overflow: "hidden" },
  header: { minHeight: 78, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  typeIcon: { width: 40, height: 40, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  titleArea: { flex: 1, gap: 4 },
  metaRow: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" },
  type: { fontSize: 10, fontWeight: "800", letterSpacing: 0 },
  origin: { fontSize: 9, fontWeight: "700", letterSpacing: 0 },
  title: { color: "#fff", fontFamily: FontFamily.inikaBold, fontSize: 17 },
  body: { paddingHorizontal: 14, paddingBottom: 14, gap: 14 },
  bodyText: { color: "#f3f2fa", fontSize: 15, lineHeight: 22 },
  flashcard: { minHeight: 130, borderWidth: 1, borderRadius: 6, padding: 16, justifyContent: "center", gap: 8 },
  sideLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0 },
  flipHint: { fontSize: 11, alignSelf: "flex-end" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { minHeight: 44, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5 },
  actionText: { fontSize: 12, fontWeight: "700" },
  deleteText: { color: "#ef8888", fontSize: 12, fontWeight: "700" },
});
