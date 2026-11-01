import { FramedProfileImage } from "@/components/FramedProfileImage";
import { ProfileArtwork } from "@/components/ProfileArtwork";
import { bossVisuals } from "@/constants/bossVisuals";
import { journeyObjects, profileBanners, rankingArenas } from "@/constants/designAssets";
import { normalizeBrainHexProfile, type BrainHexProfile } from "@/constants/brainHexProfiles";
import { brainHexGuideNames, getBrainHexConfig, guardianFullImages } from "@/constants/profileImages";
import type { Guild } from "@/services/social/guildModel";
import type { AncoraDoSocial, AreaDoSocial } from "@/services/social/socialDestaque";
import type { SocialPerson } from "@/services/social/socialModel";
import { FontFamily } from "@/styles/GlobalStyle";
import { bossDoPerfil } from "@/utils/contentBossVisual";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Image, ImageBackground, type ImageSourcePropType, Pressable, StyleSheet, Text, View } from "react-native";

type Icone = keyof typeof MaterialCommunityIcons.glyphMap;

/** Ícone de cada bloco: o mesmo na faixa de atalhos, no título do bloco e no cartão de atalho. */
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
export function ArenaBatalhaArte({ profile, palette, altura = 200 }: { profile: BrainHexProfile; palette: ProfileShellPalette; altura?: number }) {
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
function CenaDoPerfil({ profile, palette, objeto, altura = 150, children }: { profile: BrainHexProfile; palette: ProfileShellPalette; objeto: ImageSourcePropType; altura?: number; children?: React.ReactNode }) {
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
};

/**
 * O cartão grande do topo da aba, com a área que mais combina com o perfil do aluno
 * (`AREA_EM_DESTAQUE`). Só leva aonde a aba já leva: rola até o bloco, abre a conversa do amigo
 * ou a da guilda. Nenhum dado novo: os números saem do que a aba já carregou.
 */
export function SocialHubDestaque({ area, profile, palette, resumo, onIr, onConversar, onAbrirGuilda }: DestaqueProps) {
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
        <View style={s.rostosNaCena}>
          <Rostos pessoas={resumo.amigos} palette={palette} onPress={onConversar} />
        </View>
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

type Atalho = { ancora: AncoraDoSocial; rotulo: string; detalhe: string; alerta?: boolean };

/**
 * Os outros blocos da aba em cartões de atalho (grade de duas colunas). Mostram o número que
 * importa de cada um e rolam até ele, como a faixa de pílulas.
 */
export function SocialHubAtalhos({ ancoras, palette, resumo, onIr }: { ancoras: AncoraDoSocial[]; palette: ProfileShellPalette; resumo: ResumoDoSocial; onIr: (ancora: AncoraDoSocial) => void }) {
  const online = resumo.amigos.filter((p) => p.online).length;
  const convites = resumo.convitesRecebidos + resumo.convitesEnviados;
  const descricao: Record<AncoraDoSocial, Atalho> = {
    evento: { ancora: "evento", rotulo: "Evento", detalhe: "Missões do dia" },
    arena: { ancora: "arena", rotulo: "Arena", detalhe: "Vale Elo" },
    amigos: { ancora: "amigos", rotulo: "Amigos", detalhe: online ? `${online} online` : plural(resumo.amigos.length, "amigo", "amigos") },
    guildas: { ancora: "guildas", rotulo: "Guildas", detalhe: plural(resumo.guildas.length, "na turma", "na turma") },
    convites: { ancora: "convites", rotulo: "Convites", detalhe: resumo.convitesRecebidos ? plural(resumo.convitesRecebidos, "novo", "novos") : plural(convites, "pendente", "pendentes"), alerta: resumo.convitesRecebidos > 0 },
    encontrar: { ancora: "encontrar", rotulo: "Encontrar", detalhe: plural(resumo.candidatos.length, "colega", "colegas") },
    bloqueados: { ancora: "bloqueados", rotulo: "Bloqueados", detalhe: "" },
  };
  const itens = ancoras.filter((a) => a !== "bloqueados").map((a) => descricao[a]);
  if (!itens.length) return null;
  return (
    <View style={s.grade}>
      {itens.map((item) => (
        <Pressable key={item.ancora} onPress={() => onIr(item.ancora)} accessibilityRole="button" accessibilityLabel={`${item.rotulo}, ${item.detalhe}`} style={({ pressed }) => [s.atalho, { backgroundColor: palette.surface, borderColor: item.alerta ? palette.accent : palette.border }, pressed && { backgroundColor: palette.surfaceElevated }]}>
          <View style={s.atalhoTopo}>
            <View style={[s.atalhoIcone, { backgroundColor: palette.accentSoft }]}>
              <MaterialCommunityIcons name={ICONE_DA_ANCORA[item.ancora]} size={20} color={palette.accent} />
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={palette.textSubtle} />
          </View>
          <Text numberOfLines={1} style={[s.atalhoRotulo, { color: palette.text }]}>{item.rotulo}</Text>
          <Text numberOfLines={1} style={[s.atalhoDetalhe, { color: item.alerta ? palette.accent : palette.textSubtle }]}>{item.detalhe}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Título de bloco: ícone do bloco num selo da cor do perfil, nome em serifa e o contador. */
export function TituloDoBloco({ ancora, titulo, contagem, palette }: { ancora: AncoraDoSocial; titulo: string; contagem?: number; palette: ProfileShellPalette }) {
  return (
    <View style={s.tituloBloco}>
      <View style={[s.tituloBlocoIcone, { backgroundColor: palette.accentSoft, borderColor: palette.border }]}>
        <MaterialCommunityIcons name={ICONE_DA_ANCORA[ancora]} size={18} color={palette.accent} />
      </View>
      <Text accessibilityRole="header" style={[s.tituloBlocoTexto, { color: palette.text }]}>{titulo}</Text>
      {contagem ? <Text style={[s.tituloBlocoContagem, { color: palette.text, backgroundColor: palette.surfaceElevated }]}>{contagem}</Text> : null}
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
  grade: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  // Em coluna (ícone em cima): na linha, ícone, texto e seta cortavam o rótulo em 360 pt.
  atalho: { flexGrow: 1, flexBasis: "45%", minHeight: 96, gap: 6, borderWidth: 1, borderRadius: 14, padding: 12 },
  atalhoTopo: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  atalhoIcone: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  atalhoRotulo: { fontFamily: FontFamily.interMedium, fontSize: 14, fontWeight: "700" },
  atalhoDetalhe: { fontFamily: FontFamily.interMedium, fontSize: 12 },
  tituloBloco: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 4, marginBottom: 10 },
  tituloBlocoIcone: { width: 32, height: 32, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  tituloBlocoTexto: { fontFamily: FontFamily.inikaBold, fontSize: 19, flexShrink: 1 },
  tituloBlocoContagem: { fontFamily: FontFamily.interMedium, fontSize: 12, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: "hidden" },
});
