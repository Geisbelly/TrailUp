// src/components/trilhas/common/GameHeader.tsx
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { ProfileShellPalette } from "@/utils/profileShellTheme";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = {
  titulo: string;
  subtitulo: string;
  xp?: number;
  meta?: number;
  rightSlot?: React.ReactNode;
  palette?: ProfileShellPalette | null;
  progressTargetRef?: React.RefObject<View | null>;
  /**
   * Pontuação do aluno no rank de pontuação da turma.
   *
   * Fica em linha própria, abaixo da barra, e não dentro dela: são coisas
   * diferentes. A barra é taxa de conclusão (0 a 100); a pontuação é
   * acumulada, sem teto. Somar uma na outra fazia a barra bater 100% com
   * tópico ainda pendente, e acima de 90% o excedente sumia no clamp sem o
   * aluno entender por quê.
   *
   * Omitir quando a turma não tem rank de pontuação -- um "—" no lugar do
   * número não informa nada e ocupa a linha.
   */
  pontuacao?: { valor: string; detalhe: string } | null;
  pontuacaoTargetRef?: React.RefObject<View | null>;
};

export const GameHeader = ({
  titulo,
  subtitulo,
  xp = 120,
  meta = 200,
  rightSlot,
  palette = null,
  progressTargetRef,
  pontuacao = null,
  pontuacaoTargetRef,
}: Props) => {
  const divisor = meta > 0 ? meta : 1;
  const progresso = Math.min(1, Math.max(0, xp / divisor));

  return (
    <View
      style={[
        s.root,
        palette
          ? {
              backgroundColor: palette.background,
              borderColor: palette.border,
            }
          : null,
      ]}
    >
      <View style={s.titleRow}>
        <View style={s.titleBlock}>
          {subtitulo ? (
            <Text
              style={[s.sub, palette ? { color: palette.textSubtle } : null]}
            >
              {subtitulo.toUpperCase()}
            </Text>
          ) : null}
          <Text style={[s.title, palette ? { color: palette.text } : null]}>
            {titulo}
          </Text>
        </View>
        {rightSlot ? <View style={s.rightSlot}>{rightSlot}</View> : null}
      </View>
      <View ref={progressTargetRef} collapsable={false} style={s.xpRow}>
        <View
          style={[
            s.xpBarTrack,
            palette
              ? {
                  backgroundColor: palette.progressTrack,
                  borderColor: palette.border,
                }
              : null,
          ]}
        >
          <View
            style={[
              s.xpBarFill,
              { width: `${progresso * 100}%` },
              palette ? { backgroundColor: palette.accent } : null,
            ]}
          />
        </View>
        <Text style={[s.xpText, palette ? { color: palette.textMuted } : null]}>
          {Math.round(progresso * 100)}%
        </Text>
      </View>
      {pontuacao ? (
        <View
          ref={pontuacaoTargetRef}
          collapsable={false}
          style={s.pontuacaoRow}
          accessibilityRole="text"
          accessibilityLabel={`${pontuacao.valor} pontos, ${pontuacao.detalhe}`}
        >
          <Text
            style={[
              s.pontuacaoValor,
              palette ? { color: palette.accent } : null,
            ]}
          >
            {pontuacao.valor}
          </Text>
          <Text
            style={[s.pontuacaoUnidade, palette ? { color: palette.text } : null]}
          >
            pts
          </Text>
          <Text
            style={[
              s.pontuacaoDetalhe,
              // `textMuted`, nao `textSubtle`: a 12px o subtle da 6,81:1
              // sobre o fundo -- passa em AA e reprova em AAA. O muted da
              // 11,03:1. O numero ao lado e 20px em negrito, que conta como
              // texto grande, entao o accent (>= 4,5:1 garantido) basta la.
              palette ? { color: palette.textMuted } : null,
            ]}
            numberOfLines={1}
          >
            {pontuacao.detalhe}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const s = StyleSheet.create({
  root: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: Color.background,
    borderBottomWidth: 1,
    borderColor: Color.colorDarkslategray,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  titleBlock: {
    flex: 1,
  },
  rightSlot: {
    alignItems: "flex-end",
    justifyContent: "center",
    paddingTop: 6,
  },
  xpRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  xpBarTrack: {
    flex: 1,
    height: 12,
    borderRadius: 12,
    backgroundColor: Color.colorAliceblue200,
    marginRight: 12,
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
  },
  xpBarFill: {
    height: "100%",
    backgroundColor: Color.colorSlategray,
    borderRadius: 12,
  },
  xpText: {
    color: Color.colorAliceblue300,
    fontSize: 14,
    fontFamily: FontFamily.interMedium,
  },
  pontuacaoRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginTop: 8,
  },
  pontuacaoValor: {
    color: Color.colorAliceblue,
    fontSize: 20,
    fontFamily: FontFamily.poppinsExtraBold,
  },
  pontuacaoUnidade: {
    color: Color.colorAliceblue,
    fontSize: 13,
    fontFamily: FontFamily.interMedium,
  },
  pontuacaoDetalhe: {
    // `flex: 1` para o detalhe ceder espaço ao numero, e nao o contrario: em
    // tela estreita quem pode truncar e a frase de apoio.
    flex: 1,
    color: Color.colorAliceblue300,
    fontSize: 12,
    fontFamily: FontFamily.interMedium,
  },
  sub: {
    color: Color.colorSlategray,
    letterSpacing: 2,
    fontSize: 12,
    marginTop: 6,
    fontFamily: FontFamily.interMedium,
  },
  title: {
    color: Color.colorAliceblue,
    fontSize: 24,
    marginTop: 2,
    fontFamily: FontFamily.poppinsExtraBold,
  },
});
