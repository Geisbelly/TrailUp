import { FramedProfileImage } from "@/components/FramedProfileImage";
import { ProfileArtwork } from "@/components/ProfileArtwork";
import { bossVisuals } from "@/constants/bossVisuals";
import { journeyObjects, profileBanners, rankingArenas } from "@/constants/designAssets";
import { normalizeBrainHexProfile, type BrainHexProfile } from "@/constants/brainHexProfiles";
import { brainHexGuideNames, getBrainHexConfig, guardianFullImages } from "@/constants/profileImages";
import type { Guild } from "@/services/social/guildModel";
import type { AbaDoSocial, AncoraDoSocial, AreaDoSocial } from "@/services/social/socialDestaque";
import type { SocialPerson } from "@/services/social/socialModel";
import { FontFamily } from "@/styles/GlobalStyle";
import { bossDoPerfil } from "@/utils/contentBossVisual";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Image, ImageBackground, type ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type Icone = keyof typeof MaterialCommunityIcons.glyphMap;

/** Ícone de cada bloco, no título dele. */
export const ICONE_DA_ANCORA: Record<AncoraDoSocial, Icone> = {
  evento: "calendar-star",
  arena: "sword-cross",
  convites: "account-plus-outline",
  amigos: "forum-outline",
  guildas: "shield-account-outline",
  encontrar: "compass-outline",
  bloqueados: "account-cancel-outline",
};

/** O que o hub sabe da turma, para os números dos cartões. Tudo vem do que a aba já carrega. */
export type ResumoDoSocial = {
  amigos: SocialPerson[];
  candidatos: SocialPerson[];
  convitesRecebidos: number;
  convitesEnviados: number;
  guildas: Guild[];
};

const ONLINE = "#62db9b";

function onlinePrimeiro(pessoas: SocialPerson[]) {
  return [...pessoas].sort((a, b) => Number(b.online) - Number(a.online));
}

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

/**
 * A arte de batalha da Arena: o guardião do perfil frente a frente com um boss da paleta dele,
 * no cenário da arena do perfil. São peças que o app já tem (guardiões, catálogo de bosses e
 * os cenários do ranking), compostas aqui: nenhuma imagem nova no pacote.
 */
export function ArenaBatalhaArte({ profile, palette, altura = 168 }: { profile: BrainHexProfile; palette: ProfileShellPalette; altura?: number }) {
  const boss = bossVisuals[bossDoPerfil(profile, "social-arena")];
  const guardiao = guardianFullImages[profile];
  const alturaGuardiao = altura * 0.9;
  const alturaBoss = altura * 0.94;
  return (
    <ImageBackground source={rankingArenas[profile]} resizeMode="cover" style={[s.arte, { height: altura }]} imageStyle={s.arteImagem} accessibilityIgnoresInvertColors>
      <LinearGradient colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.25)", palette.background]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      {/* Brilho do confronto: um halo da cor do perfil atrás do VS. */}
      <View style={[s.halo, { backgroundColor: palette.accentSoft, top: altura * 0.28, width: altura * 0.7, height: altura * 0.7, borderRadius: altura }]} />
      <Image source={guardiao} resizeMode="contain" style={[s.lutador, { left: -6, height: alturaGuardiao, width: alturaGuardiao * 0.86 }]} accessibilityLabel={`Guardião ${brainHexGuideNames[profile]}`} />
      <Image source={boss} resizeMode="contain" style={[s.lutador, { right: -10, height: alturaBoss, width: alturaBoss * 0.75, transform: [{ scaleX: -1 }] }]} accessibilityLabel="Adversário" />
      <View style={[s.vs, { borderColor: palette.accent, backgroundColor: palette.background, top: altura * 0.42 }]}>
        <Text style={[s.vsTexto, { color: palette.accent }]}>VS</Text>
      </View>
    </ImageBackground>
  );
}

/** Cenário dos destaques sem batalha: o mundo do perfil com um objeto da jornada em primeiro plano. */
function CenaDoPerfil({ profile, palette, objeto, altura = 124, children }: { profile: BrainHexProfile; palette: ProfileShellPalette; objeto: ImageSourcePropType; altura?: number; children?: React.ReactNode }) {
  return (
    <ImageBackground source={profileBanners[profile]} resizeMode="cover" style={[s.arte, { height: altura }]} imageStyle={s.arteImagem} accessibilityIgnoresInvertColors>
      <LinearGradient colors={["rgba(0,0,0,0.1)", palette.background]} locations={[0.2, 1]} style={StyleSheet.absoluteFill} />
      <View style={s.objetoDaCena}>
        <ProfileArtwork source={objeto} profile={profile} width={altura * 0.62} />
      </View>
      {children}
    </ImageBackground>
  );
}

/** Rostos empilhados (online primeiro), cada um abre a conversa com a pessoa. */
function Rostos({ pessoas, palette, onPress, max = 5 }: { pessoas: SocialPerson[]; palette: ProfileShellPalette; onPress?: (p: SocialPerson) => void; max?: number }) {
  const visiveis = onlinePrimeiro(pessoas).slice(0, max);
  const resto = pessoas.length - visiveis.length;
  if (!visiveis.length) return null;
  return (
    <View style={s.rostos}>
      {visiveis.map((p, i) => {
        const nome = p.apelido || p.nome;
        return (
          <Pressable key={p.alunoId} disabled={!onPress} onPress={() => onPress?.(p)} accessibilityRole="button" accessibilityLabel={`Conversar com ${nome}${p.online ? ", online" : ""}`} style={[s.rosto, { marginLeft: i === 0 ? 0 : -12, borderColor: palette.background }]} hitSlop={4}>
            <FramedProfileImage profile={normalizeBrainHexProfile(p.perfilAtivo)} source={p.fotoUrl ? { uri: p.fotoUrl } : undefined} size={44} />
            <View style={[s.pontoOnline, { borderColor: palette.background, backgroundColor: p.online ? ONLINE : "#90949d" }]} />
          </Pressable>
        );
      })}
      {resto > 0 ? (
        <View style={[s.rosto, s.rostoResto, { marginLeft: -12, borderColor: palette.background, backgroundColor: palette.surfaceElevated }]}>
          <Text style={[s.rostoRestoTexto, { color: palette.text }]}>+{resto}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Selo({ icone, texto, palette, cor }: { icone: Icone; texto: string; palette: ProfileShellPalette; cor?: string }) {
  return (
    <View style={[s.selo, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
      <MaterialCommunityIcons name={icone} size={14} color={cor ?? palette.accent} />
      <Text style={[s.seloTexto, { color: palette.text }]}>{texto}</Text>
    </View>
  );
}

function Botao({ rotulo, icone, onPress, palette, secundario }: { rotulo: string; icone: Icone; onPress: () => void; palette: ProfileShellPalette; secundario?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.botao, secundario ? { borderColor: palette.accent, borderWidth: 1 } : { backgroundColor: palette.accent }, pressed && { opacity: 0.85 }]}>
      <MaterialCommunityIcons name={icone} size={18} color={secundario ? palette.accent : palette.background} />
      <Text numberOfLines={1} style={[s.botaoTexto, { color: secundario ? palette.accent : palette.background }]}>{rotulo}</Text>
    </Pressable>
  );
}

type DestaqueProps = {
  area: AreaDoSocial;
  profile: string | null | undefined;
  palette: ProfileShellPalette;
  resumo: ResumoDoSocial;
  onIr: (ancora: AncoraDoSocial) => void;
  onConversar: (pessoa: SocialPerson) => void;
  onAbrirGuilda: (guilda: Guild) => void;
  /** Rostos dos amigos no cartão da Conversa. No celular eles já estão nos stories logo acima. */
  mostrarRostos?: boolean;
};

/**
 * O cartão grande do topo da aba, com a área que mais combina com o perfil do aluno
 * (`AREA_EM_DESTAQUE`). Só leva aonde a aba já leva: rola até o bloco, abre a conversa do amigo
 * ou a da guilda. Nenhum dado novo: os números saem do que a aba já carregou.
 */
export function SocialHubDestaque({ area, profile, palette, resumo, onIr, onConversar, onAbrirGuilda, mostrarRostos = true }: DestaqueProps) {
  const perfil = normalizeBrainHexProfile(profile) ?? "mastermind";
  const rotuloPerfil = getBrainHexConfig(perfil).label;
  const online = resumo.amigos.filter((p) => p.online);
  const minhaGuilda = resumo.guildas.find((g) => g.souMembro) ?? null;

  let arte: React.ReactNode;
  let titulo: string;
  let texto: string;
  let selos: React.ReactNode;
  let acoes: React.ReactNode;

  if (area === "arena") {
    arte = <ArenaBatalhaArte profile={perfil} palette={palette} />;
    titulo = "Arena da turma";
    texto = "Desafie um colega em 5 questões. A vitória vale Elo no seu ranking.";
    selos = (
      <>
        <Selo icone="sword-cross" texto="Duelo 1x1" palette={palette} />
        <Selo icone="account-multiple" texto="Dupla 2x2" palette={palette} />
        <Selo icone="shield-half-full" texto="Guilda x guilda" palette={palette} />
      </>
    );
    acoes = <Botao rotulo="Entrar na arena" icone="sword" onPress={() => onIr("arena")} palette={palette} />;
  } else if (area === "conversa") {
    arte = (
      <CenaDoPerfil profile={perfil} palette={palette} objeto={journeyObjects.community}>
        {mostrarRostos ? (
          <View style={s.rostosNaCena}>
            <Rostos pessoas={resumo.amigos} palette={palette} onPress={onConversar} />
          </View>
        ) : null}
      </CenaDoPerfil>
    );
    titulo = "Conversa";
    texto = online.length
      ? `${plural(online.length, "amigo está", "amigos estão")} online agora. Toque num rosto para conversar.`
      : resumo.amigos.length
        ? "Ninguém online agora, mas a mensagem fica esperando."
        : "Convide colegas para conversar e montar sua guilda.";
    selos = (
      <>
        <Selo icone="circle" cor={ONLINE} texto={`${online.length} online`} palette={palette} />
        <Selo icone="account-heart-outline" texto={plural(resumo.amigos.length, "amigo", "amigos")} palette={palette} />
        {resumo.convitesRecebidos ? <Selo icone="account-plus-outline" texto={plural(resumo.convitesRecebidos, "convite", "convites")} palette={palette} /> : null}
      </>
    );
    acoes = (
      <>
        {online[0] ? (
          <Botao rotulo={`Falar com ${online[0].apelido || online[0].nome}`} icone="message-text-outline" onPress={() => onConversar(online[0])} palette={palette} />
        ) : (
          <Botao rotulo={resumo.amigos.length ? "Ver amigos" : "Encontrar colegas"} icone="forum-outline" onPress={() => onIr(resumo.amigos.length ? "amigos" : "encontrar")} palette={palette} />
        )}
        {minhaGuilda ? (
          <Botao rotulo="Conversa da guilda" icone="shield-account-outline" onPress={() => onAbrirGuilda(minhaGuilda)} palette={palette} secundario />
        ) : (
          <Botao rotulo="Guildas" icone="shield-account-outline" onPress={() => onIr("guildas")} palette={palette} secundario />
        )}
      </>
    );
  } else if (area === "descobrir") {
    arte = (
      <CenaDoPerfil profile={perfil} palette={palette} objeto={journeyObjects.compass}>
        <View style={s.rostosNaCena}>
          <Rostos pessoas={resumo.candidatos} palette={palette} />
        </View>
      </CenaDoPerfil>
    );
    titulo = "Descobrir colegas";
    texto = resumo.candidatos.length
      ? `${plural(resumo.candidatos.length, "colega da turma ainda não conhece", "colegas da turma ainda não conhecem")} você. Explore perfis e guildas.`
      : "Você já conectou com todo mundo da turma. Explore as guildas.";
    selos = (
      <>
        <Selo icone="compass-outline" texto={plural(resumo.candidatos.length, "colega novo", "colegas novos")} palette={palette} />
        <Selo icone="shield-account-outline" texto={plural(resumo.guildas.length, "guilda", "guildas")} palette={palette} />
      </>
    );
    acoes = (
      <>
        <Botao rotulo="Encontrar colegas" icone="account-search-outline" onPress={() => onIr("encontrar")} palette={palette} />
        <Botao rotulo="Guildas" icone="shield-account-outline" onPress={() => onIr("guildas")} palette={palette} secundario />
      </>
    );
  } else {
    arte = <CenaDoPerfil profile={perfil} palette={palette} objeto={journeyObjects.trophy} />;
    titulo = "Evento e missões";
    texto = "Cumpra as missões do dia e acompanhe o evento da turma. Cada uma rende recompensa.";
    selos = (
      <>
        <Selo icone="calendar-star" texto="Evento da turma" palette={palette} />
        <Selo icone="flag-checkered" texto="Missões do dia" palette={palette} />
      </>
    );
    acoes = <Botao rotulo="Ver missões" icone="flag-checkered" onPress={() => onIr("evento")} palette={palette} />;
  }

  return (
    <View style={[s.destaque, { backgroundColor: palette.surface, borderColor: palette.accent, shadowColor: palette.accent }]}>
      {arte}
      <View style={[s.fita, { backgroundColor: palette.background, borderColor: palette.accent }]}>
        <MaterialCommunityIcons name={getBrainHexConfig(perfil).icon} size={14} color={palette.accent} />
        <Text style={[s.fitaTexto, { color: palette.accent }]}>PARA {rotuloPerfil.toLocaleUpperCase("pt-BR")}</Text>
      </View>
      <View style={s.corpo}>
        <Text accessibilityRole="header" style={[s.tituloDestaque, { color: palette.text }]}>{titulo}</Text>
        <Text style={[s.texto, { color: palette.textMuted }]}>{texto}</Text>
        <View style={s.selos}>{selos}</View>
        <View style={s.acoes}>{acoes}</View>
      </View>
    </View>
  );
}

/** Ícone e nome de cada aba de página do celular. O evento é bloco da Arena, não aba. */
export const ABA_DA_AREA: Record<AbaDoSocial, { icone: Icone; rotulo: string }> = {
  arena: { icone: "sword-cross", rotulo: "Arena" },
  conversa: { icone: "forum-outline", rotulo: "Conversa" },
  descobrir: { icone: "compass-outline", rotulo: "Descobrir" },
};

/**
 * Abas de página, como as do perfil do Instagram: ícone e nome em partes iguais, a ativa na cor
 * do perfil com o traço embaixo. Trocam a página inteira em vez de rolar até uma âncora.
 */
export function AbasDoSocial({ abas, ativa, palette, contagem, onTrocar }: { abas: AbaDoSocial[]; ativa: AbaDoSocial; palette: ProfileShellPalette; contagem: Partial<Record<AbaDoSocial, number>>; onTrocar: (aba: AbaDoSocial) => void }) {
  return (
    <View accessibilityRole="tablist" style={[s.abas, { borderBottomColor: palette.border, backgroundColor: palette.background }]}>
      {abas.map((area) => {
        const ativo = area === ativa;
        const { icone, rotulo } = ABA_DA_AREA[area];
        const n = contagem[area] ?? 0;
        return (
          <Pressable key={area} onPress={() => onTrocar(area)} accessibilityRole="tab" accessibilityState={{ selected: ativo }} accessibilityLabel={n ? `${rotulo}, ${n} pendentes` : rotulo} style={s.aba}>
            <View>
              <MaterialCommunityIcons name={icone} size={22} color={ativo ? palette.accent : palette.textSubtle} />
              {n ? (
                <View style={[s.abaBolinha, { backgroundColor: palette.accent, borderColor: palette.background }]}>
                  <Text style={[s.abaBolinhaTexto, { color: palette.background }]}>{n > 9 ? "9+" : n}</Text>
                </View>
              ) : null}
            </View>
            <Text numberOfLines={1} style={[s.abaRotulo, { color: ativo ? palette.accent : palette.textSubtle }]}>{rotulo}</Text>
            <View style={[s.abaTraco, { backgroundColor: ativo ? palette.accent : "transparent" }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Fileira de "stories": os amigos e depois os colegas da turma (online primeiro em cada grupo),
 * cada um na moldura do próprio perfil, e no fim o atalho para encontrar colegas. Tocar no rosto
 * abre a conversa, como no Instagram; a aba já deixava conversar com colega que não é amigo.
 * A tela só desenha a fileira quando há alguém nela: sozinho, o "Encontrar" repetiria a aba
 * Descobrir e ocuparia a altura de uma fileira inteira.
 */
export function SocialStories({ amigos, colegas = [], palette, onConversar, onEncontrar }: { amigos: SocialPerson[]; colegas?: SocialPerson[]; palette: ProfileShellPalette; onConversar: (p: SocialPerson) => void; onEncontrar: () => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.stories}>
      {[...onlinePrimeiro(amigos), ...onlinePrimeiro(colegas)].map((p) => {
        const nome = p.apelido || p.nome;
        return (
          <Pressable key={p.alunoId} onPress={() => onConversar(p)} accessibilityRole="button" accessibilityLabel={`Conversar com ${nome}${p.online ? ", online" : ""}`} style={s.story}>
            <View>
              <FramedProfileImage profile={normalizeBrainHexProfile(p.perfilAtivo)} source={p.fotoUrl ? { uri: p.fotoUrl } : undefined} size={48} />
              {p.online ? <View style={[s.storyOnline, { borderColor: palette.background }]} /> : null}
            </View>
            <Text numberOfLines={1} style={[s.storyNome, { color: palette.textMuted }]}>{nome.split(" ")[0]}</Text>
          </Pressable>
        );
      })}
      <Pressable onPress={onEncontrar} accessibilityRole="button" accessibilityLabel="Encontrar colegas" style={s.story}>
        <View style={[s.storyNovo, { borderColor: palette.accent, backgroundColor: palette.accentMuted }]}>
          <MaterialCommunityIcons name="account-plus-outline" size={22} color={palette.accent} />
        </View>
        <Text numberOfLines={1} style={[s.storyNome, { color: palette.textMuted }]}>Encontrar</Text>
      </Pressable>
    </ScrollView>
  );
}

/**
 * Título de bloco: ícone do bloco num selo da cor do perfil, nome em serifa e o contador.
 * `atalho` põe à direita um botão para um bloco vizinho (na Arena, o evento da turma, que também
 * é disputa), com ícone e rótulo; com a folga do `hitSlop` o alvo passa de 44 pt.
 */
export function TituloDoBloco({ ancora, titulo, contagem, palette, atalho }: { ancora: AncoraDoSocial; titulo: string; contagem?: number; palette: ProfileShellPalette; atalho?: { ancora: AncoraDoSocial; rotulo: string; onPress: () => void } }) {
  return (
    <View style={s.tituloBloco}>
      <View style={[s.tituloBlocoIcone, { backgroundColor: palette.accentSoft, borderColor: palette.border }]}>
        <MaterialCommunityIcons name={ICONE_DA_ANCORA[ancora]} size={18} color={palette.accent} />
      </View>
      <Text accessibilityRole="header" style={[s.tituloBlocoTexto, { color: palette.text }]}>{titulo}</Text>
      {contagem ? <Text style={[s.tituloBlocoContagem, { color: palette.text, backgroundColor: palette.surfaceElevated }]}>{contagem}</Text> : null}
      {atalho ? (
        <Pressable onPress={atalho.onPress} accessibilityRole="button" accessibilityLabel={atalho.rotulo} hitSlop={6} style={[s.tituloBlocoAtalho, { borderColor: palette.accent, backgroundColor: palette.accentMuted }]}>
          <MaterialCommunityIcons name={ICONE_DA_ANCORA[atalho.ancora]} size={18} color={palette.accent} />
          <Text numberOfLines={1} style={[s.tituloBlocoAtalhoTexto, { color: palette.accent }]}>{atalho.rotulo}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  destaque: { borderWidth: 1.5, borderRadius: 20, overflow: "hidden", shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  arte: { width: "100%", overflow: "hidden", justifyContent: "flex-end" },
  arteImagem: { opacity: 0.95 },
  halo: { position: "absolute", alignSelf: "center", opacity: 0.9 },
  lutador: { position: "absolute", bottom: 0 },
  vs: { position: "absolute", alignSelf: "center", width: 52, height: 52, borderRadius: 26, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  vsTexto: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 18, letterSpacing: 1 },
  objetoDaCena: { position: "absolute", right: 14, top: 12 },
  rostosNaCena: { paddingHorizontal: 16, paddingBottom: 10 },
  rostos: { flexDirection: "row", alignItems: "center" },
  rosto: { borderWidth: 2, borderRadius: 26, width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  rostoResto: { borderRadius: 24 },
  rostoRestoTexto: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "800" },
  pontoOnline: { position: "absolute", right: 0, bottom: 0, width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
  fita: { position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  fitaTexto: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  corpo: { padding: 16, paddingTop: 4, gap: 10 },
  tituloDestaque: { fontFamily: FontFamily.inikaBold, fontSize: 24 },
  texto: { fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 21 },
  selos: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  selo: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  seloTexto: { fontFamily: FontFamily.interMedium, fontSize: 12, fontWeight: "600" },
  acoes: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  botao: { flexGrow: 1, flexBasis: 200, minHeight: 48, borderRadius: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 15, fontWeight: "800", flexShrink: 1 },
  abas: { flexDirection: "row", borderBottomWidth: 1 },
  aba: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "flex-end", gap: 2, paddingTop: 6 },
  abaRotulo: { fontFamily: FontFamily.interMedium, fontSize: 11.5, fontWeight: "700" },
  abaTraco: { alignSelf: "stretch", height: 2.5, borderRadius: 2, marginHorizontal: 14, marginTop: 3 },
  abaBolinha: { position: "absolute", top: -5, right: -12, minWidth: 18, height: 18, borderRadius: 9, borderWidth: 1.5, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  abaBolinhaTexto: { fontFamily: FontFamily.interMedium, fontSize: 10, fontWeight: "800" },
  stories: { gap: 10, paddingTop: 4, paddingBottom: 8, paddingRight: 8 },
  story: { width: 56, alignItems: "center", gap: 3 },
  storyOnline: { position: "absolute", right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, backgroundColor: ONLINE },
  storyNovo: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  storyNome: { fontFamily: FontFamily.interMedium, fontSize: 11, maxWidth: 56 },
  tituloBloco: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 4, marginBottom: 10 },
  tituloBlocoIcone: { width: 32, height: 32, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  tituloBlocoTexto: { fontFamily: FontFamily.inikaBold, fontSize: 19, flexShrink: 1 },
  tituloBlocoContagem: { fontFamily: FontFamily.interMedium, fontSize: 12, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: "hidden" },
  tituloBlocoAtalho: { marginLeft: "auto", minHeight: 38, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12 },
  tituloBlocoAtalhoTexto: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
});
