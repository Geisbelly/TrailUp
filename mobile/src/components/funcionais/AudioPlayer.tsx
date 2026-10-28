import { getBrainHexGuideName } from "@/constants/profileImages";
import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { resolveSupabaseStorageUrl } from "@/utils/supabaseStorage";
import { type ImageCue } from "@/utils/audioImageCues";
import { buildContentResumeKey, loadContentResume, saveContentResume } from "@/utils/contentResume";
import { Ionicons } from "@expo/vector-icons";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import {
  criarTocadorDeAudioWeb,
  type TocadorDeAudioMinimo as TocadorDeAudio,
} from "@/utils/tocadorDeAudioWeb";

import {
  AUDIO_PARADO,
  estadoDeAudio,
  segundosDeMillis,
  type EstadoDeReproducao,
} from "@/utils/estadoDeAudio";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { perfilVisualDoAluno } from "@/utils/brainHex";
import { proximaVelocidade, rotuloVelocidade } from "@/utils/velocidadeAudio";

type Props = {
  url: string;
  title?: string;
  bucketHint?: string | null;
  fallbackText?: string;
  capaUrl?: string;
  imageCues?: ImageCue[];
  progressKey?: string;
  /**
   * Perfil BrainHex para o qual ESTE áudio foi gerado (`brainhex_profile_key` no metadata do
   * bloco). Não é o perfil da tela: a pele é o `perfilAtivo`, que o aluno escolhe entre os
   * representativos dele, enquanto o áudio foi narrado pelo guardião do perfil do material.
   * Normalmente são o mesmo; quando não são, quem narrou não muda por causa da escolha de pele.
   *
   * Ausente em áudio do professor — e aí não há guardião nenhum a creditar.
   */
  perfilDoMaterial?: string | null;
};

/**
 * O estado vem de `@/utils/estadoDeAudio`, e não é só reuso: o `expo-audio` reporta
 * `currentTime`/`duration` em SEGUNDOS, enquanto este componente todo trabalha em
 * milissegundos. A conversão fica num lugar só, com teste, porque errar o fator 1000 não quebra
 * nada visivelmente — a barra fica parada e a retomada grava a posição errada.
 */
type PlaybackState = EstadoDeReproducao;

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function formatTime(value: number) {
  const totalSeconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function openExternalUrl(url?: string | null) {
  if (!url) return;
  Linking.openURL(url).catch(() => null);
}

export default function AudioPlayer({
  url,
  title = "Áudio",
  bucketHint = "conteudo_aluno",
  fallbackText,
  capaUrl,
  imageCues,
  progressKey,
  perfilDoMaterial,
}: Props) {
  const { usuario } = useUsuario();
  const palette = useMemo(
    () => getProfileShellPalette(perfilVisualDoAluno(usuario)),
    [usuario]
  );
  // Quem narra é o guardião do perfil do MATERIAL, não o da pele escolhida. Ver `perfilDoMaterial`.
  const guiaQueNarra = useMemo(
    () => (perfilDoMaterial ? getBrainHexGuideName(perfilDoMaterial) : null),
    [perfilDoMaterial]
  );
  const sourceUrl = String(url ?? "").trim();
  const soundRef = useRef<TocadorDeAudio | null>(null);
  // A assinatura do listener tem de ser guardada: `expo-audio` não tem o
  // `setOnPlaybackStatusUpdate(null)` do `expo-av`, e listener que sobrevive ao player chama
  // `setPlayback` depois de a tela sair.
  const statusSubRef = useRef<{ remove: () => void } | null>(null);
  const resumePositionRef = useRef(0);
  const resumeLoadRef = useRef<Promise<number>>(Promise.resolve(0));
  const lastPersistedAtRef = useRef(0);
  const progressWidthRef = useRef(1);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(
    isHttpUrl(sourceUrl) ? sourceUrl : null
  );
  const [resolvingUrl, setResolvingUrl] = useState(Boolean(sourceUrl));
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolvedCoverUrl, setResolvedCoverUrl] = useState<string | null>(null);
  const [resolvedCueUrls, setResolvedCueUrls] = useState<ImageCue[]>([]);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [failed, setFailed] = useState(false);
  const [velocidade, setVelocidade] = useState(1);
  // O tocador é criado num callback; a ref deixa ele nascer na velocidade escolhida.
  const velocidadeRef = useRef(1);
  velocidadeRef.current = velocidade;
  const [playback, setPlayback] = useState<PlaybackState>(AUDIO_PARADO);
  const resumeStorageKey = useMemo(
    () => buildContentResumeKey(usuario?.id, "audio", progressKey ?? sourceUrl),
    [progressKey, sourceUrl, usuario?.id]
  );

  const persistPosition = useCallback(
    (positionMillis: number) => {
      const safePosition = Math.max(0, Math.round(positionMillis));
      resumePositionRef.current = safePosition;
      void saveContentResume(resumeStorageKey, { positionMillis: safePosition });
    },
    [resumeStorageKey]
  );

  useEffect(() => {
    let active = true;
    resumePositionRef.current = 0;
    const request = loadContentResume(resumeStorageKey).then((saved) => {
      const restored = Math.max(0, saved?.positionMillis ?? 0);
      if (!active) return;
      resumePositionRef.current = restored;
      setPlayback((current) => ({ ...current, positionMillis: resumePositionRef.current }));
      if (soundRef.current) void soundRef.current.seekTo(segundosDeMillis(resumePositionRef.current));
      return restored;
    });
    resumeLoadRef.current = request.then((value) => value ?? 0);
    return () => { active = false; };
  }, [resumeStorageKey]);

  // Troca a imagem exibida conforme a posicao de reproducao cruza os cues
  // (minutagem ESTIMADA por proporcao de texto, ver computeImageCues no
  // microservice - nao e um corte real no audio). Sem cues, cai pra capaUrl
  // estatica (comportamento do D2 preservado).
  const displayedImageUrl = useMemo(() => {
    if (!resolvedCueUrls.length) return resolvedCoverUrl;
    const positionSec = playback.positionMillis / 1000;
    let selected = resolvedCueUrls[0].imageUrl;
    for (const cue of resolvedCueUrls) {
      if (cue.startSec <= positionSec) selected = cue.imageUrl;
      else break;
    }
    return selected;
  }, [playback.positionMillis, resolvedCoverUrl, resolvedCueUrls]);

  useEffect(() => {
    let active = true;
    setResolvedCoverUrl(null);
    setResolvedCueUrls([]);
    const resolveVisuals = async () => {
      if (capaUrl) {
        try {
          const cover = await resolveSupabaseStorageUrl(capaUrl, { bucket: bucketHint });
          if (active) setResolvedCoverUrl(cover);
        } catch {}
      }
      if (imageCues?.length) {
        const cues = await Promise.all(imageCues.map(async (cue) => {
          try { return { ...cue, imageUrl: await resolveSupabaseStorageUrl(cue.imageUrl, { bucket: bucketHint }) }; }
          catch { return cue; }
        }));
        if (active) setResolvedCueUrls(cues);
      }
    };
    void resolveVisuals();
    return () => { active = false; };
  }, [bucketHint, capaUrl, imageCues]);

  const unloadSound = useCallback(async () => {
    const currentSound = soundRef.current;
    soundRef.current = null;

    if (!currentSound) return;

    statusSubRef.current?.remove();
    statusSubRef.current = null;
    try {
      currentSound.remove();
    } catch {}
  }, []);

  useEffect(() => {
    let active = true;

    if (!sourceUrl) {
      setResolvedUrl(null);
      setResolvingUrl(false);
      setResolveError(null);
      setFailed(false);
      setPlayback(AUDIO_PARADO);
      return () => {
        active = false;
      };
    }

    setResolvedUrl(isHttpUrl(sourceUrl) ? sourceUrl : null);
    setResolvingUrl(true);
    setResolveError(null);
    setFailed(false);
    setPlayback({
      isLoaded: false,
      isPlaying: false,
      durationMillis: 0,
      positionMillis: 0,
    });
    void unloadSound();

    resolveSupabaseStorageUrl(sourceUrl, { bucket: bucketHint })
      .then((nextUrl) => {
        if (!active) return;
        setResolvedUrl(nextUrl);
      })
      .catch((error) => {
        if (!active) return;
        setResolvedUrl(isHttpUrl(sourceUrl) ? sourceUrl : null);
        setResolveError(
          error instanceof Error
            ? error.message
            : "Não foi possível preparar a URL do áudio."
        );
      })
      .finally(() => {
        if (!active) return;
        setResolvingUrl(false);
      });

    return () => {
      active = false;
    };
  }, [bucketHint, sourceUrl, unloadSound]);

  useEffect(() => {
    return () => {
      persistPosition(resumePositionRef.current);
      void unloadSound();
    };
  }, [persistPosition, unloadSound]);

  const playbackUrl = resolvedUrl;

  const ensureSound = useCallback(
    async (shouldPlay: boolean) => {
      if (!playbackUrl) return null;

      if (soundRef.current) {
        // `play()` do `expo-audio` é síncrono (o `expo-av` devolvia Promise).
        if (shouldPlay) soundRef.current.play();
        return soundRef.current;
      }

      setLoadingAudio(true);
      setFailed(false);

      try {
        const restoredPosition = await resumeLoadRef.current;
        // Os nomes do modo de áudio mudaram no `expo-audio` (`allowsRecordingIOS` ->
        // `allowsRecording`, `playsInSilentModeIOS` -> `playsInSilentMode`,
        // `staysActiveInBackground` -> `shouldPlayInBackground`, `shouldDuckAndroid` ->
        // `interruptionMode`). Chave antiga é ignorada em silêncio, então tocar com a tela
        // bloqueada ou em modo silencioso pararia de funcionar sem erro nenhum.
        // O modo de áudio é do aparelho: silencioso, gravação, segundo plano, duck. Na web nada
        // disso existe — quem decide é o navegador — e o ramo web do `expo-audio` não é usado
        // aqui, então chamar isto só adicionaria um await que pode rejeitar à toa.
        if (Platform.OS !== "web") {
          await setAudioModeAsync({
            allowsRecording: false,
            playsInSilentMode: true,
            shouldPlayInBackground: false,
            interruptionMode: "duckOthers",
          });
        }

        // `createAudioPlayer` é síncrono e carrega em segundo plano — não há mais um `status`
        // inicial para semear a tela. Quem preenche é o listener abaixo; até lá o estado fica
        // `AUDIO_PARADO`, que é o mesmo que o `expo-av` reportava enquanto `isLoaded` era falso.
        // Na web o tocador é o `<audio>` do HTML por trás do mesmo contrato (ver
        // `tocadorDeAudioWeb`): a tela acima é uma só, no padrão do sistema, nas duas
        // plataformas.
        const sound: TocadorDeAudio =
          Platform.OS === "web"
            ? criarTocadorDeAudioWeb(playbackUrl)
            : createAudioPlayer({ uri: playbackUrl }, { updateInterval: 350 });
        soundRef.current = sound;
        // O tocador nasce em 1×: reaplica a velocidade que o aluno já escolheu.
        if (velocidadeRef.current !== 1) sound.setPlaybackRate(velocidadeRef.current);

        if (restoredPosition > 0) {
          try {
            await sound.seekTo(segundosDeMillis(restoredPosition));
          } catch {}
        }

        statusSubRef.current = sound.addListener("playbackStatusUpdate", (nextStatus) => {
          const normalized = estadoDeAudio(nextStatus);
          setPlayback(normalized);
          if (nextStatus.isLoaded && nextStatus.didJustFinish) {
            persistPosition(0);
            void sound.seekTo(0);
          } else if (nextStatus.isLoaded) {
            resumePositionRef.current = normalized.positionMillis;
            const now = Date.now();
            if (!normalized.isPlaying || now - lastPersistedAtRef.current >= 2000) {
              lastPersistedAtRef.current = now;
              persistPosition(normalized.positionMillis);
            }
          }
        });

        if (shouldPlay) sound.play();

        return sound;
      } catch {
        setFailed(true);
        return null;
      } finally {
        setLoadingAudio(false);
      }
    },
    [persistPosition, playbackUrl]
  );

  const handleTogglePlayback = useCallback(async () => {
    if (!playbackUrl) return;

    if (!soundRef.current) {
      await ensureSound(true);
      return;
    }

    if (playback.isPlaying) {
      soundRef.current.pause();
      return;
    }

    soundRef.current.play();
  }, [ensureSound, playback.isPlaying, playbackUrl]);

  const trocarVelocidade = useCallback(() => {
    const proxima = proximaVelocidade(velocidade);
    setVelocidade(proxima);
    soundRef.current?.setPlaybackRate(proxima);
  }, [velocidade]);

  const handleRestart = useCallback(async () => {
    const sound = await ensureSound(false);
    if (!sound) return;
    await sound.seekTo(0);
    persistPosition(0);
    sound.play();
  }, [ensureSound, persistPosition]);

  const seekToRatio = useCallback(async (ratio: number, persist = false) => {
    const duration = playback.durationMillis;
    if (!duration) return;
    const nextPosition = Math.max(0, Math.min(duration, Math.round(duration * ratio)));
    setPlayback((current) => ({ ...current, positionMillis: nextPosition }));
    resumePositionRef.current = nextPosition;
    const sound = await ensureSound(false);
    await sound?.seekTo(segundosDeMillis(nextPosition));
    if (persist) persistPosition(nextPosition);
  }, [ensureSound, persistPosition, playback.durationMillis]);

  const seekFromLocation = useCallback((locationX: number, commit = false) => {
    const ratio = locationX / Math.max(1, progressWidthRef.current);
    const safeRatio = Math.max(0, Math.min(1, ratio));
    if (commit) {
      void seekToRatio(safeRatio, true);
      return;
    }
    const nextPosition = Math.round(playback.durationMillis * safeRatio);
    resumePositionRef.current = nextPosition;
    setPlayback((current) => ({ ...current, positionMillis: nextPosition }));
  }, [playback.durationMillis, seekToRatio]);

  const progress = useMemo(() => {
    if (!playback.durationMillis) return 0;
    return Math.max(
      0,
      Math.min(1, playback.positionMillis / Math.max(1, playback.durationMillis))
    );
  }, [playback.durationMillis, playback.positionMillis]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        {displayedImageUrl ? (
          <Image source={{ uri: displayedImageUrl }} style={styles.coverImage} accessibilityIgnoresInvertColors />
        ) : null}
        <View style={styles.titleRow}>
          <View
            style={[
              styles.iconBadge,
              { backgroundColor: palette.accentMuted, borderColor: palette.border },
            ]}
          >
            <Ionicons name="musical-notes-outline" size={16} color={palette.accent} />
          </View>
          <Text numberOfLines={1} style={[styles.title, { color: palette.text }]}>
            {title}
          </Text>
        </View>

        {playbackUrl ? (
          <Pressable
            onPress={() => openExternalUrl(playbackUrl)}
            style={[styles.iconButton, { borderColor: palette.border, backgroundColor: palette.surface }]}
            accessibilityRole="button"
            accessibilityLabel="Abrir áudio"
          >
            <Ionicons name="open-outline" size={18} color={palette.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {resolveError ? <Text style={styles.warningText}>{resolveError}</Text> : null}

      <View style={[styles.audioShell, { borderColor: palette.border, backgroundColor: palette.surface }]}>
        <View style={styles.playerRow}>
          <Pressable
            onPress={() => void handleTogglePlayback()}
            style={[
              styles.primaryControl,
              { backgroundColor: palette.accent },
              (resolvingUrl || loadingAudio) && styles.controlDisabled,
            ]}
            disabled={resolvingUrl || loadingAudio || !playbackUrl}
            accessibilityRole="button"
            accessibilityLabel={playback.isPlaying ? "Pausar áudio" : "Reproduzir áudio"}
          >
            {resolvingUrl || loadingAudio ? (
              <ActivityIndicator size="small" color={palette.background} />
            ) : (
              <Ionicons
                name={playback.isPlaying ? "pause" : "play"}
                size={20}
                color={palette.background}
              />
            )}
          </Pressable>

          <View style={styles.metaColumn}>
            <Text style={[styles.metaTitle, { color: palette.text }]}>
              {failed
                ? "Não foi possível reproduzir o áudio."
                : resolvingUrl
                ? "Preparando áudio..."
                : playback.isPlaying
                ? "Reproduzindo"
                : playback.isLoaded
                ? "Pronto para ouvir"
                : "Áudio disponível"}
            </Text>

            <View
              style={[styles.progressTrack, { backgroundColor: palette.progressTrack }]}
              onLayout={(event) => { progressWidthRef.current = event.nativeEvent.layout.width; }}
              onStartShouldSetResponder={() => Boolean(playback.durationMillis)}
              onMoveShouldSetResponder={() => Boolean(playback.durationMillis)}
              onResponderGrant={(event) => seekFromLocation(event.nativeEvent.locationX)}
              onResponderMove={(event) => seekFromLocation(event.nativeEvent.locationX)}
              onResponderRelease={(event) => seekFromLocation(event.nativeEvent.locationX, true)}
              accessibilityRole="adjustable"
              accessibilityLabel="Posição do áudio"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            >
              <View
                style={[
                  styles.progressFill,
                  { width: `${progress * 100}%`, backgroundColor: palette.accent },
                ]}
              />
              <View
                style={[styles.progressThumb, { left: `${progress * 100}%`, backgroundColor: palette.accent, pointerEvents: "none" }]}
              />
            </View>

            <View style={styles.timeRow}>
              <Text style={[styles.timeText, { color: palette.textSubtle }]}>
                {formatTime(playback.positionMillis)}
              </Text>
              <Text style={[styles.timeText, { color: palette.textSubtle }]}>
                {playback.durationMillis ? formatTime(playback.durationMillis) : "--:--"}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={trocarVelocidade}
            style={styles.speedControl}
            accessibilityRole="button"
            accessibilityLabel={`Velocidade ${rotuloVelocidade(velocidade)}. Toque para mudar`}
          >
            <Text style={[styles.speedText, { color: palette.textMuted }]}>{rotuloVelocidade(velocidade)}</Text>
          </Pressable>

          <Pressable
            onPress={() => void handleRestart()}
            style={[
              styles.secondaryControl,
              { borderColor: palette.border, backgroundColor: palette.surfaceElevated },
              !playbackUrl && styles.controlDisabled,
            ]}
            disabled={!playbackUrl}
            accessibilityRole="button"
            accessibilityLabel="Reiniciar áudio"
          >
            <Ionicons name="refresh-outline" size={18} color={palette.textMuted} />
          </Pressable>
        </View>
      </View>

      {guiaQueNarra ? (
        <View style={styles.narracaoRow}>
          <Ionicons name="mic-outline" size={14} color={palette.accent} />
          <Text style={[styles.narracaoText, { color: palette.textSubtle }]}>
            Narrado por {guiaQueNarra}
          </Text>
        </View>
      ) : null}

      {failed && fallbackText ? (
        <View
          style={[
            styles.fallbackBox,
            { borderColor: palette.border, backgroundColor: palette.surface },
          ]}
        >
          <Text style={[styles.fallbackLabel, { color: palette.textMuted }]}>
            Roteiro do áudio
          </Text>
          <Text style={[styles.fallbackText, { color: palette.text }]}>{fallbackText}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 12,
    gap: 8,
  },
  fallbackBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  fallbackLabel: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  fallbackText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    lineHeight: 21,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  coverImage: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  title: {
    flex: 1,
    fontFamily: FontFamily.inikaBold,
    fontSize: 13,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  warningText: {
    color: "#ffb3b3",
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  audioShell: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  metaColumn: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  metaTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 13,
  },
  progressTrack: {
    height: 14,
    borderRadius: 999,
    justifyContent: "center",
  },
  progressFill: {
    height: 8,
    borderRadius: 999,
  },
  progressThumb: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  timeText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  narracaoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  narracaoText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  primaryControl: {
    width: 46,
    height: 46,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  speedControl: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  speedText: { fontFamily: FontFamily.interMedium, fontSize: 12.5, fontWeight: "700" },
  secondaryControl: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  controlDisabled: {
    opacity: 0.5,
  },
});
