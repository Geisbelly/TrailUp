import { JourneyHeading } from "@/components/JourneyHeading";
import { SeletorQuantidade } from "@/components/loja/SeletorQuantidade";
import { StoreItemIcon } from "@/components/loja/StoreItemIcon";
import { UtilityIcon } from "@/components/UtilityIcon";
import { filtrarExtrato, type FiltroDeExtrato, type Movimento } from "@/services/loja/extratoModel";
import type { StoreItem, StoreSnapshot } from "@/services/loja/lojaService";
import { comprarItem, carregarExtrato, carregarLoja } from "@/services/loja/lojaService";
import { emPosse, maxQuantidade } from "@/services/loja/storeModel";
import { FontFamily } from "@/styles/GlobalStyle";
import { avisoCompraFeita, limitarQuantidade, precosDoPedido, textoNaBag } from "@/utils/compraLoja";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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

const FILTROS_EXTRATO: { id: FiltroDeExtrato; rotulo: string }[] = [
  { id: "todos", rotulo: "Tudo" },
  { id: "evento", rotulo: "Ganhos" },
  { id: "compra", rotulo: "Compras" },
  { id: "estorno", rotulo: "Estornos" },
];

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
  const [movimentos, setMovimentos] = useState<Movimento[] | null>(null);
  const [filtro, setFiltro] = useState<FiltroDeExtrato>("todos");
  // Compra à espera de confirmação (mobile-v1, 12-loja.html: folha "Comprar X?").
  const [pedido, setPedido] = useState<{ item: StoreItem; quantidade: number } | null>(null);
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
      const nomes = new Map(data.items.map((item) => [item.id, item.name]));
      const extrato = await carregarExtrato(alunoId, nomes, 30).catch(() => [] as Movimento[]);
      if (current === request.current) setMovimentos(extrato);
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

  async function buy(item: StoreItem, quantidade: number) {
    if (item.state !== "available" || purchaseLock.current) return;
    purchaseLock.current = true;
    setBuying(item.id);
    setError(null);
    setNotice(null);
    try {
      await comprarItem(item.id, classeId, quantidade);
      setNotice(avisoCompraFeita(item, quantidade));
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
            section="store"
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
            <View style={[s.saldo, { borderColor: palette.accentSoft, backgroundColor: palette.surface }]}>
              <LinearGradient
                colors={[palette.accentMuted, "transparent"]}
                start={{ x: 1, y: 0 }}
                end={{ x: 0.3, y: 0.7 }}
                style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}
              />
              <Text style={[s.saldoRotulo, { color: palette.accent }]}>SEU SALDO</Text>
              <View style={s.saldoLinha}>
                <Text style={[s.saldoNumero, { color: palette.text }]}>{snapshot?.balance ?? "--"}</Text>
                <UtilityIcon kind="coin" profile={profileName} size={46} height={50} style={s.saldoMoeda} />
              </View>
              <Text style={[s.saldoTexto, { color: palette.textMuted }]}>
                Suas moedas vêm do estudo. Gastar nunca muda seu XP nem sua posição no ranking.
              </Text>
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
            <View style={s.itensTitulo}>
              <Text style={[s.sectionTitle, { color: palette.text }]}>Itens</Text>
              {snapshot?.items.length ? (
                <Text style={[s.itensContador, { color: palette.textSubtle, backgroundColor: palette.surfaceElevated }]}>
                  {snapshot.items.length}
                </Text>
              ) : null}
            </View>
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
                  celular
                  onBuy={(quantidade) => setPedido({ item, quantidade })}
                />
              ))
            ) : !error ? (
              <Text style={[s.empty, { color: palette.textMuted }]}>
                Nenhum item disponível no momento.
              </Text>
            ) : null}
            <Text style={[s.sectionTitle, { color: palette.text }]}>Histórico</Text>
            <View style={s.filters}>
              {FILTROS_EXTRATO.map((opcao) => (
                <Pressable key={opcao.id} accessibilityRole="button" onPress={() => setFiltro(opcao.id)}>
                  <Text style={[s.filterText, { color: filtro === opcao.id ? palette.accent : palette.textMuted }]}>
                    {opcao.rotulo}
                  </Text>
                </Pressable>
              ))}
            </View>
            {filtrarExtrato(movimentos ?? [], filtro).length ? (
              filtrarExtrato(movimentos ?? [], filtro).map((movimento) => (
                <View key={movimento.id} style={s.movement}>
                  <Text style={[s.movementValue, { color: movimento.valor > 0 ? "#62db9b" : palette.textMuted }]}>
                    {movimento.valor > 0 ? `+${movimento.valor}` : `−${Math.abs(movimento.valor)}`}
                  </Text>
                  <Text style={[s.movementText, { color: palette.text }]} numberOfLines={1}>{movimento.descricao}</Text>
                  <Text style={[s.filterText, { color: palette.textMuted }]}>{movimento.quando}</Text>
                </View>
              ))
            ) : (
              <Text style={[s.empty, { color: palette.textMuted }]}>Nenhuma movimentação neste filtro.</Text>
            )}
          </ScrollView>
          {pedido ? (
            <ConfirmarCompra
              item={pedido.item}
              quantidade={pedido.quantidade}
              saldo={snapshot?.balance ?? null}
              palette={palette}
              onCancelar={() => setPedido(null)}
              onConfirmar={() => {
                const atual = pedido;
                setPedido(null);
                void buy(atual.item, atual.quantidade);
              }}
            />
          ) : null}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

/**
 * Folha de confirmação da compra (mobile-v1, `12-loja.html`): o item, quanto o
 * saldo fica depois, e Comprar/Cancelar. Sem ela, um toque gastava moedas.
 */
function ConfirmarCompra({
  item,
  quantidade,
  saldo,
  palette,
  onCancelar,
  onConfirmar,
}: {
  item: StoreItem;
  quantidade: number;
  saldo: number | null;
  palette: ReturnType<typeof getProfileShellPalette>;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const total = precosDoPedido(item, quantidade).reduce((a, b) => a + b, 0);
  const gratis = total === 0;
  const verbo = gratis ? "Pegar" : "Comprar";
  const nome = quantidade > 1 ? `${quantidade}× ${item.name}` : item.name;
  // O cartão deixa "Comprar" ativo mesmo sem saldo (quem recusa é o servidor); aqui não
  // dá para mostrar "0 → -20" nem deixar o aluno confirmar uma compra que vai falhar.
  const semSaldo = !gratis && saldo !== null && saldo < total;
  return (
    <View style={[StyleSheet.absoluteFill, s.veu, { backgroundColor: `${palette.background}cc` }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancelar} accessibilityRole="button" accessibilityLabel="Cancelar compra" />
      <View
        accessibilityViewIsModal
        style={[s.folha, { backgroundColor: palette.surfaceElevated, borderColor: palette.borderStrong }]}
      >
        <View style={[s.alca, { backgroundColor: palette.borderStrong }]} />
        <StoreItemIcon effect={item.assetKey} color={palette.accent} size={84} />
        <Text accessibilityRole="header" style={[s.folhaTitulo, { color: palette.text }]}>
          {verbo} {nome}?
        </Text>
        <Text style={[s.folhaTexto, { color: palette.textMuted }]}>{item.description}</Text>
        <View style={[s.soma, { backgroundColor: palette.surface }]}>
          <Text style={[s.somaTexto, { color: palette.text }]}>
            {gratis
              ? "Não gasta moedas"
              : saldo === null
                ? `Custa ${total} moedas`
                : semSaldo
                  ? `Saldo insuficiente: faltam ${total - saldo} moedas`
                  : `Saldo: ${saldo} → ${saldo - total}`}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: semSaldo }}
          disabled={semSaldo}
          onPress={onConfirmar}
          style={[s.folhaBotao, { backgroundColor: semSaldo ? palette.surface : palette.accent }]}
        >
          <Text style={[s.folhaBotaoTexto, { color: semSaldo ? palette.textMuted : palette.background }]}>{verbo}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onCancelar}
          style={[s.folhaBotao, { borderWidth: 1, borderColor: palette.borderStrong }]}
        >
          <Text style={[s.folhaBotaoTexto, { color: palette.text }]}>Cancelar</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Exportado para a página da Loja na web em tela larga (#346).
export function StoreCard({
  item,
  palette,
  buying,
  busy,
  onBuy,
  celular = false,
}: {
  item: StoreItem;
  palette: ReturnType<typeof getProfileShellPalette>;
  buying: boolean;
  busy: boolean;
  onBuy: (quantidade: number) => void;
  /** Visual do celular (mobile-v1, 12-loja.html); a Loja da web larga não passa. */
  celular?: boolean;
}) {
  const [quantidade, setQuantidade] = useState(1);
  const maximo = Math.max(1, maxQuantidade(item));
  const qtd = limitarQuantidade(item, quantidade);
  const total = precosDoPedido(item, qtd).reduce((a, b) => a + b, 0);
  const naBag = textoNaBag(emPosse(item));
  const disabled = item.state !== "available" || busy;
  const status =
    item.state === "limit"
      ? "Limite atingido"
      : item.state === "unavailable"
        ? "Indisponível"
        : item.state === "blocked"
          ? "Bloqueado"
          : null;
  return (
    <View
      style={[
        s.item,
        celular && s.itemCelular,
        { borderColor: palette.border, backgroundColor: palette.surface },
        celular && disabled && item.state !== "available" ? { opacity: 0.72 } : null,
      ]}
    >
      <View style={s.itemHeading}>
        <StoreItemIcon
          effect={item.assetKey}
          color={palette.accent}
          size={celular ? 56 : 64}
        />
        <View style={s.flex}>
          <Text style={[s.itemName, celular && s.itemNameCelular, { color: palette.text }]}>{item.name}</Text>
          {status ? (
            <Text style={[s.status, { color: palette.textMuted }]}>
              {status}
            </Text>
          ) : null}
          <Text style={[s.description, celular && s.descriptionCelular, { color: palette.textMuted }]}>
            {item.description}
          </Text>
        </View>
      </View>
      {naBag ? (
        <Text style={[s.free, { color: palette.textMuted }]}>{naBag}</Text>
      ) : null}
      {item.metadata.gratisRestantes ? (
        celular ? (
          // Selo de gratuidade (.chip no protótipo).
          <View style={[s.seloGratis, { backgroundColor: palette.accentMuted, borderColor: palette.accentSoft }]}>
            <Text style={[s.seloGratisTexto, { color: palette.accent }]}>
              {Number(item.metadata.gratisRestantes) === 1
                ? "1 grátis restante"
                : `${String(item.metadata.gratisRestantes)} grátis restantes`}
            </Text>
          </View>
        ) : (
          <Text style={[s.free, { color: palette.accent }]}>
            Disponíveis gratuitamente: {String(item.metadata.gratisRestantes)}
          </Text>
        )
      ) : null}
      <View style={[s.actionRow, { borderTopColor: palette.border }]}>
        <View style={s.priceRow}>
          {total > 0 ? (
            <UtilityIcon
              kind="coin"
              profile={palette.profile}
              size={24}
              height={28}
              style={s.priceIcon}
            />
          ) : null}
          <Text style={[s.price, { color: palette.text }]}>
            {total > 0 ? total : "Grátis"}
          </Text>
        </View>
        {item.state === "available" && maximo > 1 ? (
          <SeletorQuantidade
            valor={qtd}
            maximo={maximo}
            desabilitado={busy}
            cor={palette.text}
            corApagada={palette.textMuted}
            nome={item.name}
            onMudar={(n) => setQuantidade(limitarQuantidade(item, n))}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${status ?? (qtd > 1 ? `Comprar ${qtd}` : "Comprar")} ${item.name}`}
          accessibilityState={{ disabled, busy: buying }}
          disabled={disabled}
          onPress={() => onBuy(qtd)}
          style={[
            s.buy,
            celular && s.buyCelular,
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
                  item.state === "limit"
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
                {status ?? (qtd > 1 ? `Comprar ${qtd}` : "Comprar")}
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
  // Celular (mobile-v1, 12-loja.html).
  saldo: { borderRadius: 16, borderWidth: 1, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14, overflow: "hidden" },
  saldoRotulo: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  saldoLinha: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4, marginBottom: 6 },
  saldoNumero: { fontFamily: FontFamily.inikaBold, fontSize: 46, lineHeight: 52 },
  saldoMoeda: { width: 46, height: 50 },
  saldoTexto: { fontFamily: FontFamily.interMedium, fontSize: 13.5, lineHeight: 20 },
  itensTitulo: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  itensContador: { fontSize: 12, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: "hidden" },
  itemCelular: { borderRadius: 14, padding: 14 },
  itemNameCelular: { fontFamily: FontFamily.interMedium, fontSize: 16, fontWeight: "700" },
  descriptionCelular: { fontSize: 13.5, lineHeight: 20, marginTop: 4 },
  seloGratis: { alignSelf: "flex-start", marginTop: 10, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  seloGratisTexto: { fontFamily: FontFamily.interMedium, fontSize: 11.5, fontWeight: "700" },
  buyCelular: { borderRadius: 999, minHeight: 44, paddingHorizontal: 16 },
  veu: { justifyContent: "flex-end" },
  folha: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
    alignItems: "center",
    gap: 8,
  },
  alca: { width: 36, height: 4, borderRadius: 2, marginBottom: 6 },
  folhaTitulo: { fontFamily: FontFamily.inikaBold, fontSize: 22, textAlign: "center" },
  folhaTexto: { fontSize: 14.5, lineHeight: 21, textAlign: "center" },
  soma: { alignSelf: "stretch", borderRadius: 12, padding: 12, marginVertical: 6 },
  somaTexto: { fontSize: 15, fontWeight: "700", textAlign: "center" },
  folhaBotao: { alignSelf: "stretch", minHeight: 48, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  folhaBotaoTexto: { fontSize: 15, fontWeight: "700" },
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
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  filterText: { fontSize: 12, fontWeight: "700" },
  movement: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 28 },
  movementValue: { fontSize: 13, fontWeight: "700", minWidth: 36 },
  movementText: { flex: 1, fontSize: 13 },
});
