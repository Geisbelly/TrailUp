import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet } from "react-native";

type Props = { color: string; onPress: () => void; icon?: string };

export function StoreLauncher({ color, onPress, icon = "storefront" }: Props) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Abrir loja" onPress={onPress} style={({ pressed }) => [s.button, { backgroundColor: color, opacity: pressed ? 0.72 : 1 }]}>
      <MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={20} color="#fff" />
    </Pressable>
  );
}
const s = StyleSheet.create({ button: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" } });

