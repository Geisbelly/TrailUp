import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
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

type Props = { visible: boolean; alunoId: string; classeId: number; profileName?: string | null; onClose: () => void };

export function StoreModal({ visible, alunoId, classeId, profileName, onClose }: Props) {
  const [snapshot, setSnapshot] = useState<StoreSnapshot | null>(null);
  const [section, setSection] = useState<StoreSection>("informacoes");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setSnapshot(await carregarLoja(alunoId, classeId, profileName, section)); }
    catch { setError("Não foi possível carregar a loja."); }
    finally { setLoading(false); }
  }, [alunoId, classeId, profileName, section]);
  useEffect(() => { if (visible) void load(); }, [visible, load]);
  const accent = resolveStoreAccent(profileName, snapshot?.theme.accentColor);
  const palette = getProfileShellPalette(profileName);
  const chest = resolveStoreChest(snapshot?.theme.chestKey);
  const items = useMemo(() => snapshot?.items ?? [], [snapshot]);

  async function buy(item: StoreItem) {
    if (item.state !== "available") return;
    setBuying(item.id);
    try { await comprarItem(item.id, classeId); await load(); }
    catch { setError("Não foi possível concluir a compra."); }
    finally { setBuying(null); }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View accessibilityViewIsModal style={[s.modal, { backgroundColor: palette.surfaceElevated, borderColor: palette.borderStrong }]}>
          <View style={[s.header, { borderBottomColor: palette.border }]}><View><Text style={[s.eyebrow, { color: accent }]}>COMUNIDADE</Text><Text style={[s.title, { color: palette.text }]}>LOJA</Text></View><Pressable accessibilityLabel="Fechar loja" onPress={onClose} style={s.close}><MaterialCommunityIcons name="close" size={22} color={palette.text} /></Pressable></View>
          <View style={s.balance}><View style={[s.coinBadge, { backgroundColor: palette.accentSoft }]}><Text style={s.coin}>◉</Text><Text style={[s.balanceText, { color: palette.text }]}>{snapshot?.balance ?? 0}</Text></View><MaterialCommunityIcons name={chest as keyof typeof MaterialCommunityIcons.glyphMap} size={44} color={accent} /></View>
          <View style={s.body}>
            <View style={[s.tabs, { borderRightColor: palette.border }]}>{sections.map((entry) => <Pressable key={entry.key} accessibilityRole="tab" accessibilityState={{ selected: section === entry.key }} onPress={() => setSection(entry.key)} style={[s.tab, section === entry.key && { backgroundColor: palette.accentSoft, borderRightColor: accent }]}><Text numberOfLines={1} style={[s.tabText, { color: palette.textSubtle }, section === entry.key && { color: accent }]}>{entry.label}</Text></Pressable>)}</View>
            <ScrollView contentContainerStyle={s.content}>
              {loading ? <ActivityIndicator color={accent} style={s.loader} /> : error ? <View style={s.empty}><Text style={[s.message, { color: palette.textMuted }]}>{error}</Text><Pressable onPress={() => void load()} style={[s.retry, { backgroundColor: accent }]}><Text style={s.retryText}>Tentar novamente</Text></Pressable></View> : items.length === 0 ? <View style={s.empty}><MaterialCommunityIcons name="treasure-chest-outline" size={34} color={accent} /><Text style={[s.message, { color: palette.textMuted }]}>Nenhum item disponível nesta seção.</Text></View> : items.map((item) => <StoreCard key={item.id} item={item} accent={accent} buying={buying === item.id} onBuy={() => void buy(item)} />)}
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
  const icon = item.assetKey === "prazo_extra" ? "calendar-clock" : item.assetKey === "segunda_chance" ? "reload-check" : item.assetKey === "troca_formato" ? "swap-horizontal" : "lightbulb-on-outline";
  return <View style={s.card}><View style={[s.art, { borderColor: accent, backgroundColor: accent + "18" }]}><MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={28} color={accent} /></View><View style={s.cardInfo}><Text style={s.cardName}>{item.name}</Text><Text style={s.cardDescription}>{item.description}</Text>{item.metadata.gratisRestantes ? <Text style={s.free}>Disponível sem custo: {String(item.metadata.gratisRestantes)}</Text> : null}<Pressable disabled={disabled} onPress={onBuy} style={[s.buy, { backgroundColor: disabled ? "#4c5060" : accent }]}>{buying ? <ActivityIndicator color="#fff" /> : <Text style={s.buyText}>{label}</Text>}</Pressable></View></View>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(6,8,16,.82)", alignItems: "center", justifyContent: "center", padding: 12 },
  modal: { width: "100%", maxWidth: 430, maxHeight: "90%", borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  header: { padding: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1 }, eyebrow: { fontFamily: FontFamily.inikaBold, fontSize: 10, letterSpacing: 2 }, title: { fontFamily: FontFamily.poppinsExtraBold, letterSpacing: 3, fontSize: 23 }, close: { padding: 8 },
  balance: { paddingHorizontal: 18, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  coinBadge: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 }, coin: { color: "#f6c453", fontSize: 20 }, balanceText: { fontWeight: "800", fontSize: 16 },
  body: { flexDirection: "row", minHeight: 390 }, tabs: { width: 42, borderRightWidth: 1, justifyContent: "space-around", paddingVertical: 8 },
  tab: { minHeight: 72, width: 41, alignItems: "center", justifyContent: "center", paddingVertical: 4, borderRightWidth: 2, borderRightColor: "transparent" }, tabText: { fontSize: 8, transform: [{ rotate: "270deg" }], fontWeight: "700" },
  content: { flexGrow: 1, padding: 12, gap: 10 }, loader: { marginTop: 60 }, message: { color: "#f2f7fa", textAlign: "center", marginTop: 50 }, empty: { alignItems: "center", gap: 12 },
  retry: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 }, retryText: { color: "#fff", fontWeight: "700" },
  card: { flexDirection: "row", gap: 12, backgroundColor: "rgba(242,247,250,.06)", borderRadius: 12, padding: 12 }, art: { width: 58, height: 58, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" }, cardInfo: { flex: 1 }, cardName: { color: "#fff", fontFamily: FontFamily.poppinsExtraBold, fontSize: 14 }, cardDescription: { color: "#d4d3df", fontFamily: FontFamily.interMedium, fontSize: 12, lineHeight: 17, marginTop: 3 }, free: { color: "#f6c453", fontSize: 11, marginTop: 4 }, buy: { alignSelf: "flex-start", minWidth: 84, alignItems: "center", paddingVertical: 7, paddingHorizontal: 11, borderRadius: 8, marginTop: 8 }, buyText: { color: "#fff", fontFamily: FontFamily.poppinsExtraBold, fontSize: 11 },
});
