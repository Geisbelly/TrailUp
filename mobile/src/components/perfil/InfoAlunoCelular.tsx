import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatarJornadaDesde } from "@/components/web/IdentidadePerfilDesktop";
import { supabase } from "@/database/supabase";
import { carregarGuildas } from "@/services/social/guildService";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

/**
 * Cartão de informações do Perfil no celular (mobile-v1, `08-perfil-hub.html`,
 * `.info`): Turma, Guilda, E-mail e "Na jornada desde", com o link para editar.
 * A guilda vem da turma atual; a data é a criação da conta na sessão (a tabela do
 * aluno não guarda data). Linha sem dado não aparece.
 */
export function InfoAlunoCelular({
  turma,
  professor,
  email,
  classeId,
  palette,
}: {
  turma?: string | null;
  professor?: string | null;
  email?: string | null;
  classeId?: number | null;
  palette: ProfileShellPalette;
}) {
  const [guilda, setGuilda] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    setGuilda(null);
    if (!classeId) return;
    carregarGuildas(classeId)
      .then((lista) => {
        if (ativo) setGuilda(lista.find((g) => g.souMembro)?.nome ?? null);
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [classeId]);

  const [criadoEm, setCriadoEm] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (ativo) setCriadoEm(data.session?.user?.created_at ?? null);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const linhas: [string, string | null | undefined][] = [
    ["Turma", turma ? (professor ? `${turma} · Prof. ${professor}` : turma) : null],
    ["Guilda", guilda],
    ["E-mail", email],
    ["Na jornada desde", formatarJornadaDesde(criadoEm)],
  ];
  const visiveis = linhas.filter(([, valor]) => Boolean(valor));
  return (
    <View style={[s.cartao, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      {visiveis.map(([rotulo, valor], i) => (
        <View key={rotulo} style={[s.linha, i > 0 && { borderTopWidth: 1, borderTopColor: palette.border }]}>
          <Text style={[s.rotulo, { color: palette.textSubtle }]}>{rotulo}</Text>
          <Text numberOfLines={1} style={[s.valor, { color: palette.text }]}>
            {valor}
          </Text>
        </View>
      ))}
      <Pressable accessibilityRole="link" onPress={() => router.push("/(tabs)/perfil/info")} style={s.editar}>
        <Text style={[s.editarTexto, { color: palette.accent }]}>Editar informações</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  cartao: { alignSelf: "stretch", marginTop: 20, marginHorizontal: 14, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
  linha: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rotulo: { fontFamily: FontFamily.interMedium, fontSize: 14 },
  valor: { flex: 1, textAlign: "right", fontFamily: FontFamily.interMedium, fontSize: 14 },
  editar: { minHeight: 44, justifyContent: "center" },
  editarTexto: { fontFamily: FontFamily.interMedium, fontSize: 14, fontWeight: "700" },
});
