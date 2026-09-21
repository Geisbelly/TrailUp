import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FontFamily } from "@/styles/GlobalStyle";

import { validateBagDraft, type BagDraft, type BagDraftType, type BagItem } from "@/services/bag/bagModel";

type Props = {
  visible: boolean;
  initialItem?: BagItem | null;
  context?: Pick<BagDraft, "classId" | "topicId" | "contentId">;
  accent: string;
  surface: string;
  muted: string;
  onClose: () => void;
  onSave: (draft: BagDraft, item?: BagItem | null) => Promise<void>;
};

export function BagEditorModal({ visible, initialItem, context, accent, surface, muted, onClose, onSave }: Props) {
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<BagDraftType>(initialItem?.type === "loja" ? "anotacao" : initialItem?.type ?? "anotacao");
  const [title, setTitle] = useState(initialItem?.title ?? "");
  const [content, setContent] = useState(initialItem?.content ?? "");
  const [front, setFront] = useState(initialItem?.front ?? "");
  const [back, setBack] = useState(initialItem?.back ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setType(initialItem?.type === "loja" ? "anotacao" : initialItem?.type ?? "anotacao");
    setTitle(initialItem?.title ?? "");
    setContent(initialItem?.content ?? "");
    setFront(initialItem?.front ?? "");
    setBack(initialItem?.back ?? "");
    setError(null);
  }, [initialItem, visible]);

  const save = async () => {
    const draft: BagDraft = { type, title, content, front, back, ...context };
    const validation = validateBagDraft(draft);
    if (validation) { setError(validation); return; }
    setSaving(true); setError(null);
    try { await onSave(draft, initialItem); onClose(); } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar o item."); } finally { setSaving(false); }
  };

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}><View style={[styles.modal, { backgroundColor: surface, paddingBottom: Math.max(insets.bottom, 20) }]}>
      <View style={styles.header}><View><Text style={[styles.kicker, { color: accent }]}>BAG</Text><Text style={styles.title}>{initialItem ? "Editar item" : "Novo item"}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Fechar editor da Bag" onPress={onClose} style={styles.close}><MaterialCommunityIcons name="close" size={25} color={accent} /></Pressable></View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: muted }]}>TIPO</Text><View style={styles.types}>{(["anotacao", "resumo", "card"] as BagDraftType[]).map((option) => <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: type === option }} onPress={() => setType(option)} style={[styles.typeButton, { borderColor: type === option ? accent : muted }]}><Text style={{ color: type === option ? accent : "#fff" }}>{option === "anotacao" ? "Anotação" : option === "resumo" ? "Resumo" : "Card"}</Text></Pressable>)}</View>
        <Text style={[styles.label, { color: muted }]}>TÍTULO</Text><TextInput value={title} onChangeText={setTitle} placeholder="Dê um nome para este item" placeholderTextColor={muted} style={styles.input} maxLength={160} />
        {type === "card" ? <><Text style={[styles.label, { color: muted }]}>FRENTE</Text><TextInput value={front} onChangeText={setFront} placeholder="Pergunta ou conceito" placeholderTextColor={muted} style={[styles.input, styles.multiline]} multiline /><Text style={[styles.label, { color: muted }]}>VERSO</Text><TextInput value={back} onChangeText={setBack} placeholder="Resposta ou explicação" placeholderTextColor={muted} style={[styles.input, styles.multiline]} multiline /></> : <><Text style={[styles.label, { color: muted }]}>CONTEÚDO</Text><TextInput value={content} onChangeText={setContent} placeholder={type === "resumo" ? "Escreva o resumo" : "Escreva sua anotação"} placeholderTextColor={muted} style={[styles.input, styles.large]} multiline /></>}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={styles.footer}><Pressable onPress={onClose} style={[styles.cancel, { borderColor: muted }]}><Text style={styles.cancelText}>Cancelar</Text></Pressable><Pressable disabled={saving} onPress={() => void save()} style={[styles.save, { backgroundColor: accent }]}>{saving ? <ActivityIndicator color="#15151b" /> : <Text style={styles.saveText}>Salvar</Text>}</Pressable></View>
    </View></KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.72)" },
  modal: { maxHeight: "92%", borderTopLeftRadius: 6, borderTopRightRadius: 6, padding: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 16 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 11, fontWeight: "800", letterSpacing: 0 },
  title: { color: "#fff", fontFamily: FontFamily.inikaBold, fontSize: 24 },
  content: { gap: 9, paddingBottom: 18 },
  label: { fontSize: 10, fontWeight: "800", letterSpacing: 0, marginTop: 8 },
  types: { flexDirection: "row", gap: 8, marginBottom: 3 },
  typeButton: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 12 },
  input: { color: "#fff", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 6, paddingHorizontal: 13, paddingVertical: 12, fontSize: 15 },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  large: { minHeight: 150, textAlignVertical: "top" },
  error: { color: "#ff9c9c", fontSize: 13, marginTop: 4 },
  footer: { flexDirection: "row", justifyContent: "flex-end", gap: 10, paddingTop: 12 },
  cancel: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 14 },
  cancelText: { color: "#fff", fontWeight: "700" },
  save: { borderRadius: 6, paddingHorizontal: 22, paddingVertical: 14, minWidth: 88, alignItems: "center" },
  saveText: { color: "#15151b", fontWeight: "800" },
});
