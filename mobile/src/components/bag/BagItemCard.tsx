import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { actionsForBagItem } from "@/services/bag/bagModel";
import type { BagItem } from "@/services/bag/bagModel";

type Props = {
  item: BagItem;
  accent: string;
  muted: string;
  surface: string;
  border: string;
  onEdit?: (item: BagItem) => void;
  onDelete?: (item: BagItem) => void;
  onShare?: (item: BagItem) => void;
};

const icons = { resumo: "text-box-outline", anotacao: "note-text-outline", card: "cards-outline" } as const;
const labels = { resumo: "RESUMO", anotacao: "ANOTAÇÃO", card: "CARD" } as const;

export function BagItemCard({ item, accent, muted, surface, border, onEdit, onDelete, onShare }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const actions = actionsForBagItem(item);

  return (
    <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
      <Pressable onPress={() => setExpanded((value) => !value)} style={styles.header}>
        <View style={[styles.typeIcon, { backgroundColor: `${accent}22` }]}>
          <MaterialCommunityIcons name={icons[item.type]} size={20} color={accent} />
        </View>
        <View style={styles.titleArea}>
          <View style={styles.metaRow}>
            <Text style={[styles.type, { color: accent }]}>{labels[item.type]}</Text>
            <Text style={[styles.origin, { color: muted }]}>{item.origin === "aluno" ? "MEU ITEM" : "GERADO"}</Text>
          </View>
          <Text numberOfLines={expanded ? undefined : 1} style={styles.title}>{item.title}</Text>
          {item.topicId != null ? <Text style={[styles.link, { color: muted }]}>Tópico {item.topicId}{item.contentId != null ? ` · Conteúdo ${item.contentId}` : ""}</Text> : null}
        </View>
        <MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-down"} size={22} color={muted} />
      </Pressable>

      {expanded ? <View style={styles.body}>
        {item.type === "card" ? <Pressable onPress={() => setFlipped((value) => !value)} style={[styles.flashcard, { borderColor: accent }]}>
          <Text style={[styles.sideLabel, { color: accent }]}>{flipped ? "VERSO" : "FRENTE"}</Text>
          <Text style={styles.bodyText}>{flipped ? item.back : item.front}</Text>
          <Text style={[styles.flipHint, { color: muted }]}>Toque para virar</Text>
        </Pressable> : <Text style={styles.bodyText}>{item.content}</Text>}
        <View style={styles.actions}>
          {actions.includes("editar") ? <Pressable accessibilityLabel="Editar item da Bag" onPress={() => onEdit?.(item)} style={[styles.action, { borderColor: border }]}><MaterialCommunityIcons name="pencil-outline" size={18} color={accent} /><Text style={[styles.actionText, { color: accent }]}>Editar</Text></Pressable> : null}
          {actions.includes("excluir") ? <Pressable accessibilityLabel="Excluir item da Bag" onPress={() => onDelete?.(item)} style={[styles.action, { borderColor: border }]}><MaterialCommunityIcons name="trash-can-outline" size={18} color="#ef8888" /><Text style={styles.deleteText}>Excluir</Text></Pressable> : null}
          {actions.includes("compartilhar") ? <Pressable accessibilityLabel="Compartilhar item da Bag" onPress={() => onShare?.(item)} style={[styles.action, { borderColor: border }]}><MaterialCommunityIcons name="share-variant-outline" size={18} color={accent} /><Text style={[styles.actionText, { color: accent }]}>Compartilhar</Text></Pressable> : null}
        </View>
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, marginBottom: 12, overflow: "hidden" },
  header: { minHeight: 78, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  typeIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  titleArea: { flex: 1, gap: 4 },
  metaRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  type: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  origin: { fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },
  title: { color: "#fff", fontSize: 16, fontWeight: "700" },
  link: { fontSize: 11 },
  body: { paddingHorizontal: 14, paddingBottom: 14, gap: 14 },
  bodyText: { color: "#f3f2fa", fontSize: 15, lineHeight: 22 },
  flashcard: { minHeight: 130, borderWidth: 1, borderRadius: 12, padding: 16, justifyContent: "center", gap: 8 },
  sideLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  flipHint: { fontSize: 11, alignSelf: "flex-end" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { minHeight: 36, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5 },
  actionText: { fontSize: 12, fontWeight: "700" },
  deleteText: { color: "#ef8888", fontSize: 12, fontWeight: "700" },
});
