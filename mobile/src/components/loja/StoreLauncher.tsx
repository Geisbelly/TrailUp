import { StoreMarkIcon } from "@/components/loja/StoreItemIcon";
import React from "react";
import { Pressable, StyleSheet } from "react-native";

type Props = { color: string; onPress: () => void };

export function StoreLauncher({ color, onPress }: Props) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Abrir loja" onPress={onPress} style={({ pressed }) => [s.button, { borderColor: color, opacity: pressed ? 0.72 : 1 }]}>
      <StoreMarkIcon color={color} size={23} />
    </Pressable>
  );
}
const s = StyleSheet.create({ button: { width: 44, height: 44, borderRadius: 6, borderWidth: 1, alignItems: "center", justifyContent: "center" } });
