import { HallBackground } from "@/components/HallTheme";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";


import { avatarImages, pickBySeed } from "@/constants/profileImages";
import { useNotifications } from "@/context/NotificacaoContext";
import { useUsuario } from "@/context/SessaoContext";
import { supabase } from "@/database/supabase";
import { Aluno } from "@/models/Aluno";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";

export default function Infor() {
  const { usuario, atualizarUsuario } = useUsuario();
  const { addToast } = useNotifications();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfis]
  );

  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [apelido, setApelido] = useState(
    (usuario as any)?.apelido ??
      (usuario?.email ? `@${usuario.email.split("@")[0]}` : "")
  );
  const [descricao, setDescricao] = useState(usuario?.descricao ?? "");
  const [modoNome] = useState(usuario?.modoOperacao_nome ?? "");
  const [modoResposta, setModoResposta] = useState(
    (usuario as any)?.modoResposta ?? "imediato"
  );
  const [fotoUri, setFotoUri] = useState<string | null>(
    (usuario as any)?.foto_url ?? null
  );
  const [bannerUri, setBannerUri] = useState<string | null>(
    (usuario as any)?.banner_url ?? null
  );

  const avatarDefault = useMemo(
    () => pickBySeed(usuario?.id, avatarImages),
    [usuario?.id]
  );

  const handlePickImage = async (type: "foto" | "banner") => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permissão negada",
        "Autorize o acesso às fotos para escolher uma imagem."
      );
      return;
    }

    const pickerMediaTypes = ["images"];

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: pickerMediaTypes as any,
      allowsEditing: true,
      aspect: type === "banner" ? [3, 1] : [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.length) return;

    const uri = result.assets[0].uri;
    if (type === "foto") {
      setFotoUri(uri);
    } else {
      setBannerUri(uri);
    }

    await uploadToStorage(uri, type);
  };

  const uploadToStorage = async (uri: string, type: "foto" | "banner") => {
    try {
      const response = await fetch(uri);
      const ext = uri.split(".").pop() || "jpg";
      const mime = response.headers.get("content-type") || `image/${ext}`;
      const arrayBuffer = await response.arrayBuffer();
      const file = new Uint8Array(arrayBuffer);
      const fileName = `${usuario?.id ?? "user"}-${Date.now()}.${ext}`;
      const bucket = type === "foto" ? "perfil_fotos" : "banners_fotos";

      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, { contentType: mime, upsert: false });
      if (error) throw error;

      const { data: publicUrl } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);

      if (type === "foto") {
        setFotoUri(publicUrl.publicUrl);
      } else {
        setBannerUri(publicUrl.publicUrl);
      }

      Alert.alert("Upload concluído", "Imagem atualizada com sucesso.");
    } catch (err) {
      console.warn("Erro ao subir imagem:", err);
      Alert.alert("Erro", "Não foi possível enviar a imagem agora.");
    }
  };

  const salvar = async () => {
    if (!usuario?.id || salvando) {
      if (!usuario?.id) {
        Alert.alert("Aviso", "Sessão inválida.");
      }
      return;
    }

    if (!nome.trim()) {
      Alert.alert("Atenção", "Informe seu nome.");
      return;
    }

    try {
      setSalvando(true);
      await (usuario as Aluno).atualizarPerfilViaFuncao({
        nome,
        apelido,
        modoResposta,
        descricao,
        foto_url: fotoUri,
        banner_url: bannerUri,
      });
      await atualizarUsuario();
      setEditando(false);
      addToast({
        type: "achievement",
        title: "Perfil atualizado",
        description:
          "Suas preferencias de estudo foram salvas e ja entram no proximo ciclo do app.",
      });
    } catch (err) {
      console.warn(err);
      Alert.alert("Erro", "Não foi possível salvar agora.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <View style={[styles.outer, { backgroundColor: palette.background }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} pointerEvents="none">
        <HallBackground palette={palette} />
      </View>
    <ScrollView
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      <View style={styles.pageHeader}>
        <Text style={[styles.pageTitle, { color: palette.text }]}>Seu perfil</Text>
        <Text style={[styles.pageSubtitle, { color: palette.textMuted }]}>
          Revise suas informações e preferências de estudo.
        </Text>
      </View>

      <View
        style={[
          styles.secaoPerfilCard,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
        ]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.nomeUsuario, { color: palette.text }]}>{nome || usuario?.nome}</Text>
            <Text style={[styles.emailUsuario, { color: palette.textMuted }]}>{usuario?.email}</Text>
          </View>
          <TouchableOpacity
            onPress={() => setEditando((v) => !v)}
            style={[
              styles.chipBotao,
              {
                borderColor: palette.accent,
                backgroundColor: editando ? palette.accent : palette.surface,
              },
            ]}
          >
            <Feather
              name={editando ? "x" : "edit-2"}
              size={16}
              color={editando ? Color.colorWhite : palette.text}
            />
            <Text
              style={[
                styles.chipBotaoTexto,
                { color: editando ? Color.colorWhite : palette.text },
              ]}
            >
              {editando ? "Cancelar" : "Editar"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bannerContainer}>
          {bannerUri ? (
            <Image source={{ uri: bannerUri }} style={styles.banner} />
          ) : (
            <View
              style={[
                styles.banner,
                styles.bannerPlaceholder,
                { backgroundColor: palette.surface },
              ]}
            >
              <Text style={[styles.bannerPlaceholderText, { color: palette.textMuted }]}>
                Adicione um banner para personalizar seu espaço
              </Text>
            </View>
          )}
        </View>

        {/* Avatar fora do container do banner para não ser cortado */}
        <View style={styles.avatarWrapper}>
          {fotoUri ? (
            <Image source={{ uri: fotoUri }} style={[styles.avatar, { borderColor: palette.background }]} />
          ) : avatarDefault ? (
            <Image source={avatarDefault} style={[styles.avatar, { borderColor: palette.background }]} />
          ) : null}
        </View>

        {editando && (
          <View style={styles.bannerActionsRow}>
            <TouchableOpacity
              onPress={() => handlePickImage("banner")}
              style={[
                styles.smallGhostButton,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surface,
                },
              ]}
            >
              <Feather
                name="image"
                size={14}
                color={palette.textMuted}
              />
              <Text style={[styles.smallGhostButtonText, { color: palette.textMuted }]}>Trocar banner</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handlePickImage("foto")}
              style={[
                styles.smallGhostButton,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surface,
                },
              ]}
            >
              <Feather
                name="camera"
                size={14}
                color={palette.textMuted}
              />
              <Text style={[styles.smallGhostButtonText, { color: palette.textMuted }]}>Trocar foto</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View
        style={[
          styles.infoCard,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
        ]}
      >
        <View style={styles.fieldContainer}>
          <Text style={[styles.fieldLabel, { color: palette.text }]}>Apelido</Text>
          <View
            style={[
              styles.fieldValueContainer,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <TextInput
              style={[styles.fieldValueText, { color: palette.text }]}
              value={apelido}
              onChangeText={setApelido}
              placeholder="Apelido"
              placeholderTextColor={palette.textSubtle}
              editable={editando}
              autoCapitalize="none"
            />
          </View>
        </View>

        <View style={styles.fieldContainer}>
          <Text style={[styles.fieldLabel, { color: palette.text }]}>Nome</Text>
          <View
            style={[
              styles.fieldValueContainer,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <TextInput
              style={[styles.fieldValueText, { color: palette.text }]}
              value={nome}
              onChangeText={setNome}
              placeholder="Nome"
              placeholderTextColor={palette.textSubtle}
              editable={editando}
              autoCapitalize="words"
            />
          </View>
        </View>

        <View style={styles.fieldContainer}>
          <Text style={[styles.fieldLabel, { color: palette.text }]}>Descrição</Text>
          <View
            style={[
              styles.fieldValueContainer,
              styles.fieldValueContainerMultiline,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <TextInput
              style={[styles.fieldValueText, styles.multilineInput, { color: palette.text }]}
              value={descricao}
              onChangeText={setDescricao}
              placeholder="Como você gosta de aprender, interesses, objetivos..."
              placeholderTextColor={palette.textSubtle}
              editable={editando}
              multiline
            />
          </View>
        </View>

        <View style={styles.fieldContainer}>
          <Text style={[styles.fieldLabel, { color: palette.text }]}>Email</Text>
          <View
            style={[
              styles.fieldValueContainer,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <TextInput
              style={[styles.fieldValueText, { color: palette.textMuted }]}
              value={usuario?.email ?? ""}
              editable={false}
            />
          </View>
        </View>

        <View style={styles.fieldContainer}>
          <Text style={[styles.fieldLabel, { color: palette.text }]}>Modo de operação</Text>
          <View
            style={[
              styles.fieldValueContainer,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <TextInput
              style={[styles.fieldValueText, { color: palette.textMuted }]}
              value={modoNome}
              placeholder="Modo de operação"
              placeholderTextColor={palette.textSubtle}
              editable={false}
            />
          </View>
        </View>

        <View style={styles.fieldContainer}>
          <Text style={[styles.fieldLabel, { color: palette.text }]}>Modo de resposta</Text>
          <View
            style={[
              styles.fieldValueContainer,
              { flexDirection: "row", gap: 8 },
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <TouchableOpacity
              disabled={!editando}
              onPress={() => setModoResposta("imediato")}
              style={[
                styles.modoRespostaChip,
                {
                  backgroundColor:
                    modoResposta === "imediato"
                      ? palette.accent
                      : palette.surfaceElevated,
                  borderColor:
                    modoResposta === "imediato"
                      ? palette.borderStrong
                      : palette.border,
                },
                !editando && { opacity: 0.6 },
              ]}
            >
              <Feather
                name="zap"
                size={14}
                color={
                  modoResposta === "imediato"
                    ? Color.colorWhite
                    : palette.textMuted
                }
              />
              <Text
                style={[
                  styles.modoRespostaChipTexto,
                  {
                    color:
                      modoResposta === "imediato"
                        ? Color.colorWhite
                        : palette.text,
                  },
                ]}
              >
                Imediato
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled={!editando}
              onPress={() => setModoResposta("pensante")}
              style={[
                styles.modoRespostaChip,
                {
                  backgroundColor:
                    modoResposta === "pensante"
                      ? palette.accent
                      : palette.surfaceElevated,
                  borderColor:
                    modoResposta === "pensante"
                      ? palette.borderStrong
                      : palette.border,
                },
                !editando && { opacity: 0.6 },
              ]}
            >
              <Feather
                name="clock"
                size={14}
                color={
                  modoResposta === "pensante"
                    ? Color.colorWhite
                    : palette.textMuted
                }
              />
              <Text
                style={[
                  styles.modoRespostaChipTexto,
                  {
                    color:
                      modoResposta === "pensante"
                        ? Color.colorWhite
                        : palette.text,
                  },
                ]}
              >
                Pensante
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.modoRespostaHelp, { color: palette.textSubtle }]}>
            Imediato mostra o gabarito na hora; Pensante esconde e libera
            quando você quiser ver.
          </Text>
        </View>
      </View>

      {editando && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.button,
              {
                backgroundColor: palette.accent,
                borderColor: palette.borderStrong,
              },
              salvando && { opacity: 0.6 },
            ]}
            onPress={salvar}
            disabled={salvando}
          >
            <Text style={styles.buttonText}>
              {salvando ? "Salvando..." : "Salvar alterações"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  pageHeader: {
    marginTop: 20,
    marginBottom: 10,
  },
  pageTitle: {
    color: Color.colorAliceblue,
    fontSize: 22,
    fontFamily: FontFamily.inikaBold,
  },
  pageSubtitle: {
    color: Color.colorSlategray,
    fontSize: 14,
    marginTop: 4,
  },
  secaoPerfilCard: {
    marginTop: 8,
    marginBottom: 16,
    backgroundColor: Color.colorDarkslategray200,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  infoCard: {
    backgroundColor: Color.colorDarkslategray200,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  nomeUsuario: {
    color: Color.colorAliceblue,
    fontSize: 18,
    fontFamily: FontFamily.interMedium,
  },
  emailUsuario: {
    color: Color.colorSlategray,
    fontSize: 13,
    marginTop: 2,
  },
  chipBotao: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Color.colorSlategray,
    backgroundColor: "transparent",
    gap: 6,
  },
  chipBotaoAtivo: {
    backgroundColor: Color.colorDarkslategray100,
  },
  chipBotaoTexto: {
    color: Color.colorWhite,
    fontSize: 14,
    fontFamily: FontFamily.interMedium,
  },
  bannerContainer: {
    marginTop: 4,
    borderRadius: 16,
  },
  banner: {
    width: "100%",
    height: 120,
    borderRadius: 16,
    resizeMode: "cover",
  },
  bannerPlaceholder: {
    backgroundColor: Color.colorDarkslategray,
    justifyContent: "center",
    alignItems: "center",
  },
  bannerPlaceholderText: {
    color: Color.colorSlategray,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  // avatar agora sobreposto com margem negativa, sem ser cortado
  avatarWrapper: {
    marginTop: -32,
    paddingLeft: 16,
    marginBottom: 16,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    resizeMode: "cover",
    borderWidth: 3,
    borderColor: Color.background,
  },
  bannerActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  smallGhostButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Color.colorSlategray,
    backgroundColor: Color.colorGray,
    gap: 6,
  },
  smallGhostButtonText: {
    color: Color.colorAliceblue300,
    fontSize: 13,
    fontFamily: FontFamily.interMedium,
  },
  fieldContainer: {
    marginBottom: 15,
  },
  fieldLabel: {
    color: Color.colorAliceblue200,
    fontSize: 15,
    marginBottom: 6,
    fontFamily: FontFamily.interMedium,
  },
  fieldValueContainer: {
    backgroundColor: Color.colorAliceblueCinza,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  fieldValueContainerMultiline: {
    minHeight: 64,
    justifyContent: "flex-start",
    paddingVertical: 12,
  },
  fieldValueText: {
    color: Color.colorAliceblue,
    fontSize: 16,
    fontFamily: FontFamily.interMedium,
  },
  multilineInput: {
    minHeight: 64,
    textAlignVertical: "top",
  },
  modoRespostaChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Color.colorDarkslategray,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Color.colorSlategray,
    gap: 6,
  },
  modoRespostaChipAtivo: {
    backgroundColor: Color.colorDarkslategray100,
    borderColor: Color.colorDarkslategray100,
  },
  modoRespostaChipTexto: {
    color: Color.colorAliceblue,
    fontSize: 14,
    fontFamily: FontFamily.interMedium,
  },
  modoRespostaChipTextoAtivo: {
    fontWeight: "700",
  },
  modoRespostaHelp: {
    color: Color.colorSlategray,
    marginTop: 6,
    fontSize: 13,
    fontFamily: FontFamily.interMedium,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  button: {
    marginTop: 8,
    backgroundColor: Color.colorDarkslategray100,
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  buttonText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 15,
    color: Color.colorWhite,
  },
});
