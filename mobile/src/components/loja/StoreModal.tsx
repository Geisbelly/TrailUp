import { JourneyHeading } from "@/components/JourneyHeading";
import { StoreItemIcon } from "@/components/loja/StoreItemIcon";
import { journeyObjects } from "@/constants/designAssets";
import { ProfileArtwork } from "@/components/ProfileArtwork";
import type { StoreItem, StoreSnapshot } from "@/services/loja/lojaService";
import { comprarItem, carregarLoja } from "@/services/loja/lojaService";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  alunoId: string;
  classeId: number;
  profileName?: string | null;
  onClose: () => void;
};

export function StoreModal({
  visible,
  alunoId,
  classeId,
  profileName,
  onClose,
}: Props) {
  const [snapshot, setSnapshot] = useState<StoreSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const purchaseLock = useRef(false);
  const request = useRef(0);
  const palette = getProfileShellPalette(profileName);
  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const data = await carregarLoja(alunoId, classeId, profileName);
      if (current === request.current) setSnapshot(data);
    } catch (caught) {
      if (current === request.current)
        setError(
          caught instanceof Error
            ? caught.message
            : "Não foi possível carregar a loja.",
        );
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [alunoId, classeId, profileName]);

  useEffect(() => {
    setSnapshot(null);
    if (visible) {
      setNotice(null);
      void load();
    }
    return () => {
      request.current += 1;
    };
  }, [visible, load]);

  async function buy(item: StoreItem) {
    if (item.state !== "available" || purchaseLock.current) return;
    purchaseLock.current = true;
    setBuying(item.id);
    setError(null);
    setNotice(null);
    try {
      await comprarItem(item.id, classeId);
      setNotice(`${item.name} adquirido.`);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível concluir a compra.",
      );
    } finally {
      purchaseLock.current = false;
      setBuying(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView
          style={[s.screen, { backgroundColor: palette.background }]}
        >
          <JourneyHeading
            title="Loja"
            eyebrow="RECURSOS DA JORNADA"
            artwork={journeyObjects.chest}
            palette={palette}
            right={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar loja"
                onPress={onClose}
                style={[s.close, { borderColor: palette.border }]}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={22}
                  color={palette.accent}
                />
              </Pressable>
            }
          />
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.content}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={() => void load()}
                tintColor={palette.accent}
              />
            }
          >
            <View style={[s.balance, { borderBottomColor: palette.border }]}>
              <View style={s.flex}>
                <Text style={[s.label, { color: palette.textMuted }]}>
                  SEU SALDO
                </Text>
                <Text style={[s.balanceNumber, { color: palette.text }]}>
                  {snapshot?.balance ?? "--"}
                </Text>
              </View>
              <ProfileArtwork
                source={journeyObjects.coin}
                profile={profileName}
                width={70}
                height={76}
                style={s.coin}
              />
            </View>
            {notice ? (
              <View style={[s.feedback, { borderColor: palette.accent }]}>
                <MaterialCommunityIcons
                  name="check-circle-outline"
                  size={20}
                  color={palette.accent}
                />
                <Text
                  accessibilityLiveRegion="polite"
                  style={[s.feedbackText, { color: palette.text }]}
                >
                  {notice}
                </Text>
              </View>
            ) : null}
            {error ? (
              <View style={[s.feedback, { borderColor: palette.borderStrong }]}>
                <Text
                  accessibilityRole="alert"
                  style={[s.feedbackText, { color: palette.text }]}
                >
                  {error}
                </Text>
                <Pressable
                  accessibilityLabel="Atualizar loja"
                  onPress={() => void load()}
                  style={s.close}
                >
                  <MaterialCommunityIcons
                    name="refresh"
                    size={22}
                    color={palette.accent}
                  />
                </Pressable>
              </View>
            ) : null}
            <Text style={[s.sectionTitle, { color: palette.text }]}>
              Itens da loja
            </Text>
            {loading && !snapshot ? (
              <ActivityIndicator color={palette.accent} style={s.empty} />
            ) : snapshot?.items.length ? (
              snapshot.items.map((item) => (
                <StoreCard
                  key={item.id}
                  item={item}
                  palette={palette}
                  buying={buying === item.id}
                  busy={!!buying || loading}
                  onBuy={() => void buy(item)}
                />
              ))
            ) : !error ? (
              <Text style={[s.empty, { color: palette.textMuted }]}>
                Nenhum item disponível no momento.
              </Text>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function StoreCard({
  item,
  palette,
  buying,
  busy,
  onBuy,
}: {
  item: StoreItem;
  palette: ReturnType<typeof getProfileShellPalette>;
  buying: boolean;
  busy: boolean;
  onBuy: () => void;
}) {
  const disabled = item.state !== "available" || busy;
  const status =
    item.state === "owned"
      ? "Adquirido"
      : item.state === "unavailable"
        ? "Indisponível"
        : item.state === "blocked"
          ? "Bloqueado"
          : null;
  return (
    <View
      style={[
        s.item,
        { borderColor: palette.border, backgroundColor: palette.surface },
      ]}
    >
      <View style={s.itemHeading}>
        <StoreItemIcon
          effect={item.assetKey}
          color={palette.accent}
          size={64}
        />
        <View style={s.flex}>
          <Text style={[s.itemName, { color: palette.text }]}>{item.name}</Text>
          {status ? (
            <Text style={[s.status, { color: palette.textMuted }]}>
              {status}
            </Text>
          ) : null}
          <Text style={[s.description, { color: palette.textMuted }]}>
            {item.description}
          </Text>
        </View>
      </View>
      {item.metadata.gratisRestantes ? (
        <Text style={[s.free, { color: palette.accent }]}>
          Disponíveis gratuitamente: {String(item.metadata.gratisRestantes)}
        </Text>
      ) : null}
      <View style={[s.actionRow, { borderTopColor: palette.border }]}>
        <View style={s.priceRow}>
          {item.price > 0 ? (
            <ProfileArtwork
              source={journeyObjects.coin}
              color={palette.accent}
              width={24}
              height={28}
              style={s.priceIcon}
            />
          ) : null}
          <Text style={[s.price, { color: palette.text }]}>
            {item.price > 0 ? item.price : "Grátis"}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${status ?? "Comprar"} ${item.name}`}
          accessibilityState={{ disabled, busy: buying }}
          disabled={disabled}
          onPress={onBuy}
          style={[
            s.buy,
            {
              backgroundColor: disabled
                ? palette.surfaceElevated
                : palette.accent,
              borderColor: palette.borderStrong,
            },
          ]}
        >
          {buying ? (
            <ActivityIndicator color={palette.accent} size="small" />
          ) : (
            <>
              <MaterialCommunityIcons
                name={
                  item.state === "owned"
                    ? "check"
                    : item.state === "blocked"
                      ? "lock-outline"
                      : "shopping-outline"
                }
                size={16}
                color={disabled ? palette.textMuted : palette.background}
              />
              <Text
                style={[
                  s.buyText,
                  { color: disabled ? palette.textMuted : palette.background },
                ]}
              >
                {status ?? "Comprar"}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  close: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: 20, paddingBottom: 28, gap: 16 },
  balance: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 22,
    borderBottomWidth: 1,
  },
  label: { fontSize: 11, fontWeight: "700" },
  balanceNumber: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 36,
    marginTop: 4,
  },
  coin: { width: 70, height: 76 },
  sectionTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 21,
    marginTop: 4,
  },
  item: { borderWidth: 1, borderRadius: 6, padding: 16 },
  itemHeading: { flexDirection: "row", gap: 14, alignItems: "center" },
  itemName: { fontFamily: FontFamily.inikaBold, fontSize: 18 },
  description: { fontSize: 13, lineHeight: 19, marginTop: 6 },
  status: { fontSize: 11, marginTop: 5 },
  free: { fontSize: 12, marginTop: 12 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  priceIcon: { width: 24, height: 28 },
  price: { fontSize: 16, fontWeight: "700" },
  buy: {
    minHeight: 44,
    minWidth: 118,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buyText: { fontSize: 13, fontWeight: "700" },
  feedback: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderRadius: 6,
  },
  feedbackText: { flex: 1, fontSize: 13, lineHeight: 20 },
  empty: { textAlign: "center", marginVertical: 40 },
});
