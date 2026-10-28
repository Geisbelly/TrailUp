import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useId } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import tinycolor from "tinycolor2";

import { HexagonoTopico } from "@/components/web/HexagonoTopico";
import type { TopicoMapa } from "@/components/web/MapaPaisesDesktop";
import { guardianFaceImages } from "@/constants/profileImages";
import { normalizeBrainHexProfile } from "@/constants/brainHexProfiles";
import { useTrailAutoFocus } from "@/hooks/useTrailAutoFocus";
import { FontFamily } from "@/styles/GlobalStyle";
import type { EstadoTopico } from "@/utils/painelTopicoTrilha";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import { shadowStyle } from "@/utils/webShadow";
import { RostoGuardiao } from "./MarcadoresTopico";

/** Verde de "concluído" fixo (não vem do accent), como o `--success` do protótipo e a folha da Trilha. */
const SUCESSO = "#62db9b";
const ALTURA_LINHA = 72;
const ESPACO = 10;

const LINHA: Record<EstadoTopico, { icone: keyof typeof MaterialCommunityIcons.glyphMap; texto: string }> = {
  done: { icone: "check", texto: "Concluído" },
  current: { icone: "clock-outline", texto: "Você parou aqui · Continuar" },
  open: { icone: "play", texto: "Disponível" },
  locked: { icone: "lock-outline", texto: "Toque para saber como desbloquear" },
};

/**
 * Lista da Trilha no celular (mobile-v1, `03-trilha.html`, `lista()`): perfis
 * Socializer e Achiever. Uma linha de 72px por tópico, com o hexágono, o título
 * e o estado em cor; o tópico atual ganha borda e brilho no accent e o rosto do
 * guardião. Abre rolada até o tópico atual.
 */
export function ListaCelular({
  topicos,
  selecionado,
  perfil,
  palette,
  onSelecionar,
  tourTargetRef,
}: {
  topicos: TopicoMapa[];
  selecionado: string | null;
  perfil: string | null | undefined;
  palette: ProfileShellPalette;
  onSelecionar: (id: string) => void;
  tourTargetRef?: React.RefObject<View | null>;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const rosto = guardianFaceImages[normalizeBrainHexProfile(perfil) ?? "mastermind"];
  const iAtual = topicos.findIndex((t) => t.estado === "current");
  const foco = useTrailAutoFocus(iAtual >= 0 ? topicos[iAtual].id : null, iAtual >= 0 ? 6 + iAtual * (ALTURA_LINHA + ESPACO) + ALTURA_LINHA / 2 : null);
  const fundoLinha = tinycolor(palette.surface).setAlpha(0.88).toRgbString();
  const cor: Record<EstadoTopico, string> = { done: SUCESSO, current: palette.accent, open: palette.textMuted, locked: palette.textSubtle };

  return (
    <ScrollView {...foco} showsVerticalScrollIndicator={false} contentContainerStyle={s.lista}>
      {topicos.map((t, i) => {
        const atual = t.estado === "current";
        const sel = selecionado === t.id;
        const estado = LINHA[t.estado];
        return (
          <Pressable
            key={t.id}
            ref={i === 0 ? tourTargetRef : undefined}
            collapsable={false}
            accessibilityRole="button"
            accessibilityLabel={`${i + 1}. ${t.nome}: ${estado.texto}`}
            accessibilityState={{ selected: sel }}
            onPress={() => onSelecionar(t.id)}
            style={[
              s.linha,
              { backgroundColor: fundoLinha, borderColor: palette.border },
              atual
                ? [{ borderColor: palette.accent }, shadowStyle({ color: palette.accent, offset: { width: 0, height: 0 }, opacity: 0.35, radius: 11 }, Platform.OS === "web")]
                : null,
              // No protótipo, `outline: 2px solid var(--text)` por dentro da linha.
              sel ? { borderColor: palette.text, borderWidth: 2 } : null,
            ]}
          >
            <HexagonoTopico estado={t.estado} numero={i + 1} tamanho={48} palette={palette} idBase={`hexlis-${uid}-${t.id}`} />
            <View style={s.texto}>
              <Text numberOfLines={2} style={[s.titulo, { color: palette.text }]}>
                {t.nome}
              </Text>
              <View style={s.estado}>
                <MaterialCommunityIcons name={estado.icone} size={13} color={cor[t.estado]} />
                <Text style={[s.estadoTexto, { color: cor[t.estado] }]}>{estado.texto}</Text>
              </View>
            </View>
            {atual ? <RostoGuardiao rosto={rosto} tamanho={30} borda={palette.accent} /> : null}
            <MaterialCommunityIcons name="chevron-right" size={18} color={palette.textSubtle} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  lista: { gap: ESPACO, paddingTop: 6, paddingHorizontal: 14, paddingBottom: 16 },
  linha: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: ALTURA_LINHA,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  texto: { flex: 1, minWidth: 0, gap: 4 },
  titulo: { fontFamily: FontFamily.interMedium, fontSize: 14.5, fontWeight: "700" },
  estado: { flexDirection: "row", alignItems: "center", gap: 5 },
  estadoTexto: { fontFamily: FontFamily.interMedium, fontSize: 12.5 },
});
