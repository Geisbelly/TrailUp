import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { getLockedNodeMessage } from "@/utils/lockedNodeMessage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  visible: boolean;
  nodeTitle: string;
  prerequisiteTitles?: string[];
  profile?: string | null;
  onClose: () => void;
};

export function LockedNodeModal({
  visible,
  nodeTitle,
  prerequisiteTitles = [],
  profile,
  onClose,
}: Props) {
  const palette = getProfileShellPalette(profile);
  const message = getLockedNodeMessage(nodeTitle, prerequisiteTitles);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          accessibilityViewIsModal
          style={[styles.card, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}
        >
          <View style={[styles.icon, { backgroundColor: palette.accentSoft, borderColor: palette.accent }]}>
            <MaterialCommunityIcons name="lock-outline" size={28} color={palette.accent} />
          </View>
          <Text style={[styles.eyebrow, { color: palette.accent }]}>CONTEÚDO SELADO</Text>
          <Text style={[styles.title, { color: palette.text }]}>{message.title}</Text>
          <Text style={[styles.body, { color: palette.textSubtle }]}>{message.body}</Text>
          <View style={[styles.requirement, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <MaterialCommunityIcons name="key-outline" size={18} color={palette.accent} />
            <Text style={[styles.requirementText, { color: palette.text }]}>{message.requirement}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar explicação do conteúdo bloqueado"
            onPress={onClose}
            style={[styles.button, { backgroundColor: palette.accent }]}
          >
            <Text style={styles.buttonText}>ENTENDI</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(3, 5, 12, 0.78)" },
  card: { width: "100%", maxWidth: 390, borderRadius: 22, borderWidth: 1, padding: 24, alignItems: "center", gap: 10 },
  icon: { width: 64, height: 64, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 3 },
  eyebrow: { fontFamily: FontFamily.inikaBold, fontSize: 10, letterSpacing: 1.8 },
  title: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 20, textAlign: "center" },
  body: { fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 21, textAlign: "center" },
  requirement: { width: "100%", flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 13, marginTop: 4 },
  requirementText: { flex: 1, fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 19 },
  button: { minWidth: 130, alignItems: "center", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12, marginTop: 5 },
  buttonText: { color: "#fff", fontFamily: FontFamily.poppinsExtraBold, fontSize: 12, letterSpacing: 1 },
});
