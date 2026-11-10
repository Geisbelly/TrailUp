/**
 * A barra acima do campo dos editores de código e expressão (spec B, PR 5), e o estado de cursor
 * que ela precisa para inserir onde o aluno está.
 *
 * O cursor só é imposto ao `TextInput` logo depois de uma tecla da barra e é largado no próximo
 * `onSelectionChange`: deixar `selection` sempre controlado faz o Android pular o cursor para o
 * fim a cada letra digitada.
 */

import React, { useCallback, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, type NativeSyntheticEvent, type TextInputSelectionChangeEventData } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellPalette";
import { inserirNoCursor, type Selecao, type Tecla } from "@/utils/textoRico/editorDeResposta";

export type PaletaDoEditor = Pick<
  ProfileShellPalette,
  "accent" | "accentMuted" | "background" | "border" | "surface" | "text" | "textSubtle"
>;

export function useInsercaoNoCursor(valor: string, onChange: (texto: string) => void) {
  const ultima = useRef<Selecao>({ start: valor.length, end: valor.length });
  const [imposta, setImposta] = useState<Selecao | undefined>(undefined);

  const onSelectionChange = useCallback((e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    ultima.current = e.nativeEvent.selection;
    setImposta(undefined);
  }, []);

  const inserir = useCallback(
    (antes: string, depois = "") => {
      const r = inserirNoCursor(valor, ultima.current, antes, depois);
      ultima.current = r.selecao;
      onChange(r.texto);
      setImposta(r.selecao);
    },
    [onChange, valor],
  );

  return { selection: imposta, onSelectionChange, inserir };
}

type Props = {
  teclas: (Tecla & { chave?: string })[];
  paleta: PaletaDoEditor;
  desabilitada?: boolean;
  onTecla: (tecla: Tecla) => void;
};

export function BarraDeTeclas({ teclas, paleta, desabilitada = false, onTecla }: Props) {
  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
    >
      {teclas.map((tecla) => (
        <TouchableOpacity
          key={tecla.chave ?? tecla.rotulo}
          disabled={desabilitada}
          onPress={() => onTecla(tecla)}
          accessibilityRole="button"
          accessibilityLabel={`Inserir ${tecla.leitura}`}
          style={{
            minWidth: 44,
            minHeight: 44,
            paddingHorizontal: 12,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: paleta.accentMuted,
            borderWidth: 1,
            borderColor: paleta.border,
            opacity: desabilitada ? 0.5 : 1,
          }}
        >
          <Text style={{ color: paleta.text, fontFamily: FontFamily.interMedium, fontSize: 16 }}>{tecla.rotulo}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
