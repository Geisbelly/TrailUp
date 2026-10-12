import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ProfileArtwork } from "@/components/ProfileArtwork";
import { InfoAlunoDesktop } from "@/components/web/InfoAlunoDesktop";
import { profileEmblems } from "@/constants/designAssets";
import { getBrainHexConfig } from "@/constants/profileImages";
import { supabase } from "@/database/supabase";
import { carregarGuildas } from "@/services/social/guildService";
import { FontFamily } from "@/styles/GlobalStyle";
import type { BrainHexProfile } from "@/constants/brainHexProfiles";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

/** "março de 2026", a partir da data de cadastro. */
export function formatarJornadaDesde(criadoEm: string | null | undefined): string | null {
  if (!criadoEm) return null;
  const data = new Date(criadoEm);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/**
 * Coluna de identidade do Perfil na web em tela larga (#346, protótipo v4,
 * 08-perfil-hub.html): nome, @, bio, informações (turma, guilda, e-mail, desde
 * quando está na jornada) e o chip do perfil dominante. O retrato fica sobre o
 * banner, desenhado pela tela.
 */
export function IdentidadePerfilDesktop({
  nome,
  apelido,
  descricao,
  perfilDominante,
  afinidadeDominante,
  turma,
  professor,
  email,
  classeId,
  palette,
}: {
  nome: string;
  apelido: string;
  descricao: string | null | undefined;
  perfilDominante: BrainHexProfile;
  afinidadeDominante: number | null;
  turma: string | null | undefined;
  professor: string | null | undefined;
  email: string | null | undefined;
  classeId: number | null | undefined;
  palette: ProfileShellPalette;
}) {
  // A guilda do aluno na turma atual, se ele estiver em uma.
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

  // "Na jornada desde": a criação da conta, que vem na sessão do Supabase (a tabela do aluno não guarda data).
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

  const dominante = getBrainHexConfig(perfilDominante);
  return (
    <View style={s.bloco}>
      <Text style={[s.nome, { color: palette.text }]}>{nome}</Text>
      <Text style={[s.apelido, { color: palette.accent }]}>{apelido}</Text>
      {descricao ? <Text style={[s.sobre, { color: palette.textMuted }]}>{descricao}</Text> : null}
      <InfoAlunoDesktop
        turma={turma}
        professor={professor}
        guilda={guilda}
        email={email}
        desde={formatarJornadaDesde(criadoEm)}
        palette={palette}
      />
      <View
        accessibilityLabel={`Perfil dominante: ${dominante.label}${afinidadeDominante !== null ? `, ${Math.round(afinidadeDominante)}% de afinidade` : ""}`}
        style={[s.chip, { backgroundColor: palette.surface, borderColor: palette.borderStrong }]}
      >
        <ProfileArtwork source={profileEmblems[perfilDominante]} profile={perfilDominante} width={30} height={30} />
        <View>
          <Text style={[s.chipNome, { color: palette.text }]}>{dominante.label}</Text>
          <Text style={[s.chipRotulo, { color: palette.accent }]}>PERFIL DOMINANTE</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bloco: { paddingTop: 68 },
  nome: { fontFamily: FontFamily.inikaBold, fontSize: 26 },
  apelido: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700", letterSpacing: 0.8, marginTop: 2, marginBottom: 10 },
  sobre: { fontFamily: FontFamily.interMedium, fontSize: 13.5, lineHeight: 21, marginBottom: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 100,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 16,
    marginTop: 14,
  },
  chipNome: { fontFamily: FontFamily.interMedium, fontSize: 13.5, fontWeight: "700" },
  chipRotulo: { fontFamily: FontFamily.interMedium, fontSize: 10, fontWeight: "700", letterSpacing: 0.6 },
});
