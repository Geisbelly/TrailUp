import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import tinycolor from "tinycolor2";

import { FramedProfileImage } from "@/components/FramedProfileImage";
import { getProfileArtwork } from "@/constants/designAssets";
import type { useInfoPessoais } from "@/hooks/useInfoPessoais";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

type Form = ReturnType<typeof useInfoPessoais>;

const MODOS: { id: string; rotulo: string }[] = [
  { id: "imediato", rotulo: "Imediato" },
  { id: "pensante", rotulo: "Pensante" },
];

/**
 * "Informações pessoais" nas Configurações da web em tela larga (#346,
 * protótipo v4, 11-configuracoes.html): o cartão "Seu perfil" (banner com
 * "Trocar banner" e a foto com "Trocar foto"), o formulário sempre editável
 * com "Salvar alterações" e, ao lado, o que o aluno precisa saber. A lógica é
 * a mesma da tela do app (useInfoPessoais).
 */
export function InfoPessoaisDesktop({ form, palette }: { form: Form; palette: ProfileShellPalette }) {
  const { usuario, salvando, nome, setNome, apelido, setApelido, descricao, setDescricao, modoNome, modoResposta, setModoResposta, fotoUri, bannerUri, handlePickImage, salvar } = form;
  const vidro = { backgroundColor: tinycolor(palette.background).setAlpha(0.7).toRgbString(), borderColor: palette.borderStrong };
  const campo = [s.campo, { backgroundColor: palette.background, borderColor: palette.border, color: palette.text }];

  return (
    <View style={s.tela}>
      <View style={s.principal}>
        <View style={[s.cartao, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[s.rotuloCartao, { color: palette.textMuted }]}>SEU PERFIL</Text>
          <View style={s.bannerArea}>
            <View style={[s.banner, { borderColor: palette.border }]}>
              <Image source={bannerUri ? { uri: bannerUri } : getProfileArtwork(palette.profile, "banner")} resizeMode="cover" style={s.bannerImagem} />
              <Pressable accessibilityRole="button" onPress={() => void handlePickImage("banner")} style={[s.botaoVidro, s.trocarBanner, vidro]}>
                <MaterialCommunityIcons name="camera-outline" size={16} color={palette.text} />
                <Text style={[s.botaoVidroTexto, { color: palette.text }]}>Trocar banner</Text>
              </Pressable>
            </View>
            <View style={s.fotoLinha}>
              <FramedProfileImage profile={palette.profile} source={fotoUri ? { uri: fotoUri } : undefined} size={84} label={`Foto de ${nome || "Aluno"}`} />
              <Pressable accessibilityRole="button" onPress={() => void handlePickImage("foto")} style={[s.botaoVidro, vidro]}>
                <Text style={[s.botaoVidroTexto, { color: palette.text }]}>Trocar foto</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={[s.cartao, s.formulario, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={s.linha}>
            <View style={s.coluna}>
              <Text style={[s.rotulo, { color: palette.text }]}>Nome</Text>
              <TextInput value={nome} onChangeText={setNome} placeholder="Seu nome" placeholderTextColor={palette.textSubtle} style={campo} />
            </View>
            <View style={s.coluna}>
              <Text style={[s.rotulo, { color: palette.text }]}>Apelido</Text>
              <TextInput value={apelido} onChangeText={setApelido} placeholder="Apelido" placeholderTextColor={palette.textSubtle} style={campo} />
            </View>
          </View>

          <View>
            <Text style={[s.rotulo, { color: palette.text }]}>Email</Text>
            <TextInput value={usuario?.email ?? ""} editable={false} style={[...campo, { color: palette.textMuted }]} />
          </View>

          <View>
            <Text style={[s.rotulo, { color: palette.text }]}>Descrição</Text>
            <TextInput
              value={descricao}
              onChangeText={setDescricao}
              placeholder="Conte um pouco sobre você"
              placeholderTextColor={palette.textSubtle}
              multiline
              numberOfLines={3}
              style={[...campo, s.areaTexto]}
            />
          </View>

          <View style={s.linha}>
            <View style={s.coluna}>
              <Text style={[s.rotulo, { color: palette.text }]}>Modo de operação</Text>
              <TextInput value={modoNome} editable={false} placeholder="—" placeholderTextColor={palette.textSubtle} style={[...campo, { color: palette.textMuted }]} />
            </View>
            <View style={s.coluna}>
              <Text style={[s.rotulo, { color: palette.text }]}>Modo de resposta</Text>
              <View accessibilityRole="radiogroup" style={s.segmentos}>
                {MODOS.map(({ id, rotulo }) => {
                  const ativo = modoResposta === id;
                  return (
                    <Pressable
                      key={id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: ativo }}
                      onPress={() => setModoResposta(id)}
                      style={[s.segmento, { borderColor: ativo ? palette.accent : palette.border, backgroundColor: ativo ? palette.accentMuted : palette.background }]}
                    >
                      <Text style={[s.segmentoTexto, { color: ativo ? palette.text : palette.textMuted }]}>{rotulo}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
          <Text style={[s.ajuda, { color: palette.textSubtle }]}>
            Imediato mostra o gabarito na hora; Pensante esconde e libera quando você quiser ver.
          </Text>

          <Pressable
            accessibilityRole="button"
            disabled={salvando}
            onPress={() => void salvar()}
            style={[s.salvar, { backgroundColor: palette.accent, opacity: salvando ? 0.7 : 1 }]}
          >
            {salvando ? <ActivityIndicator color={palette.background} /> : null}
            <Text style={[s.salvarTexto, { color: palette.background }]}>Salvar alterações</Text>
          </Pressable>
        </View>
      </View>

      <View style={s.lado}>
        <View style={[s.cartao, s.aviso, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[s.rotuloCartao, { color: palette.textMuted }]}>ONDE ISSO APARECE</Text>
          <Text style={[s.avisoTexto, { color: palette.textMuted }]}>
            Foto, banner, nome, apelido e descrição formam o seu perfil público: é o que os colegas veem ao clicar em você no Social.
          </Text>
        </View>
        <View style={[s.cartao, s.aviso, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[s.rotuloCartao, { color: palette.textMuted }]}>MODOS DE ESTUDO</Text>
          <Text style={[s.avisoTexto, { color: palette.textMuted }]}>
            Suas preferências de estudo são salvas e já entram no próximo ciclo do app.
          </Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  tela: { flexDirection: "row", gap: 16, alignItems: "flex-start", paddingBottom: 24 },
  principal: { flex: 1, minWidth: 0, gap: 16 },
  lado: { width: 260, gap: 12 },
  cartao: { borderRadius: 14, borderWidth: 1, padding: 18 },
  rotuloCartao: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 12 },
  bannerArea: { gap: 0 },
  banner: { height: 128, borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  bannerImagem: { width: "100%", height: "100%" },
  trocarBanner: { position: "absolute", right: 12, bottom: 12 },
  // Sobe 42 px por cima do banner e ocupa a largura toda: sem box-none, cobria a metade de
  // baixo do "Trocar banner", que aparecia inteiro mas só aceitava clique na faixa de cima.
  fotoLinha: { flexDirection: "row", alignItems: "flex-end", gap: 12, marginTop: -42, marginLeft: 12, pointerEvents: "box-none" },
  botaoVidro: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  botaoVidroTexto: { fontFamily: FontFamily.interMedium, fontSize: 12.5, fontWeight: "700" },
  formulario: { gap: 16 },
  linha: { flexDirection: "row", gap: 16 },
  coluna: { flex: 1, minWidth: 0 },
  rotulo: { fontFamily: FontFamily.interMedium, fontSize: 12.5, fontWeight: "700", marginBottom: 6 },
  campo: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontFamily: FontFamily.interMedium, fontSize: 13.5 },
  areaTexto: { minHeight: 76, textAlignVertical: "top" },
  segmentos: { flexDirection: "row", gap: 8 },
  segmento: { flex: 1, alignItems: "center", borderRadius: 8, borderWidth: 1, paddingVertical: 10 },
  segmentoTexto: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "600" },
  ajuda: { fontFamily: FontFamily.interMedium, fontSize: 12, marginTop: -6 },
  salvar: { alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 20 },
  salvarTexto: { fontFamily: FontFamily.interMedium, fontSize: 13.5, fontWeight: "700" },
  aviso: { padding: 16 },
  avisoTexto: { fontFamily: FontFamily.interMedium, fontSize: 12.5, lineHeight: 19 },
});
