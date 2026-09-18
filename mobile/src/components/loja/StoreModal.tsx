import { StoreItemIcon } from "@/components/loja/StoreItemIcon";
import type { StoreItem, StoreSnapshot } from "@/services/loja/lojaService";
import { comprarItem, carregarLoja } from "@/services/loja/lojaService";
import { resolveStoreAccent } from "@/services/loja/storeTheme";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type Props = { visible: boolean; alunoId: string; classeId: number; profileName?: string | null; onClose: () => void };

export function StoreModal({ visible, alunoId, classeId, profileName, onClose }: Props) {
  const [snapshot, setSnapshot] = useState<StoreSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const palette = getProfileShellPalette(profileName);
  const accent = resolveStoreAccent(profileName, snapshot?.theme.accentColor);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setSnapshot(await carregarLoja(alunoId, classeId, profileName)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar a loja."); }
    finally { setLoading(false); }
  }, [alunoId, classeId, profileName]);

  useEffect(() => { if (visible) { setNotice(null); void load(); } }, [visible, load]);

  async function buy(item: StoreItem) {
    if (item.state !== "available" || buying) return;
    setBuying(item.id); setError(null); setNotice(null);
    try { await comprarItem(item.id, classeId); setNotice(`${item.name} adquirido.`); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível concluir a compra."); }
    finally { setBuying(null); }
  }

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}><View accessibilityViewIsModal style={[styles.modal, { backgroundColor: palette.surfaceElevated, borderColor: palette.borderStrong }]}>
      <View style={[styles.header, { borderBottomColor: palette.border }]}><View><Text style={[styles.eyebrow, { color: accent }]}>COMUNIDADE</Text><Text style={[styles.title, { color: palette.text }]}>LOJA</Text><Text style={[styles.subtitle, { color: palette.textMuted }]}>Recursos para sua jornada</Text></View><Pressable accessibilityLabel="Fechar loja" onPress={onClose} style={styles.close}><Text style={[styles.closeText, { color: palette.text }]}>×</Text></Pressable></View>
      <View style={styles.balanceRow}><Text style={[styles.balanceLabel, { color: palette.textMuted }]}>SEU SALDO</Text><View style={[styles.balance, { backgroundColor: palette.accentSoft }]}><Text style={styles.coin}>◉</Text><Text style={[styles.balanceText, { color: palette.text }]}>{snapshot?.balance ?? 0}</Text></View></View>
      <View style={[styles.sectionHeader, { borderBottomColor: palette.border }]}><Text style={[styles.sectionTitle, { color: palette.text }]}>ITENS</Text><Text style={[styles.sectionHint, { color: palette.textMuted }]}>{snapshot?.items.length ?? 0} disponíveis</Text></View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator color={accent} style={styles.loader} /> : error ? <View style={styles.empty}><Text style={[styles.message, { color: palette.textMuted }]}>{error}</Text><Pressable onPress={() => void load()} style={[styles.retry, { backgroundColor: accent }]}><Text style={styles.retryText}>Tentar novamente</Text></Pressable></View> : snapshot?.items.length ? snapshot.items.map((item) => <StoreCard key={item.id} item={item} accent={accent} palette={palette} buying={buying === item.id} onBuy={() => void buy(item)} />) : <View style={styles.empty}><Text style={[styles.message, { color: palette.textMuted }]}>Nenhum item disponível no momento.</Text></View>}
        {notice ? <Text accessibilityLiveRegion="polite" style={[styles.notice, { color: accent }]}>{notice}</Text> : null}
      </ScrollView>
    </View></View>
  </Modal>;
}

function StoreCard({ item, accent, palette, buying, onBuy }: { item: StoreItem; accent: string; palette: ReturnType<typeof getProfileShellPalette>; buying: boolean; onBuy: () => void }) {
  const disabled = item.state !== "available" || buying;
  const status = item.state === "owned" ? "ADQUIRIDO" : item.state === "unavailable" ? "INDISPONÍVEL" : item.state === "blocked" ? "BLOQUEADO" : "DISPONÍVEL";
  const price = item.price > 0 ? `${item.price} ◉` : "GRÁTIS";
  return <View style={[styles.card, { borderColor: palette.border, backgroundColor: palette.surface }]}><View style={[styles.iconBox, { backgroundColor: palette.accentSoft, borderColor: accent }]}><StoreItemIcon effect={item.assetKey} color={accent} size={48} /></View><View style={styles.cardInfo}><View style={styles.cardHeading}><Text style={[styles.cardName, { color: palette.text }]}>{item.name}</Text><Text style={[styles.status, { color: item.state === "available" ? accent : palette.textMuted }]}>{status}</Text></View><Text style={[styles.cardDescription, { color: palette.textSubtle }]}>{item.description}</Text>{item.metadata.gratisRestantes ? <Text style={[styles.free, { color: accent }]}>Dotação gratuita: {String(item.metadata.gratisRestantes)}</Text> : null}<View style={styles.actionRow}><Text style={[styles.price, { color: palette.text }]}>{price}</Text><Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onBuy} style={[styles.buy, { backgroundColor: disabled ? palette.borderStrong : accent }]}>{buying ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.buyText}>{item.state === "owned" ? "ADQUIRIDO" : "COMPRAR"}</Text>}</Pressable></View></View></View>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(3,5,12,.86)", alignItems: "center", justifyContent: "center", padding: 16 }, modal: { width: "100%", maxWidth: 440, maxHeight: "88%", borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1 }, eyebrow: { fontFamily: FontFamily.inikaBold, fontSize: 10, letterSpacing: 2 }, title: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 26, letterSpacing: 2 }, subtitle: { fontFamily: FontFamily.interMedium, fontSize: 12, marginTop: 2 }, close: { padding: 6 }, closeText: { fontSize: 30, lineHeight: 30, fontWeight: "300" },
  balanceRow: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, balanceLabel: { fontFamily: FontFamily.inikaBold, fontSize: 10, letterSpacing: 1.2 }, balance: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9, flexDirection: "row", alignItems: "center", gap: 7 }, coin: { color: "#f6c453", fontSize: 16 }, balanceText: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 16 },
  sectionHeader: { marginHorizontal: 20, paddingBottom: 10, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", borderBottomWidth: 1 }, sectionTitle: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 15, letterSpacing: 1.5 }, sectionHint: { fontFamily: FontFamily.interMedium, fontSize: 11 }, content: { padding: 16, gap: 10 }, loader: { marginTop: 64 }, empty: { alignItems: "center", paddingVertical: 50, paddingHorizontal: 20, gap: 12 }, message: { fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 21, textAlign: "center" }, retry: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9 }, retryText: { color: "#fff", fontFamily: FontFamily.poppinsExtraBold, fontSize: 12 }, notice: { fontFamily: FontFamily.poppinsExtraBold, textAlign: "center", paddingVertical: 8 },
  card: { flexDirection: "row", gap: 12, borderWidth: 1, borderRadius: 14, padding: 12 }, iconBox: { width: 64, height: 64, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center" }, cardInfo: { flex: 1, minWidth: 0 }, cardHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 }, cardName: { flex: 1, fontFamily: FontFamily.poppinsExtraBold, fontSize: 14 }, status: { fontFamily: FontFamily.inikaBold, fontSize: 9, letterSpacing: 0.5 }, cardDescription: { fontFamily: FontFamily.interMedium, fontSize: 12, lineHeight: 17, marginTop: 4 }, free: { fontFamily: FontFamily.interMedium, fontSize: 11, marginTop: 5 }, actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 9 }, price: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 13 }, buy: { minWidth: 92, minHeight: 34, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, borderRadius: 8 }, buyText: { color: "#fff", fontFamily: FontFamily.poppinsExtraBold, fontSize: 10, letterSpacing: 0.3 },
});
