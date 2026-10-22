import { HallBackground } from "@/components/HallTheme";
import { Feather } from "@expo/vector-icons";
import React, { useMemo } from "react";
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


import { FramedProfileImage } from "@/components/FramedProfileImage";
import { InfoPessoaisDesktop } from "@/components/web/InfoPessoaisDesktop";
import { useDialog } from "@/context/DialogContext";
import { useInfoPessoais } from "@/hooks/useInfoPessoais";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { useEmbutidoConfiguracoes } from "@/context/EmbutidoConfiguracoesContext";
import { perfilVisualDoAluno } from "@/utils/brainHex";

export default function Infor() {
  const embutido = useEmbutidoConfiguracoes();
  const { showDialog } = useDialog();
  // A lógica mora em useInfoPessoais; na web em tela larga (#346) a mesma lógica ganha o layout do v4.
  // Embutida no painel de lá, o recado vai pelo diálogo do app: na web o Alert não aparece.
  const form = useInfoPessoais((titulo, texto) =>
    embutido ? showDialog({ title: titulo, description: texto }) : Alert.alert(titulo, texto)
  );
  const {
    usuario,
    editando,
    setEditando,
    salvando,
    nome,
    setNome,
    apelido,
    setApelido,
    descricao,
    setDescricao,
    modoNome,
    modoResposta,
    setModoResposta,
    fotoUri,
    bannerUri,
    handlePickImage,
    salvar,
  } = form;
  const palette = useMemo(
    () => getProfileShellPalette(perfilVisualDoAluno(usuario)),
    [usuario]
  );

  if (embutido) return <InfoPessoaisDesktop form={form} palette={palette} />;

  return (
    <View style={[styles.outer, { backgroundColor: palette.background }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: 0.35, pointerEvents: "none" }]}>
        <HallBackground palette={palette} />
      </View>
    <ScrollView
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      {embutido ? null : (
        <View style={styles.pageHeader}>
          <Text style={[styles.pageTitle, { color: palette.text }]}>Seu perfil</Text>
          <Text style={[styles.pageSubtitle, { color: palette.textMuted }]}>
            Revise suas informações e preferências de estudo.
          </Text>
        </View>
      )}

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
            accessibilityRole="button"
          >
            <Feather
              name={editando ? "x" : "edit-2"}
              size={16}
              color={editando ? palette.background : palette.accent}
            />
            <Text
              style={[
                styles.chipBotaoTexto,
                { color: editando ? palette.background : palette.text },
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
          <FramedProfileImage profile={palette.profile} source={fotoUri ? { uri: fotoUri } : undefined} size={104} label={`Foto de ${nome || 'Aluno'}`} />
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
              accessibilityRole="button"
              accessibilityLabel="Trocar banner"
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
              accessibilityRole="button"
              accessibilityLabel="Trocar foto"
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
              accessibilityRole="radio"
              accessibilityState={{ checked: modoResposta === "imediato", disabled: !editando }}
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
                    ? palette.background
                    : palette.textMuted
                }
              />
              <Text
                style={[
                  styles.modoRespostaChipTexto,
                  {
                    color:
                      modoResposta === "imediato"
                        ? palette.background
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
              accessibilityRole="radio"
              accessibilityState={{ checked: modoResposta === "pensante", disabled: !editando }}
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
                    ? palette.background
                    : palette.textMuted
                }
              />
              <Text
                style={[
                  styles.modoRespostaChipTexto,
                  {
                    color:
                      modoResposta === "pensante"
                        ? palette.background
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
            accessibilityRole="button"
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
