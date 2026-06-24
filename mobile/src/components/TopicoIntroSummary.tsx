import { Color, FontFamily } from "@/styles/GlobalStyle";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

type Props = {
  topico: any;
  totalBlocos: number;
  modo: string;
  theme?: {
    accentColor?: string;
    softColor?: string;
    borderColor?: string;
    surfaceColor?: string;
    mutedTextColor?: string;
  };
};

function gerarResumoInteligente(topico: any, totalBlocos: number, modo: string): string {
  const nome = topico?.nome || "este módulo";
  const conteudos = Array.isArray(topico?.conteudos) ? topico.conteudos : [];
  const atividades = Array.isArray(topico?.atividades) ? topico.atividades : [];

  const temVideo = conteudos.some((c: any) =>
    c?.midias?.some((m: any) => String(m?.tipo ?? "").toLowerCase().includes("video"))
  );
  const temPdf = conteudos.some((c: any) =>
    c?.midias?.some((m: any) => String(m?.tipo ?? "").toLowerCase().includes("pdf"))
  );
  const temTexto = conteudos.some((c: any) => Boolean(c?.conteudo));
  const temImagem = conteudos.some((c: any) =>
    c?.midias?.some((m: any) => String(m?.tipo ?? "").toLowerCase().includes("imagem"))
  );

  const questoes = atividades.filter((a: any) =>
    [
      "questao",
      "quiz",
      "true_false",
      "true or false",
      "true_or_false",
      "truefalse",
      "verdadeiro_falso",
      "verdadeiro ou falso",
      "verdadeiro/falso",
      "booleano",
      "fill_blank",
      "fili_blank",
      "fill in the blank",
      "fill-in-the-blank",
      "fillblank",
      "completar_lacuna",
      "completar lacuna",
      "lacuna",
    ].includes(String(a?.tipo ?? "").toLowerCase())
  ).length;

  const tiposConteudo: string[] = [];
  if (temVideo) tiposConteudo.push("videos");
  if (temTexto) tiposConteudo.push("textos");
  if (temPdf) tiposConteudo.push("guias em PDF");
  if (temImagem) tiposConteudo.push("apoios visuais");

  const ordemInfo: Record<string, string> = {
    atividade_primeiro: "A trilha começa por desafios e depois aprofunda o conteúdo.",
    conteudo_primeiro: "A ordem prioriza estudo e depois prática.",
    atividade_fim: "Você percorre o conteúdo antes da rodada final de atividades.",
    misto: "Conteúdo e atividades aparecem de forma alternada.",
  };

  const partes = [`"${nome}" organiza seu estudo em ${totalBlocos} ${totalBlocos === 1 ? "etapa" : "etapas"} guiadas.`];

  if (tiposConteudo.length > 0) {
    partes.push(`Você vai passar por ${tiposConteudo.join(", ")}.`);
  }

  if (questoes > 0) {
    partes.push(
      `${questoes === 1 ? "Há 1 desafio" : `Há ${questoes} desafios`} para consolidar o conteúdo.`
    );
  }

  if (ordemInfo[modo]) {
    partes.push(ordemInfo[modo]);
  }

  return partes.slice(0, 3).join(" ");
}

export function TopicoIntroSummary({ topico, totalBlocos, modo, theme }: Props) {
  const [resumo, setResumo] = useState("");
  const [carregando, setCarregando] = useState(true);
  const accentColor = theme?.accentColor ?? Color.colorBlueviolet100;
  const softColor = theme?.softColor ?? "#1a2540";
  const borderColor = theme?.borderColor ?? `${Color.colorBlueviolet100}33`;
  const surfaceColor = theme?.surfaceColor ?? softColor;
  const mutedTextColor = theme?.mutedTextColor ?? Color.colorAliceblue300;

  useEffect(() => {
    const timer = setTimeout(() => {
      setResumo(gerarResumoInteligente(topico, totalBlocos, modo));
      setCarregando(false);
    }, 450);

    return () => clearTimeout(timer);
  }, [modo, topico, totalBlocos]);

  if (carregando) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={accentColor} />
          <Text style={styles.loadingText}>Preparando seu módulo...</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: surfaceColor,
          borderColor,
          shadowColor: accentColor,
        },
      ]}
    >
      <View style={styles.header}>
        <Ionicons name="book-outline" size={30} color={accentColor} />
        <Text style={[styles.title, { color: accentColor }]}>Visão Geral do Módulo</Text>
      </View>

      <Text style={[styles.resumo, { color: mutedTextColor }]}>{resumo}</Text>

      <View style={[styles.statsRow, { borderColor }]}>
        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: accentColor }]}>{topico?.conteudos?.length || 0}</Text>
          <Text style={[styles.statLabel, { color: mutedTextColor }]}>Conteúdos</Text>
        </View>

        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: accentColor }]}>{topico?.atividades?.length || 0}</Text>
          <Text style={[styles.statLabel, { color: mutedTextColor }]}>Atividades</Text>
        </View>

        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: accentColor }]}>{totalBlocos}</Text>
          <Text style={[styles.statLabel, { color: mutedTextColor }]}>Etapas</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Ionicons name="checkmark-circle" size={18} color={mutedTextColor} />
        <Text style={[styles.footerText, { color: mutedTextColor }]}>Use o guia no topo para entender timers, retomada e progresso.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 20,
    borderRadius: 16,
    backgroundColor: "#1a2540",
    borderWidth: 1,
    borderColor: `${Color.colorBlueviolet100}33`,
    shadowColor: Color.colorBlueviolet100,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  loadingBox: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 16,
  },
  loadingText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    color: Color.colorAliceblue300,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  title: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 20,
    color: Color.colorAliceblue,
    flex: 1,
  },
  resumo: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    lineHeight: 22,
    color: Color.colorAliceblue300,
    marginBottom: 18,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 12,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Color.colorDarkslategray100,
  },
  statBox: {
    alignItems: "center",
    gap: 4,
  },
  statNumber: {
    fontFamily: FontFamily.poppinsExtraBold,
    fontSize: 24,
    color: Color.colorBlueviolet100,
  },
  statLabel: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    color: Color.colorSlategray,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingTop: 6,
  },
  footerText: {
    flex: 1,
    textAlign: "center",
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    color: Color.colorAliceblue300,
  },
});
