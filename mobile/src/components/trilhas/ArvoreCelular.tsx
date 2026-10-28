import React, { useId, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";

import { HexagonoTopico } from "@/components/web/HexagonoTopico";
import type { TopicoMapa } from "@/components/web/MapaPaisesDesktop";
import { guardianFaceImages } from "@/constants/profileImages";
import { normalizeBrainHexProfile } from "@/constants/brainHexProfiles";
import { useTrailAutoFocus } from "@/hooks/useTrailAutoFocus";
import { FontFamily } from "@/styles/GlobalStyle";
import { caminhoLigacao, layoutArvoreCelular } from "@/utils/arvoreCelular";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import { textShadowStyle } from "@/utils/webShadow";
import { BalaoVoceParouAqui, ChipEstadoTopico, textoDoEstado } from "./MarcadoresTopico";

const IS_WEB = Platform.OS === "web";
const SOMBRA_NOME = { offset: { width: 0, height: 1 }, radius: 8 };
const TAMANHO_HEX = 48;
/** Altura da caixa do nó: o hexágono fica centrado nela, no ponto do layout. */
const ALTURA_NO = 64;

/**
 * Árvore da Trilha no celular (mobile-v1, `03-trilha.html`, `arvore()`): perfis
 * Survivor e Mastermind. Cada nível do grafo é uma fileira; o hexágono fica à
 * esquerda e o nome ao lado; as ligações são acesas onde o caminho já foi feito
 * e pontilhadas adiante. Rola só na vertical e abre no tópico atual.
 */
export function ArvoreCelular({
  topicos,
  niveis,
  arestas,
  selecionado,
  perfil,
  palette,
  onSelecionar,
  tourTargetRef,
}: {
  topicos: TopicoMapa[];
  niveis: string[][];
  arestas: { from: string | number; to: string | number }[];
  selecionado: string | null;
  perfil: string | null | undefined;
  palette: ProfileShellPalette;
  onSelecionar: (id: string) => void;
  tourTargetRef?: React.RefObject<View | null>;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const janela = useWindowDimensions();
  const [largura, setLargura] = useState(janela.width);
  const L = useMemo(() => layoutArvoreCelular(niveis, largura), [niveis, largura]);
  const porId = useMemo(() => new Map(topicos.map((t) => [t.id, t] as const)), [topicos]);
  const rosto = guardianFaceImages[normalizeBrainHexProfile(perfil) ?? "mastermind"];
  const atual = topicos.find((t) => t.estado === "current");
  const foco = useTrailAutoFocus(atual?.id ?? null, atual ? (L.pos[atual.id]?.y ?? null) : null);

  return (
    <ScrollView
      {...foco}
      showsVerticalScrollIndicator={false}
      style={s.rolagem}
      // Folga para o balão "Você parou aqui" quando o tópico atual é o primeiro.
      contentContainerStyle={s.conteudo}
      onLayout={(e) => {
        foco.onLayout(e);
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== largura) setLargura(w);
      }}
    >
      <View style={{ width: largura, height: L.altura }}>
        <Svg width={largura} height={L.altura} style={StyleSheet.absoluteFill} pointerEvents="none">
          {arestas.map((a, i) => {
            const de = L.pos[String(a.from)];
            const para = L.pos[String(a.to)];
            if (!de || !para) return null;
            // Acesa quando o tópico de origem foi feito e o de destino já abriu.
            const feito = porId.get(String(a.from))?.estado === "done" && porId.get(String(a.to))?.estado !== "locked";
            return (
              <Path
                key={`${a.from}-${a.to}-${i}`}
                d={caminhoLigacao(de, para)}
                fill="none"
                stroke={feito ? palette.accent : palette.borderStrong}
                strokeOpacity={feito ? 1 : 0.5}
                strokeWidth={feito ? 3 : 2}
                strokeDasharray={feito ? undefined : "2 7"}
                strokeLinecap="round"
              />
            );
          })}
        </Svg>

        {topicos.map((t, i) => {
          const p = L.pos[t.id];
          if (!p) return null;
          const sel = selecionado === t.id;
          const rotulo = `${i + 1}. ${t.nome}: ${t.estado === "current" ? `você parou aqui, ${t.percentual}%` : textoDoEstado(t)}`;
          return (
            <Pressable
              key={t.id}
              ref={i === 0 ? tourTargetRef : undefined}
              collapsable={false}
              accessibilityRole="button"
              accessibilityLabel={rotulo}
              accessibilityState={{ selected: sel }}
              accessibilityHint={t.estado === "locked" ? "Toque para saber como desbloquear" : undefined}
              onPress={() => onSelecionar(t.id)}
              style={[s.no, { left: p.x - TAMANHO_HEX / 2, top: p.y - ALTURA_NO / 2 }]}
            >
              <HexagonoTopico estado={t.estado} numero={i + 1} tamanho={TAMANHO_HEX} palette={palette} idBase={`hexarv-${uid}-${t.id}`} selecionado={sel} />
              {/* A largura do layout limita só o nome; o chip fica numa linha e pode passar dela. */}
              <View style={s.rotulo}>
                <Text
                  numberOfLines={2}
                  style={[
                    s.nome,
                    { width: p.larguraRotulo },
                    { color: t.estado === "locked" ? palette.textMuted : palette.text, ...textShadowStyle({ ...SOMBRA_NOME, color: palette.background }, IS_WEB) },
                  ]}
                >
                  {t.nome}
                </Text>
                {/* Na dupla de tópicos o rótulo tem 110px: o chip inteiro invadia o hexágono vizinho. */}
                <ChipEstadoTopico topico={t} palette={palette} compacto={p.larguraRotulo < 200} />
              </View>
              {t.estado === "current" ? <BalaoVoceParouAqui rosto={rosto} palette={palette} seta="esquerda" style={s.aqui} /> : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  rolagem: { flex: 1 },
  conteudo: { paddingTop: 16 },
  no: { position: "absolute", height: ALTURA_NO, flexDirection: "row", alignItems: "center", gap: 10 },
  rotulo: { alignItems: "flex-start", gap: 5 },
  nome: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 16,
    ...textShadowStyle(SOMBRA_NOME, IS_WEB),
  },
  // No protótipo o balão fica 6px acima do hexágono, com o bico perto da esquerda.
  aqui: { left: -4, top: -28 },
});
