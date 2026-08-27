import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { resolveSupabaseStorageUrl } from "@/utils/supabaseStorage";
import { type ImageCue } from "@/utils/audioImageCues";
import { buildContentResumeKey, loadContentResume, saveContentResume } from "@/utils/contentResume";
import { Ionicons } from "@expo/vector-icons";
import { Audio, AVPlaybackStatus } from "expo-av";
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

type Props = {
  url: string;
  title?: string;
  bucketHint?: string | null;
  fallbackText?: string;
  capaUrl?: string;
  imageCues?: ImageCue[];
  progressKey?: string;
};

type PlaybackState = {
  isLoaded: boolean;
  isPlaying: boolean;
  durationMillis: number;
  positionMillis: number;
};

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

function normalizePlaybackStatus(status: AVPlaybackStatus): PlaybackState {
  if (!status.isLoaded) {
    return {
      isLoaded: false,
      isPlaying: false,
      durationMillis: 0,
      positionMillis: 0,
    };
  }

  return {
    isLoaded: true,
    isPlaying: status.isPlaying,
    durationMillis: status.durationMillis ?? 0,
    positionMillis: status.positionMillis ?? 0,
  };
}

export default function AudioPlayer({
  url,
  title = "Áudio",
  bucketHint = "conteudo_aluno",
  fallbackText,
  capaUrl,
  imageCues,
  progressKey,
}: Props) {
  const { usuario } = useUsuario();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfilAtivo, usuario?.perfis]
  );
  const sourceUrl = String(url ?? "").trim();
  const soundRef = useRef<Audio.Sound | null>(null);
  const resumePositionRef = useRef(0);
  const resumeLoadRef = useRef<Promise<number>>(Promise.resolve(0));
  const lastPersistedAtRef = useRef(0);
  const progressWidthRef = useRef(1);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(
    isHttpUrl(sourceUrl) ? sourceUrl : null
  );
  const [resolvingUrl, setResolvingUrl] = useState(Boolean(sourceUrl));
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playback, setPlayback] = useState<PlaybackState>({
    isLoaded: false,
    isPlaying: false,
    durationMillis: 0,
    positionMillis: 0,
  });
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
      if (soundRef.current) void soundRef.current.setPositionAsync(resumePositionRef.current);
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
    if (!imageCues || imageCues.length === 0) return capaUrl;
    const positionSec = playback.positionMillis / 1000;
    let selected = imageCues[0].imageUrl;
    for (const cue of imageCues) {
      if (cue.startSec <= positionSec) selected = cue.imageUrl;
      else break;
    }
    return selected;
  }, [imageCues, playback.positionMillis, capaUrl]);

  const unloadSound = useCallback(async () => {
    const currentSound = soundRef.current;
    soundRef.current = null;

    if (!currentSound) return;

    currentSound.setOnPlaybackStatusUpdate(null);
    try {
      await currentSound.unloadAsync();
    } catch {}
  }, []);

  useEffect(() => {
    let active = true;

    if (!sourceUrl) {
      setResolvedUrl(null);
      setResolvingUrl(false);
      setResolveError(null);
      setFailed(false);
      setPlayback({
        isLoaded: false,
        isPlaying: false,
        durationMillis: 0,
        positionMillis: 0,
      });
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
        if (shouldPlay) {
          await soundRef.current.playAsync();
        }
        return soundRef.current;
      }

      setLoadingAudio(true);
      setFailed(false);

      try {
        const restoredPosition = await resumeLoadRef.current;
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });

        const { sound, status } = await Audio.Sound.createAsync(
          { uri: playbackUrl },
          {
            shouldPlay,
            progressUpdateIntervalMillis: 350,
            positionMillis: restoredPosition,
          }
        );

        soundRef.current = sound;
        setPlayback(normalizePlaybackStatus(status));
        sound.setOnPlaybackStatusUpdate((nextStatus) => {
          const normalized = normalizePlaybackStatus(nextStatus);
          setPlayback(normalized);
          if (nextStatus.isLoaded && nextStatus.didJustFinish) {
            persistPosition(0);
            void sound.setPositionAsync(0);
          } else if (nextStatus.isLoaded) {
            resumePositionRef.current = normalized.positionMillis;
            const now = Date.now();
            if (!normalized.isPlaying || now - lastPersistedAtRef.current >= 2000) {
              lastPersistedAtRef.current = now;
              persistPosition(normalized.positionMillis);
            }
          }
        });

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
      await soundRef.current.pauseAsync();
      return;
    }

    await soundRef.current.playAsync();
  }, [ensureSound, playback.isPlaying, playbackUrl]);

  const handleRestart = useCallback(async () => {
    const sound = await ensureSound(false);
    if (!sound) return;
    await sound.setPositionAsync(0);
    persistPosition(0);
    await sound.playAsync();
  }, [ensureSound, persistPosition]);

  const seekToRatio = useCallback(async (ratio: number, persist = false) => {
    const duration = playback.durationMillis;
    if (!duration) return;
    const nextPosition = Math.max(0, Math.min(duration, Math.round(duration * ratio)));
    setPlayback((current) => ({ ...current, positionMillis: nextPosition }));
    resumePositionRef.current = nextPosition;
    const sound = await ensureSound(false);
    await sound?.setPositionAsync(nextPosition);
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

  if (Platform.OS === "web" && playbackUrl) {
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

          <Pressable
            onPress={() => openExternalUrl(playbackUrl)}
            style={[styles.iconButton, { borderColor: palette.border, backgroundColor: palette.surface }]}
            accessibilityRole="button"
            accessibilityLabel="Abrir áudio"
          >
            <Ionicons name="open-outline" size={18} color={palette.textMuted} />
          </Pressable>
        </View>

        {resolveError ? <Text style={styles.warningText}>{resolveError}</Text> : null}

        <View style={[styles.audioShell, { borderColor: palette.border, backgroundColor: palette.surface }]}>
          <audio
            controls
            preload="metadata"
            src={playbackUrl}
            style={{ width: "100%" }}
            onLoadedMetadata={(event: any) => {
              event.currentTarget.currentTime = resumePositionRef.current / 1000;
            }}
            onTimeUpdate={(event: any) => {
              const position = Math.round(Number(event.currentTarget.currentTime || 0) * 1000);
              resumePositionRef.current = position;
              const now = Date.now();
              if (now - lastPersistedAtRef.current >= 2000) {
                lastPersistedAtRef.current = now;
                persistPosition(position);
              }
            }}
            onPause={(event: any) => persistPosition(Number(event.currentTarget.currentTime || 0) * 1000)}
            onEnded={() => persistPosition(0)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        {capaUrl ? (
          <Image source={{ uri: capaUrl }} style={styles.coverImage} accessibilityIgnoresInvertColors />
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
                pointerEvents="none"
                style={[styles.progressThumb, { left: `${progress * 100}%`, backgroundColor: palette.accent }]}
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
    fontSize: 13,
    fontWeight: "700",
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
    fontSize: 13,
    fontWeight: "600",
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
    fontSize: 12,
  },
  primaryControl: {
    width: 46,
    height: 46,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
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
