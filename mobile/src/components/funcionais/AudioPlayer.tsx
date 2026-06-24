import { resolveSupabaseStorageUrl } from "@/utils/supabaseStorage";
import { Ionicons } from "@expo/vector-icons";
import { Audio, AVPlaybackStatus } from "expo-av";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
}: Props) {
  const sourceUrl = String(url ?? "").trim();
  const soundRef = useRef<Audio.Sound | null>(null);
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
      void unloadSound();
    };
  }, [unloadSound]);

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
          }
        );

        soundRef.current = sound;
        setPlayback(normalizePlaybackStatus(status));
        sound.setOnPlaybackStatusUpdate((nextStatus) => {
          const normalized = normalizePlaybackStatus(nextStatus);
          setPlayback(normalized);
          if (nextStatus.isLoaded && nextStatus.didJustFinish) {
            void sound.setPositionAsync(0);
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
    [playbackUrl]
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
    await sound.playAsync();
  }, [ensureSound]);

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
          <View style={styles.titleRow}>
            <View style={styles.iconBadge}>
              <Ionicons name="musical-notes-outline" size={16} color="#6A5FFD" />
            </View>
            <Text numberOfLines={1} style={styles.title}>
              {title}
            </Text>
          </View>

          <Pressable
            onPress={() => openExternalUrl(playbackUrl)}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Abrir áudio"
          >
            <Ionicons name="open-outline" size={18} color="#d8d8ff" />
          </Pressable>
        </View>

        {resolveError ? <Text style={styles.warningText}>{resolveError}</Text> : null}

        <View style={styles.audioShell}>
          <audio
            controls
            preload="metadata"
            src={playbackUrl}
            style={{ width: "100%" }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="musical-notes-outline" size={16} color="#6A5FFD" />
          </View>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
        </View>

        {playbackUrl ? (
          <Pressable
            onPress={() => openExternalUrl(playbackUrl)}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Abrir áudio"
          >
            <Ionicons name="open-outline" size={18} color="#d8d8ff" />
          </Pressable>
        ) : null}
      </View>

      {resolveError ? <Text style={styles.warningText}>{resolveError}</Text> : null}

      <View style={styles.audioShell}>
        <View style={styles.playerRow}>
          <Pressable
            onPress={() => void handleTogglePlayback()}
            style={[styles.primaryControl, (resolvingUrl || loadingAudio) && styles.controlDisabled]}
            disabled={resolvingUrl || loadingAudio || !playbackUrl}
            accessibilityRole="button"
            accessibilityLabel={playback.isPlaying ? "Pausar áudio" : "Reproduzir áudio"}
          >
            {resolvingUrl || loadingAudio ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons
                name={playback.isPlaying ? "pause" : "play"}
                size={20}
                color="#ffffff"
              />
            )}
          </Pressable>

          <View style={styles.metaColumn}>
            <Text style={styles.metaTitle}>
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

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>

            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(playback.positionMillis)}</Text>
              <Text style={styles.timeText}>
                {playback.durationMillis ? formatTime(playback.durationMillis) : "--:--"}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => void handleRestart()}
            style={[styles.secondaryControl, !playbackUrl && styles.controlDisabled]}
            disabled={!playbackUrl}
            accessibilityRole="button"
            accessibilityLabel="Reiniciar áudio"
          >
            <Ionicons name="refresh-outline" size={18} color="#d8d8ff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 12,
    gap: 8,
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
    backgroundColor: "rgba(106,95,253,0.14)",
    borderWidth: 1,
    borderColor: "rgba(106,95,253,0.22)",
  },
  title: {
    flex: 1,
    color: "#f2f5ff",
    fontSize: 13,
    fontWeight: "700",
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2f3658",
    backgroundColor: "#0f1733",
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
    borderColor: "#2f3658",
    backgroundColor: "#0f1733",
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
    color: "#d8d8ff",
    fontSize: 13,
    fontWeight: "600",
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#1f2b4d",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#6A5FFD",
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  timeText: {
    color: "#98a1c0",
    fontSize: 12,
  },
  primaryControl: {
    width: 46,
    height: 46,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6A5FFD",
  },
  secondaryControl: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2f3658",
    backgroundColor: "#11182f",
  },
  controlDisabled: {
    opacity: 0.5,
  },
});
