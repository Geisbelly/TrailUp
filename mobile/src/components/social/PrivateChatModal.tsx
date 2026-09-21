import {
  socialChatListar,
  socialChatEnviar,
  socialChatPresenca,
} from "@/services/social/socialService";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  person: {
    alunoId: string;
    nome: string;
    apelido: string | null;
    online?: boolean;
  };
  accent: string;
  profile?: string | null;
  onClose: () => void;
};
type Message = {
  id: string;
  remetente_id: string;
  texto: string;
  created_at: string;
  remetente_nome: string;
};

export function PrivateChatModal({
  visible,
  person,
  accent,
  profile,
  onClose,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [online, setOnline] = useState(Boolean(person.online));
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const palette = getProfileShellPalette(profile);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = generation.current;
    try {
      const [nextMessages, nextOnline] = await Promise.all([
        socialChatListar(person.alunoId),
        socialChatPresenca(person.alunoId),
      ]);
      if (current !== generation.current) return;
      setMessages(nextMessages as Message[]);
      setOnline(nextOnline);
    } catch {
      if (current === generation.current)
        setError("Não foi possível carregar esta conversa.");
    }
  }, [person.alunoId]);
  useEffect(() => {
    if (!visible) return;
    setMessages([]);
    setText("");
    setError(null);
    setLoading(true);
    const current = generation.current;
    void load().finally(() => {
      if (current === generation.current) setLoading(false);
    });
    const timer = setInterval(() => void load(), 5000);
    return () => {
      generation.current += 1;
      clearInterval(timer);
    };
  }, [visible, load]);
  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await socialChatEnviar(person.alunoId, text);
      setText("");
      await load();
    } catch {
      setError("Não foi possível enviar a mensagem.");
    } finally {
      setSending(false);
    }
  }
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView
          style={[s.screen, { backgroundColor: palette.background }]}
        >
          <KeyboardAvoidingView
            style={s.screen}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={[s.header, { borderBottomColor: palette.border }]}>
              <View style={s.heading}>
                <Text style={[s.title, { color: palette.text }]}>
                  {person.apelido || person.nome}
                </Text>
                <View style={s.onlineRow}>
                  <View
                    style={[
                      s.dot,
                      {
                        backgroundColor: online ? "#62db9b" : palette.textMuted,
                      },
                    ]}
                  />
                  <Text style={[s.subtitle, { color: palette.textMuted }]}>
                    {online ? "Online" : "Offline"}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Fechar conversa"
                style={s.iconButton}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={22}
                  color={palette.accent}
                />
              </Pressable>
            </View>
            {error ? (
              <Text
                accessibilityRole="alert"
                style={[s.error, { color: palette.textMuted }]}
              >
                {error}
              </Text>
            ) : null}
            {loading ? (
              <ActivityIndicator color={accent} style={s.screen} />
            ) : (
              <ScrollView
                contentContainerStyle={s.messages}
                keyboardShouldPersistTaps="handled"
              >
                {messages.length ? (
                  messages.map((message) => (
                    <View
                      key={message.id}
                      style={[
                        s.message,
                        {
                          backgroundColor: palette.surface,
                          borderColor: palette.border,
                        },
                      ]}
                    >
                      <Text style={[s.author, { color: accent }]}>
                        {message.remetente_nome}
                      </Text>
                      <Text style={[s.body, { color: palette.text }]}>
                        {message.texto}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={[s.empty, { color: palette.textMuted }]}>
                    Comece uma conversa privada.
                  </Text>
                )}
              </ScrollView>
            )}
            <View style={[s.composer, { borderTopColor: palette.border }]}>
              <TextInput
                value={text}
                onChangeText={setText}
                onSubmitEditing={() => void send()}
                returnKeyType="send"
                placeholder="Mensagem privada..."
                placeholderTextColor={palette.textMuted}
                accessibilityLabel="Mensagem privada"
                style={[
                  s.input,
                  { color: palette.text, borderColor: palette.border },
                ]}
                maxLength={500}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Enviar mensagem"
                disabled={!text.trim() || sending}
                onPress={() => void send()}
                style={[
                  s.send,
                  {
                    backgroundColor:
                      text.trim() && !sending
                        ? accent
                        : palette.surfaceElevated,
                  },
                ]}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={palette.accent} />
                ) : (
                  <MaterialCommunityIcons
                    name="send"
                    size={20}
                    color={text.trim() ? palette.background : palette.textMuted}
                  />
                )}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 20,
    borderBottomWidth: 1,
  },
  heading: { flex: 1, minWidth: 0 },
  title: { fontFamily: FontFamily.inikaBold, fontSize: 22, lineHeight: 28 },
  subtitle: { fontSize: 12 },
  onlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 5,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  messages: { padding: 20, gap: 12, flexGrow: 1 },
  empty: { textAlign: "center", marginTop: 70, fontSize: 14 },
  error: { padding: 16, fontSize: 13, lineHeight: 20 },
  message: { borderRadius: 6, borderWidth: 1, padding: 14 },
  author: { fontWeight: "700", fontSize: 11 },
  body: { fontSize: 14, lineHeight: 21, marginTop: 5 },
  composer: { flexDirection: "row", gap: 10, padding: 16, borderTopWidth: 1 },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  send: {
    width: 46,
    minHeight: 46,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});
