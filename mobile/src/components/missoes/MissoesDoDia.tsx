import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { FontFamily } from "@/styles/GlobalStyle";
import { carregarMissoesDoDia, type MissaoDoDia } from "@/services/missoes/missoesDoDia";

type Props = {
  classeId: number;
  perfil?: string | null;
  accent: string;
  textColor: string;
  mutedColor: string;
  surfaceColor: string;
  borderColor: string;
};

export function MissoesDoDia({ classeId, perfil, accent, textColor, mutedColor, surfaceColor, borderColor }: Props) {
  const [missoes, setMissoes] = useState<MissaoDoDia[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!classeId) return;
    setLoading(true);
    setErro(null);
    try {
      setMissoes(await carregarMissoesDoDia(classeId, perfil));
    } catch (e) {
      setErro("Não foi possível carregar as missões do dia.");
      console.warn("[MissoesDoDia]", e);
    } finally {
      setLoading(false);
    }
  }, [classeId, perfil]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!classeId) return null;

  return (
    <View style={[s.card, { backgroundColor: surfaceColor, borderColor }]} accessibilityLabel="Missões do dia">
      <View style={s.header}>
        <MaterialCommunityIcons name="flag-checkered" size={20} color={accent} />
        <Text style={[s.title, { color: textColor }]}>Missões do dia</Text>
        <Pressable accessibilityLabel="Atualizar missões do dia" onPress={() => void load()} hitSlop={8}>
          <MaterialCommunityIcons name="refresh" size={18} color={mutedColor} />
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color={accent} style={{ marginVertical: 16 }} /> : null}

      {!loading && erro ? (
        <Text style={[s.erro, { color: mutedColor }]}>{erro}</Text>
      ) : null}

      {!loading && !erro && missoes.length === 0 ? (
        <Text style={[s.vazio, { color: mutedColor }]}>
          Ainda não há missão para hoje. Elas aparecem depois da meia-noite.
        </Text>
      ) : null}

      {!loading &&
        missoes.map((m) => {
          const done = m.status === "concluida";
          return (
            <View key={m.id} style={[s.item, { borderColor }]}>
              <View style={s.itemTop}>
                <Text style={[s.itemTitle, { color: textColor }]} numberOfLines={2}>
                  {m.titulo}
                </Text>
                <MaterialCommunityIcons
                  name={done ? "check-circle" : "circle-outline"}
                  size={20}
                  color={done ? accent : mutedColor}
                />
              </View>
              {m.descricao ? (
                <Text style={[s.itemDesc, { color: mutedColor }]} numberOfLines={3}>
                  {m.descricao}
                </Text>
              ) : null}
              <Text style={[s.meta, { color: mutedColor }]}>
                {m.criterioRotulo}
                {done ? " · cumprida" : m.progresso > 0 ? ` · ${m.progresso}%` : ""}
              </Text>
            </View>
          );
        })}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, fontFamily: FontFamily.poppinsExtraBold, fontSize: 15 },
  erro: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  vazio: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 18 },
  item: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
  itemTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  itemTitle: { flex: 1, fontFamily: FontFamily.poppinsExtraBold, fontSize: 13 },
  itemDesc: { fontFamily: FontFamily.interMedium, fontSize: 12, lineHeight: 17 },
  meta: { fontFamily: FontFamily.interMedium, fontSize: 11, marginTop: 2 },
});
