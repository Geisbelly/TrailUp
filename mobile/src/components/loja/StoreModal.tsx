import { FontFamily } from "@/styles/GlobalStyle";
import type { StoreItem, StoreSection, StoreSnapshot } from "@/services/loja/lojaService";
import { comprarItem, carregarLoja } from "@/services/loja/lojaService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { resolveStoreAccent, resolveStoreChest } from "@/services/loja/storeTheme";

const sections: { key: StoreSection; label: string }[] = [
  { key: "informacoes", label: "INFORMAÇÕES" }, { key: "itens", label: "ITENS" },
  { key: "combos", label: "COMBOS" }, { key: "bonus", label: "BÔNUS" }, { key: "presentes", label: "PRESENTES" },
];

type Props = { visible: boolean; alunoId: string; profileName?: string | null; onClose: () => void };

export function StoreModal({ visible, alunoId, profileName, onClose }: Props) {
  const [snapshot, setSnapshot] = useState<StoreSnapshot | null>(null);
  const [section, setSection] = useState<StoreSection>("informacoes");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setSnapshot(await carregarLoja(alunoId, profileName, section)); }
    catch { setError("Não foi possível carregar a loja."); }
    finally { setLoading(false); }
  }, [alunoId, profileName, section]);
  useEffect(() => { if (visible) void load(); }, [visible, load]);
  const accent = resolveStoreAccent(profileName, snapshot?.theme.accentColor);
  const chest = resolveStoreChest(snapshot?.theme.chestKey);
  const items = useMemo(() => snapshot?.items ?? [], [snapshot]);

  async function buy(item: StoreItem) {
    if (item.state !== "available") return;
    setBuying(item.id);
    try { await comprarItem(item.id); await load(); }
    catch { setError("Não foi possível concluir a compra."); }
    finally { setBuying(null); }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View accessibilityViewIsModal style={s.modal}>
          <View style={s.header}><Text style={s.title}>LOJA</Text><Pressable accessibilityLabel="Fechar loja" onPress={onClose}><MaterialCommunityIcons name="close" size={22} color="#16162f" /></Pressable></View>
          <View style={s.balance}><Text style={s.coin}>◉</Text><Text style={s.balanceText}>{snapshot?.balance ?? 0}</Text><MaterialCommunityIcons name={chest as keyof typeof MaterialCommunityIcons.glyphMap} size={42} color={accent} /></View>
          <View style={s.body}>
            <View style={s.tabs}>{sections.map((entry) => <Pressable key={entry.key} accessibilityRole="tab" accessibilityState={{ selected: section === entry.key }} onPress={() => setSection(entry.key)} style={[s.tab, section === entry.key && { backgroundColor: accent }]}><Text numberOfLines={1} style={[s.tabText, section === entry.key && s.tabTextActive]}>{entry.label}</Text></Pressable>)}</View>
            <ScrollView contentContainerStyle={s.content}>
              {loading ? <ActivityIndicator color={accent} style={s.loader} /> : error ? <View style={s.empty}><Text style={s.message}>{error}</Text><Pressable onPress={() => void load()} style={[s.retry, { backgroundColor: accent }]}><Text style={s.retryText}>Tentar novamente</Text></Pressable></View> : items.length === 0 ? <Text style={s.message}>Nenhum item nesta seção.</Text> : items.map((item) => <StoreCard key={item.id} item={item} accent={accent} buying={buying === item.id} onBuy={() => void buy(item)} />)}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function StoreCard({ item, accent, buying, onBuy }: { item: StoreItem; accent: string; buying: boolean; onBuy: () => void }) {
  const disabled = item.state !== "available" || buying;
  const label = item.state === "owned" ? "ADQUIRIDO" : item.state === "blocked" ? "BLOQUEADO" : item.state === "unavailable" ? "INDISPONÍVEL" : String(item.price) + " ◉";
  return <View style={s.card}><View style={[s.art, { borderColor: accent }]}><MaterialCommunityIcons name={(item.assetKey || "gift-outline") as keyof typeof MaterialCommunityIcons.glyphMap} size={28} color={accent} /></View><View style={s.cardInfo}><Text style={s.cardName}>{item.name}</Text><Text style={s.cardDescription}>{item.description}</Text>{item.state === "blocked" && <Text style={s.gate}>Requisito de jornada não atingido</Text>}<Pressable disabled={disabled} onPress={onBuy} style={[s.buy, { backgroundColor: disabled ? "#aaa" : accent }]}>{buying ? <ActivityIndicator color="#fff" /> : <Text style={s.buyText}>{label}</Text>}</Pressable></View></View>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(6,8,16,.82)", alignItems: "center", justifyContent: "center", padding: 12 },
  modal: { width: "100%", maxWidth: 430, maxHeight: "90%", backgroundColor: "#11102f", borderRadius: 14, overflow: "hidden" },
  header: { backgroundColor: "#f2f7fa", padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#16162f", fontFamily: FontFamily.poppinsExtraBold, letterSpacing: 3, fontSize: 16 },
  balance: { backgroundColor: "#f2f7fa", paddingHorizontal: 14, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  coin: { color: "#7190a8", fontSize: 20 }, balanceText: { color: "#16162f", backgroundColor: "#d8dbe3", paddingHorizontal: 16, borderRadius: 5, fontWeight: "700" },
  body: { flexDirection: "row", minHeight: 390 }, tabs: { width: 34, backgroundColor: "#f2f7fa", justifyContent: "space-around", paddingVertical: 8 },
  tab: { minHeight: 70, alignItems: "center", justifyContent: "center", paddingVertical: 4 }, tabText: { color: "#6f7480", fontSize: 8, transform: [{ rotate: "270deg" }] }, tabTextActive: { color: "#fff", fontWeight: "800" },
  content: { flexGrow: 1, padding: 12, gap: 10 }, loader: { marginTop: 60 }, message: { color: "#f2f7fa", textAlign: "center", marginTop: 50 }, empty: { alignItems: "center", gap: 12 },
  retry: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 }, retryText: { color: "#fff", fontWeight: "700" },
  card: { flexDirection: "row", gap: 10, backgroundColor: "#201d48", borderRadius: 8, padding: 10 }, art: { width: 64, height: 64, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" }, cardInfo: { flex: 1 }, cardName: { color: "#fff", fontWeight: "800" }, cardDescription: { color: "#d4d3df", fontSize: 12, marginTop: 3 }, gate: { color: "#f6c453", fontSize: 11, marginTop: 4 }, buy: { alignSelf: "flex-start", minWidth: 84, alignItems: "center", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, marginTop: 7 }, buyText: { color: "#fff", fontSize: 11, fontWeight: "800" },
});
