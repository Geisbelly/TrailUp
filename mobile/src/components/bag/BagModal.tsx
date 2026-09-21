import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { createBagItem, deleteBagItem, listBagItems, updateBagItem } from "@/services/bag/bagService";
import { bagTypeFilterOptions, isBagClassReady, shouldShowBagTypeFilters, type BagDraft, type BagFilter, type BagItem, type BagItemOrigin, type BagItemType } from "@/services/bag/bagModel";
import { BagEditorModal } from "./BagEditorModal";
import { BagItemCard } from "./BagItemCard";
import { BagStoreItem } from "./BagStoreItem";

type Props = {
  visible: boolean;
  classeId?: number | null;
  topicId?: number | null;
  contentId?: number | null;
  profile?: string | null;
  onClose: () => void;
  onShare?: (item: BagItem) => void;
};

export function BagModal({ visible, classeId, topicId, contentId, profile, onClose, onShare }: Props) {
  const palette = getProfileShellPalette(profile ?? null);
  const [origin, setOrigin] = useState<BagItemOrigin | null>(null);
  const [type, setType] = useState<BagItemType | null>(null);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<BagItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<BagItem | null>(null);

  const filter = useMemo<BagFilter>(() => ({ origin, type, classId: classeId, topicId, search }), [classeId, origin, search, topicId, type]);
  const selectOrigin = (next: BagItemOrigin | null) => { setOrigin(next); setType(null); };
  const load = useCallback(async (refresh = false) => {
    setError(null);
    if (!isBagClassReady(filter.classId)) {
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (refresh) setRefreshing(true); else setLoading(true);
    try { setItems(await listBagItems(filter)); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar a Bag."); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => { if (visible) void load(); }, [load, visible]);

  const save = async (draft: BagDraft, item?: BagItem | null) => {
    if (item) await updateBagItem(item.sourceId, draft); else await createBagItem(draft);
    await load(true);
  };

  const remove = (item: BagItem) => Alert.alert(
    "Excluir item",
    "Este item será removido da sua Bag.",
    [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          try { await deleteBagItem(item.sourceId); await load(true); }
          catch (err) { setError(err instanceof Error ? err.message : "Não foi possível excluir o item."); }
        },
      },
    ],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: palette.background }]}>
        <View style={[styles.header, { borderBottomColor: palette.border }]}>
          <View><Text style={[styles.kicker, { color: palette.accent }]}>INVENTÁRIO DE JORNADA</Text><Text style={[styles.title, { color: palette.text }]}>BAG</Text></View>
          <Pressable accessibilityLabel="Fechar Bag" onPress={onClose} style={[styles.close, { borderColor: palette.border }]}><MaterialCommunityIcons name="close" size={22} color={palette.text} /></Pressable>
        </View>
        <View style={styles.tabs}>
          <Pressable onPress={() => selectOrigin(null)} style={[styles.tab, { borderBottomColor: origin === null ? palette.accent : "transparent" }]}><Text style={[styles.tabText, { color: origin === null ? palette.accent : palette.inactive }]}>Todos</Text></Pressable>
          <Pressable onPress={() => selectOrigin("aluno")} style={[styles.tab, { borderBottomColor: origin === "aluno" ? palette.accent : "transparent" }]}><Text style={[styles.tabText, { color: origin === "aluno" ? palette.accent : palette.inactive }]}>Salvos</Text></Pressable>
          <Pressable onPress={() => selectOrigin("loja")} style={[styles.tab, { borderBottomColor: origin === "loja" ? palette.accent : "transparent" }]}><Text style={[styles.tabText, { color: origin === "loja" ? palette.accent : palette.inactive }]}>Comprados</Text></Pressable>
          <Pressable onPress={() => selectOrigin("plataforma")} style={[styles.tab, { borderBottomColor: origin === "plataforma" ? palette.accent : "transparent" }]}><Text style={[styles.tabText, { color: origin === "plataforma" ? palette.accent : palette.inactive }]}>Gerados</Text></Pressable>
        </View>
        <View style={[styles.search, { borderColor: palette.border, backgroundColor: palette.surface }]}><MaterialCommunityIcons name="magnify" size={19} color={palette.inactive} /><TextInput value={search} onChangeText={setSearch} placeholder="Buscar na Bag" placeholderTextColor={palette.inactive} style={[styles.searchInput, { color: palette.text }]} /></View>
        {shouldShowBagTypeFilters(origin) ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <Pressable onPress={() => setType(null)} style={[styles.filter, { borderColor: type === null ? palette.accent : palette.border }]}><Text style={{ color: type === null ? palette.accent : palette.text }}>Todos</Text></Pressable>
          {bagTypeFilterOptions(origin).map((value) => <Pressable key={value} onPress={() => setType(value)} style={[styles.filter, { borderColor: type === value ? palette.accent : palette.border }]}><Text style={{ color: type === value ? palette.accent : palette.text }}>{value === "anotacao" ? "Anotações" : value === "resumo" ? "Resumos" : "Cards"}</Text></Pressable>)}
        </ScrollView> : null}
        {loading ? <ActivityIndicator color={palette.accent} style={styles.loader} /> : error ? <View style={styles.empty}><MaterialCommunityIcons name="alert-circle-outline" size={40} color={palette.accent} /><Text style={[styles.emptyTitle, { color: palette.text }]}>Não foi possível carregar</Text><Text style={[styles.emptyText, { color: palette.inactive }]}>{error}</Text><Pressable onPress={() => void load()} style={[styles.retry, { backgroundColor: palette.accent }]}><Text style={styles.retryText}>Tentar novamente</Text></Pressable></View> : <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={palette.accent} />}>
          {items.length ? items.map((item) => item.origin === "loja" ? <BagStoreItem key={item.id} item={item} profile={profile} muted={palette.inactive} surface={palette.surface} border={palette.border} /> : <BagItemCard key={item.id} item={item} accent={palette.accent} muted={palette.inactive} surface={palette.surface} border={palette.border} onEdit={(selected) => { setEditing(selected); setEditorOpen(true); }} onDelete={remove} onShare={onShare} />) : <View style={styles.empty}><MaterialCommunityIcons name={origin === "loja" ? "shopping-outline" : origin === "plataforma" ? "creation-outline" : "bag-personal-outline"} size={52} color={palette.accent} /><Text style={[styles.emptyTitle, { color: palette.text }]}>{origin === "loja" ? "Nenhuma compra encontrada" : origin === "plataforma" ? "Nenhum material gerado" : "Sua Bag está vazia"}</Text><Text style={[styles.emptyText, { color: palette.inactive }]}>{origin === "loja" ? "Os itens comprados na loja aparecerão aqui." : origin === "plataforma" ? "Os materiais personalizados aparecerão aqui." : "Os itens salvos e comprados aparecerão aqui."}</Text></View>}
        </ScrollView>}
        {isBagClassReady(classeId) && origin !== "loja" && origin !== "plataforma" ? <Pressable accessibilityLabel="Criar item na Bag" onPress={() => { setEditing(null); setEditorOpen(true); }} style={[styles.fab, { backgroundColor: palette.accent }]}><MaterialCommunityIcons name="plus" size={22} color="#fff" /><Text style={styles.fabText}>Novo item</Text></Pressable> : null}
        <BagEditorModal visible={editorOpen} initialItem={editing} context={{ classId: classeId, topicId, contentId }} accent={palette.accent} surface={palette.surfaceElevated} muted={palette.inactive} onClose={() => setEditorOpen(false)} onSave={save} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingTop: 54 }, header: { paddingHorizontal: 20, paddingBottom: 15, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1 }, kicker: { fontSize: 10, fontWeight: "800", letterSpacing: 1.7 }, title: { fontSize: 30, fontWeight: "900", letterSpacing: 2 }, close: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" }, tabs: { flexDirection: "row", paddingHorizontal: 14 }, tab: { flex: 1, alignItems: "center", paddingVertical: 15, borderBottomWidth: 2 }, tabText: { fontSize: 14, fontWeight: "800" }, search: { margin: 16, borderWidth: 1, borderRadius: 12, minHeight: 46, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 }, searchInput: { flex: 1, fontSize: 15 }, filters: { paddingHorizontal: 16, gap: 8, paddingBottom: 10 }, filter: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }, loader: { marginTop: 44 }, list: { padding: 16, paddingBottom: 115 }, empty: { alignItems: "center", justifyContent: "center", padding: 44, gap: 10 }, emptyTitle: { fontSize: 20, fontWeight: "800", textAlign: "center" }, emptyText: { fontSize: 14, lineHeight: 21, textAlign: "center" }, retry: { marginTop: 8, borderRadius: 11, paddingHorizontal: 18, paddingVertical: 11 }, retryText: { color: "#fff", fontWeight: "800" }, fab: { position: "absolute", right: 18, bottom: 24, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 7 }, fabText: { color: "#fff", fontWeight: "800" },
});
