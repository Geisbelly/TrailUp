import { useUsuario } from "@/context/SessaoContext";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { resolveSupabaseStorageUrl } from "@/utils/supabaseStorage";
import { Ionicons } from "@expo/vector-icons";
import { AVPlaybackStatus, ResizeMode, Video as ExpoVideo } from "expo-av";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

type Props = {
  url: string;
  title?: string;
  bucketHint?: string | null;
};

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function getYouTubeId(raw: string) {
  const value = raw.split("#")[0];
  let match = value.match(/[?&]v=([^&]+)/);
  if (match) return match[1];
  match = value.match(/youtu\.be\/([^?]+)/);
  if (match) return match[1];
  match = value.match(/\/embed\/([^?]+)/);
  if (match) return match[1];
  return null;
}

function openExternalUrl(url?: string | null) {
  if (!url) return;
  Linking.openURL(url).catch(() => null);
}

export default function VideoPlayer({
  url,
  title = "Vídeo",
  bucketHint = "conteudo_aluno",
}: Props) {
  const { usuario } = useUsuario();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfis]
  );
  const sourceUrl = String(url ?? "").trim();
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(
    isHttpUrl(sourceUrl) ? sourceUrl : null
  );
  const [resolvingUrl, setResolvingUrl] = useState(Boolean(sourceUrl));
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const videoRef = useRef<ExpoVideo>(null);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSeekControls, setShowSeekControls] = useState(true);
  const hideSeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;

    if (!sourceUrl) {
      setResolvedUrl(null);
      setResolvingUrl(false);
      setResolveError(null);
      setFailed(false);
      return () => {
        active = false;
      };
    }

    setResolvedUrl(isHttpUrl(sourceUrl) ? sourceUrl : null);
    setResolvingUrl(true);
    setResolveError(null);
    setFailed(false);

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
            : "Não foi possível preparar a URL do vídeo."
        );
      })
      .finally(() => {
        if (!active) return;
        setResolvingUrl(false);
      });

    return () => {
      active = false;
    };
  }, [bucketHint, sourceUrl]);

  const seekBy = async (deltaMs: number) => {
    if (!videoRef.current) return;
    try {
      const status = await videoRef.current.getStatusAsync();
      if (!status.isLoaded) return;
      const next = Math.max(0, Math.min(status.durationMillis ?? 0, (status.positionMillis ?? 0) + deltaMs));
      await videoRef.current.setPositionAsync(next);
    } catch {
      // seek errors are non-fatal
    }
  };

  useEffect(() => {
    return () => {
      if (hideSeekTimerRef.current) clearTimeout(hideSeekTimerRef.current);
    };
  }, []);

  const handleVideoAreaTap = () => {
    setShowSeekControls(true);
    if (hideSeekTimerRef.current) clearTimeout(hideSeekTimerRef.current);
    hideSeekTimerRef.current = setTimeout(() => setShowSeekControls(false), 3000);
  };

  const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setPositionMs(status.positionMillis ?? 0);
    setDurationMs(status.durationMillis ?? 0);
    setIsPlaying(status.isPlaying ?? false);
  };

  function formatTime(ms: number) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }

  const playbackUrl = resolvedUrl;
  const isYouTube = useMemo(
    () => Boolean(playbackUrl && /youtu\.be|youtube\.com/i.test(playbackUrl)),
    [playbackUrl]
  );
  const videoId = useMemo(
    () => (playbackUrl && isYouTube ? getYouTubeId(playbackUrl) : null),
    [isYouTube, playbackUrl]
  );

  const renderUnavailable = (fullscreen = false) => (
    <View
      style={[
        styles.feedbackBox,
        fullscreen && styles.feedbackBoxFullscreen,
        { backgroundColor: palette.surface },
      ]}
    >
      {resolvingUrl ? (
        <>
          <ActivityIndicator size="small" color={palette.accent} />
          <Text style={[styles.feedbackText, { color: palette.textMuted }]}>
            Preparando vídeo...
          </Text>
        </>
      ) : (
        <>
          <Ionicons name="alert-circle-outline" size={20} color="#ffb3b3" />
          <Text style={[styles.feedbackText, { color: palette.textMuted }]}>
            {failed
              ? "Não foi possível reproduzir este vídeo nesta tela."
              : "Não foi encontrado um vídeo válido para este bloco."}
          </Text>
          {playbackUrl ? (
            <Pressable
              onPress={() => openExternalUrl(playbackUrl)}
              style={[
                styles.secondaryButton,
                {
                  borderColor: palette.borderStrong,
                  backgroundColor: palette.accentMuted,
                },
              ]}
            >
              <Text style={[styles.secondaryButtonText, { color: palette.text }]}>
                Abrir arquivo
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );

  const renderDirectVideo = (fullscreen = false) => {
    if (!playbackUrl) return renderUnavailable(fullscreen);

    const progressPct = durationMs > 0 ? (positionMs / durationMs) * 100 : 0;

    return (
      <Pressable onPress={handleVideoAreaTap} style={{ flex: 1 }}>
        <ExpoVideo
          ref={videoRef}
          source={{ uri: playbackUrl }}
          style={[
            fullscreen ? styles.nativeVideoFullscreen : styles.nativeVideo,
            { backgroundColor: palette.surface },
          ]}
          resizeMode={ResizeMode.CONTAIN}
          useNativeControls={false}
          allowsExternalPlayback
          shouldPlay={false}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          onError={() => setFailed(true)}
        />
        {showSeekControls && (
          <View style={[seekStyles.overlay, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
            <View style={seekStyles.controls}>
              <Pressable onPress={() => seekBy(-10_000)} style={seekStyles.seekBtn}>
                <Ionicons name="play-back-outline" size={22} color="#fff" />
                <Text style={seekStyles.seekLabel}>10s</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (isPlaying) {
                    videoRef.current?.pauseAsync();
                  } else {
                    videoRef.current?.playAsync();
                  }
                }}
                style={seekStyles.playBtn}
              >
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color="#fff" />
              </Pressable>

              <Pressable onPress={() => seekBy(10_000)} style={seekStyles.seekBtn}>
                <Ionicons name="play-forward-outline" size={22} color="#fff" />
                <Text style={seekStyles.seekLabel}>10s</Text>
              </Pressable>
            </View>

            <View style={seekStyles.progressRow}>
              <Text style={seekStyles.timeText}>{formatTime(positionMs)}</Text>
              <View style={seekStyles.progressTrack}>
                <View style={[seekStyles.progressFill, { width: `${progressPct}%` }]} />
              </View>
              <Text style={seekStyles.timeText}>{formatTime(durationMs)}</Text>
            </View>
          </View>
        )}
      </Pressable>
    );
  };

  const renderEmbeddedVideo = (fullscreen = false) => {
    if (!playbackUrl) return renderUnavailable(fullscreen);

    if (Platform.OS === "web") {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            position: "relative",
            overflow: "hidden",
            borderRadius: fullscreen ? "18px" : "16px",
            background: palette.surface,
          }}
        >
          {isYouTube && videoId ? (
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0&modestbranding=1`}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                border: "none",
              }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              onError={() => setFailed(true)}
            />
          ) : (
            <video
              controls
              playsInline
              src={playbackUrl}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                background: palette.surface,
              }}
              onError={() => setFailed(true)}
            />
          )}
        </div>
      );
    }

    return (
      <WebView
        allowsFullscreenVideo
        javaScriptEnabled
        domStorageEnabled
        mediaPlaybackRequiresUserAction
        source={{
          uri:
            isYouTube && videoId
              ? `https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0&modestbranding=1`
              : playbackUrl,
        }}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
        style={[styles.webVideo, { backgroundColor: palette.surface }]}
      />
    );
  };

  const renderPlayer = (fullscreen = false) => {
    if ((resolvingUrl && !playbackUrl) || (!playbackUrl && !resolveError)) {
      return renderUnavailable(fullscreen);
    }

    if (failed) {
      return renderUnavailable(fullscreen);
    }

    return isYouTube ? renderEmbeddedVideo(fullscreen) : renderDirectVideo(fullscreen);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.toolbar}>
        <View style={styles.titleRow}>
          <View
            style={[
              styles.iconBadge,
              {
                backgroundColor: palette.accentMuted,
                borderColor: palette.borderStrong,
              },
            ]}
          >
            <Ionicons name="play-circle-outline" size={18} color={palette.accent} />
          </View>
          <Text numberOfLines={1} style={[styles.title, { color: palette.text }]}>
            {title}
          </Text>
        </View>

        <View style={styles.actions}>
          {playbackUrl ? (
            <Pressable
              onPress={() => openExternalUrl(playbackUrl)}
              style={[
                styles.iconButton,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surface,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Abrir vídeo"
            >
              <Ionicons name="open-outline" size={18} color={palette.textMuted} />
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => setFullscreenVisible(true)}
            style={[
              styles.iconButton,
              {
                borderColor: palette.borderStrong,
                backgroundColor: palette.accent,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Abrir vídeo em tela cheia"
          >
            <Ionicons name="expand-outline" size={18} color={palette.background} />
          </Pressable>
        </View>
      </View>

      {resolveError ? <Text style={styles.warningText}>{resolveError}</Text> : null}

      <View
        style={[
          styles.playerShell,
          {
            borderColor: palette.border,
            backgroundColor: palette.surface,
          },
        ]}
      >
        {renderPlayer()}
      </View>

      <Modal
        visible={fullscreenVisible}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setFullscreenVisible(false)}
      >
        <SafeAreaView
          style={[styles.fullscreenModal, { backgroundColor: palette.background }]}
        >
          <View style={styles.fullscreenHeader}>
            <View style={styles.titleRow}>
              <View
                style={[
                  styles.iconBadge,
                  {
                    backgroundColor: palette.accentMuted,
                    borderColor: palette.borderStrong,
                  },
                ]}
              >
                <Ionicons name="play-circle-outline" size={18} color={palette.accent} />
              </View>
              <View style={styles.fullscreenTextGroup}>
                <Text numberOfLines={1} style={[styles.fullscreenTitle, { color: palette.text }]}>
                  {title}
                </Text>
                <Text
                  style={[styles.fullscreenSubtitle, { color: palette.textSubtle }]}
                >
                  Leitura do vídeo
                </Text>
              </View>
            </View>

            <View style={styles.actions}>
              {playbackUrl ? (
                <Pressable
                  onPress={() => openExternalUrl(playbackUrl)}
                  style={[
                    styles.iconButton,
                    {
                      borderColor: palette.border,
                      backgroundColor: palette.surface,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Abrir vídeo"
                >
                  <Ionicons name="open-outline" size={18} color={palette.textMuted} />
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => setFullscreenVisible(false)}
                style={[
                  styles.iconButton,
                  {
                    borderColor: palette.border,
                    backgroundColor: palette.surface,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Fechar tela cheia"
              >
                <Ionicons name="close-outline" size={18} color={palette.textMuted} />
              </Pressable>
            </View>
          </View>

          <View
            style={[
              styles.fullscreenPlayerShell,
              {
                borderColor: palette.border,
                backgroundColor: palette.surface,
              },
            ]}
          >
            {renderPlayer(true)}
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 12,
    gap: 8,
  },
  toolbar: {
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
  fullscreenTextGroup: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  iconBadge: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  title: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    gap: 6,
  },
  iconButton: {
    width: 38,
    height: 38,
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
  playerShell: {
    height: 250,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
  },
  nativeVideo: {
    width: "100%",
    height: "100%",
  },
  nativeVideoFullscreen: {
    width: "100%",
    height: "100%",
  },
  webVideo: {
    flex: 1,
  },
  feedbackBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 10,
  },
  feedbackBoxFullscreen: {
    minHeight: 320,
  },
  feedbackText: {
    textAlign: "center",
    lineHeight: 20,
  },
  secondaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontWeight: "700",
  },
  fullscreenModal: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 10,
  },
  fullscreenHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  fullscreenTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  fullscreenSubtitle: {
    fontSize: 12,
  },
  fullscreenPlayerShell: {
    flex: 1,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
  },
});

const seekStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 8,
    gap: 6,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  seekBtn: {
    alignItems: 'center',
    gap: 2,
  },
  seekLabel: {
    color: '#fff',
    fontSize: 11,
  },
  playBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  timeText: {
    color: '#fff',
    fontSize: 11,
    minWidth: 36,
  },
});
