import type { Guild } from "@/services/social/guildModel";
import type { GuildMessage, GuildShareKind } from "@/services/social/guildChatModel";
import { carregarMensagensGuilda, compartilharNaGuilda, criarDesafioGuilda, enviarMensagemGuilda } from "@/services/social/guildService";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

export type GuildShareOption = { kind: GuildShareKind; id: number; title: string };
type Props = { visible: boolean; guild: Guild | null; accent: string; profile?: string | null; options: GuildShareOption[]; onClose: () => void };

export function GuildChatModal({ visible, guild, accent, profile, options, onClose }: Props) {
  const [messages, setMessages] = useState<GuildMessage[]>([]);
  const [text, setText] = useState("");
  const [shareKind, setShareKind] = useState<GuildShareKind | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const palette = getProfileShellPalette(profile);
  const load = useCallback(async () => {
    if (!guild) return;
    try { setMessages(await carregarMensagensGuilda(guild.id)); } catch (error) { console.warn("[GuildChat] Falha ao carregar mensagens:", error); }
  }, [guild]);
  useEffect(() => {
    if (!visible || !guild) return;
    setLoading(true); setShareKind(null);
    void load().finally(() => setLoading(false));
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [visible, guild, load]);
  async function send() {
    if (!guild || !text.trim() || sending) return;
    setSending(true);
    try { await enviarMensagemGuilda(guild.id, text); setText(""); await load(); }
    catch (error) { console.warn("[GuildChat] Falha ao enviar:", error); }
    finally { setSending(false); }
  }
  async function share(option: GuildShareOption) {
    if (!guild || sending) return;
    setSending(true);
    try { if (option.kind === "desafio") await criarDesafioGuilda(guild.id, "todos", 3); else await compartilharNaGuilda(guild.id, option.kind, option.id, option.title); setShareKind(null); await load(); }
    catch (error) { console.warn("[GuildChat] Falha ao compartilhar:", error); }
    finally { setSending(false); }
  }
  const selectedOptions = shareKind ? options.filter((option) => option.kind === shareKind) : [];
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={s.backdrop}><View style={[s.modal, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
      <View style={[s.header, { borderBottomColor: palette.border }]}><View style={s.heading}><MaterialCommunityIcons name="forum-outline" size={24} color={accent} /><View><Text style={[s.title, { color: palette.text }]}>Chat da guilda</Text><Text style={[s.subtitle, { color: palette.textMuted }]}>{guild?.nome ?? "Guilda"} · {guild?.membrosAtivos ?? 0} membros</Text></View></View><Pressable accessibilityLabel="Fechar chat da guilda" onPress={onClose}><Text style={[s.close, { color: palette.text }]}>×</Text></Pressable></View>
      {loading ? <ActivityIndicator color={accent} style={s.loader} /> : <ScrollView contentContainerStyle={s.messages} showsVerticalScrollIndicator={false}>{messages.length ? messages.map((message) => <View key={message.id} style={[s.message, { backgroundColor: message.authorId === "me" ? palette.accentSoft : palette.surface, borderColor: palette.border }]}><Text style={[s.author, { color: accent }]}>{message.authorName}</Text>{message.share ? <View style={[s.shareCard, { borderColor: accent }]}><MaterialCommunityIcons name={message.share.kind === "desafio" ? "sword-cross" : "help-circle-outline"} size={20} color={accent} /><View style={s.shareInfo}><Text style={[s.shareKind, { color: accent }]}>{message.share.kind === "desafio" ? "DESAFIO COMPARTILHADO" : "QUESTÃO COMPARTILHADA"}</Text><Text style={[s.shareTitle, { color: palette.text }]}>{message.share.title}</Text></View></View> : <Text style={[s.messageText, { color: palette.text }]}>{message.text}</Text>}<Text style={[s.time, { color: palette.textMuted }]}>{message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</Text></View>) : <Text style={[s.empty, { color: palette.textMuted }]}>Ainda não há mensagens. Comece a conversa!</Text>}</ScrollView>}
      {shareKind ? <View style={[s.picker, { backgroundColor: palette.surface, borderColor: palette.border }]}><View style={s.pickerHeader}><Text style={[s.pickerTitle, { color: palette.text }]}>Escolha o que compartilhar</Text><Pressable onPress={() => setShareKind(null)}><Text style={[s.cancel, { color: accent }]}>Fechar</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.options}>{selectedOptions.length ? selectedOptions.map((option) => <Pressable key={`${option.kind}-${option.id}`} onPress={() => void share(option)} style={[s.option, { borderColor: accent }]}><MaterialCommunityIcons name={option.kind === "desafio" ? "sword-cross" : "help-circle-outline"} size={17} color={accent} /><Text numberOfLines={2} style={[s.optionText, { color: palette.text }]}>{option.title}</Text></Pressable>) : <Text style={[s.emptyOption, { color: palette.textMuted }]}>Nenhum conteúdo disponível para compartilhar.</Text>}</ScrollView></View> : null}
      <View style={[s.composer, { borderTopColor: palette.border }]}><Pressable accessibilityLabel="Compartilhar desafio" onPress={() => setShareKind("desafio")} style={[s.shareButton, { borderColor: accent }]}><MaterialCommunityIcons name="sword-cross" size={19} color={accent} /></Pressable><Pressable accessibilityLabel="Compartilhar questão" onPress={() => setShareKind("questao")} style={[s.shareButton, { borderColor: accent }]}><MaterialCommunityIcons name="help-circle-outline" size={19} color={accent} /></Pressable><TextInput value={text} onChangeText={setText} onSubmitEditing={() => void send()} returnKeyType="send" placeholder="Escreva para sua guilda..." placeholderTextColor={palette.textMuted} style={[s.input, { color: palette.text, borderColor: palette.border }]} maxLength={500} /><Pressable accessibilityLabel="Enviar mensagem" disabled={!text.trim() || sending} onPress={() => void send()} style={[s.send, { backgroundColor: text.trim() && !sending ? accent : palette.borderStrong }]}><MaterialCommunityIcons name="send" size={18} color="#fff" /></Pressable></View>
    </View></View>
  </Modal>;
}

const s = StyleSheet.create({ backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,.78)" }, modal: { height: "82%", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, overflow: "hidden" }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1 }, heading: { flexDirection: "row", alignItems: "center", gap: 10 }, title: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 17 }, subtitle: { fontFamily: FontFamily.interMedium, fontSize: 11, marginTop: 2 }, close: { fontSize: 30, lineHeight: 30 }, loader: { marginTop: 90 }, messages: { padding: 14, gap: 8, flexGrow: 1 }, empty: { textAlign: "center", marginTop: 100, fontFamily: FontFamily.interMedium }, message: { alignSelf: "stretch", borderRadius: 12, borderWidth: 1, padding: 10 }, author: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 11 }, messageText: { fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 20, marginTop: 4 }, time: { alignSelf: "flex-end", fontSize: 9, marginTop: 5 }, shareCard: { flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderRadius: 9, padding: 9, marginTop: 6 }, shareInfo: { flex: 1 }, shareKind: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 9, letterSpacing: .4 }, shareTitle: { fontFamily: FontFamily.interMedium, fontSize: 13, marginTop: 2 }, picker: { borderTopWidth: 1, padding: 10 }, pickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, pickerTitle: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 12 }, cancel: { fontFamily: FontFamily.interMedium, fontSize: 11 }, options: { gap: 8, paddingVertical: 8 }, option: { width: 145, minHeight: 58, borderWidth: 1, borderRadius: 9, padding: 8, gap: 5 }, optionText: { fontFamily: FontFamily.interMedium, fontSize: 11 }, emptyOption: { paddingVertical: 10, fontSize: 12 }, composer: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderTopWidth: 1 }, shareButton: { width: 34, height: 34, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" }, input: { flex: 1, minHeight: 36, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7, fontFamily: FontFamily.interMedium, fontSize: 12 }, send: { width: 36, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center" } });
