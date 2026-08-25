import { OrnamentDivider } from "@/components/HallTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useUsuario } from "./SessaoContext";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { LinearGradient } from "expo-linear-gradient";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import tinycolor from "tinycolor2";

export type DialogTone = "info" | "success" | "warning" | "error";
export type DialogActionVariant = "primary" | "secondary" | "danger";

type DialogAction = {
  label: string;
  onPress?: () => void | Promise<void>;
  variant?: DialogActionVariant;
};

type DialogOptions = {
  title: string;
  description?: string;
  tone?: DialogTone;
  dismissible?: boolean;
  actions?: DialogAction[];
};

type ConfirmOptions = {
  title: string;
  description?: string;
  tone?: Exclude<DialogTone, "success">;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: DialogActionVariant;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
};

type DialogState = DialogOptions & {
  visible: boolean;
};

type DialogContextValue = {
  showDialog: (options: DialogOptions) => void;
  showConfirm: (options: ConfirmOptions) => void;
  hideDialog: () => void;
};

const DialogContext = createContext<DialogContextValue>({
  showDialog: () => console.warn("DialogProvider não montado (showDialog)"),
  showConfirm: () => console.warn("DialogProvider não montado (showConfirm)"),
  hideDialog: () => console.warn("DialogProvider não montado (hideDialog)"),
});

function getToneConfig(
  tone: DialogTone,
  palette: ReturnType<typeof getProfileShellPalette>
) {
  switch (tone) {
    case "success":
      return {
        icon: "check-decagram-outline" as const,
        color: palette.accent,
        border: palette.borderStrong,
      };
    case "warning":
      return {
        icon: "alert-outline" as const,
        color: "#FBBF24",
        border: "rgba(251, 191, 36, 0.35)",
      };
    case "error":
      return {
        icon: "alert-octagon-outline" as const,
        color: "#F87171",
        border: "rgba(248, 113, 113, 0.35)",
      };
    default:
      return {
        icon: "information-outline" as const,
        color: palette.accent,
        border: palette.borderStrong,
      };
  }
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const { usuario } = useUsuario();
  const palette = getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const gold = tinycolor(palette.accent).lighten(10).toHexString();
  const goldDim = tinycolor(palette.accent).setAlpha(0.5).toRgbString();
  const goldFaint = tinycolor(palette.accent).setAlpha(0.1).toRgbString();

  const hideDialog = useCallback(() => {
    setDialog((prev) => (prev ? { ...prev, visible: false } : null));
  }, []);

  const buildActionHandler = useCallback(
    (action?: DialogAction) => async () => {
      hideDialog();
      if (!action?.onPress) return;
      try {
        await action.onPress();
      } catch (error) {
        console.warn("[Dialog] Erro na ação do diálogo:", error);
      }
    },
    [hideDialog]
  );

  const showDialog = useCallback((options: DialogOptions) => {
    setDialog({
      visible: true,
      tone: options.tone ?? "info",
      dismissible: options.dismissible ?? true,
      title: options.title,
      description: options.description,
      actions:
        options.actions && options.actions.length
          ? options.actions
          : [{ label: "OK", variant: "primary" }],
    });
  }, []);

  const showConfirm = useCallback(
    (options: ConfirmOptions) => {
      showDialog({
        title: options.title,
        description: options.description,
        tone: options.tone ?? "warning",
        dismissible: true,
        actions: [
          {
            label: options.cancelLabel ?? "Cancelar",
            variant: "secondary",
            onPress: options.onCancel,
          },
          {
            label: options.confirmLabel ?? "Confirmar",
            variant: options.confirmVariant ?? "primary",
            onPress: options.onConfirm,
          },
        ],
      });
    },
    [showDialog]
  );

  const value = useMemo(
    () => ({ showDialog, showConfirm, hideDialog }),
    [hideDialog, showConfirm, showDialog]
  );

  const toneConfig = getToneConfig(dialog?.tone ?? "info", palette);
  const toneColor = toneConfig.color;
  const toneBorder = toneConfig.border || palette.borderStrong;

  return (
    <DialogContext.Provider value={value}>
      {children}
      <Modal
        transparent
        visible={Boolean(dialog?.visible)}
        animationType="fade"
        onRequestClose={() => {
          if (dialog?.dismissible === false) return;
          hideDialog();
        }}
      >
        <View style={[styles.backdrop, { backgroundColor: `${palette.background}e0` }]}>
          {/* Luz de candelabro no centro */}
          <LinearGradient
            colors={[
              tinycolor(palette.accent).setAlpha(0.18).toRgbString(),
              "transparent",
            ]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View
            style={[
              styles.card,
              {
                backgroundColor: palette.surfaceElevated,
                borderColor: toneBorder,
              },
            ]}
          >
            {/* Borda interna ornamental */}
            <View
              style={[
                styles.innerBorder,
                { borderColor: tinycolor(toneColor).setAlpha(0.15).toRgbString() },
              ]}
            />

            {/* Cantos ornamentais */}
            <View style={[styles.corner, styles.cornerTL, { borderColor: gold }]} />
            <View style={[styles.corner, styles.cornerTR, { borderColor: gold }]} />
            <View style={[styles.corner, styles.cornerBL, { borderColor: gold }]} />
            <View style={[styles.corner, styles.cornerBR, { borderColor: gold }]} />

            {/* Ícone de tom */}
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: tinycolor(toneColor).setAlpha(0.14).toRgbString() },
              ]}
            >
              <MaterialCommunityIcons name={toneConfig.icon} size={34} color={toneColor} />
            </View>

            {/* Título */}
            <Text
              style={[
                styles.title,
                {
                  color: toneColor,
                  textShadowColor: "rgba(0,0,0,0.7)",
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 5,
                },
              ]}
            >
              {dialog?.title}
            </Text>

            {/* Ornamento divisor */}
            <View style={{ width: "100%", opacity: 0.65 }}>
              <OrnamentDivider color={toneColor} />
            </View>

            {/* Descrição */}
            {dialog?.description ? (
              <Text style={[styles.description, { color: palette.textMuted }]}>
                {dialog.description}
              </Text>
            ) : null}

            {/* Ações */}
            <View style={styles.actionsRow}>
              {dialog?.actions?.map((action, index) => {
                const variant = action.variant ?? "primary";
                const isSecondary = variant === "secondary";
                const isDanger = variant === "danger";

                return (
                  <Pressable
                    key={`${action.label}-${index}`}
                    style={[
                      styles.actionButton,
                      isSecondary
                        ? [
                            styles.secondaryButton,
                            { backgroundColor: goldFaint, borderColor: goldDim },
                          ]
                        : {
                            backgroundColor: isDanger
                              ? "#7f1d1d"
                              : tinycolor(palette.accent).darken(5).toHexString(),
                            borderColor: isDanger ? "#ef4444" : goldDim,
                          },
                    ]}
                    onPress={buildActionHandler(action)}
                  >
                    <Text
                      style={[
                        styles.actionText,
                        isSecondary
                          ? [styles.secondaryText, { color: palette.textMuted }]
                          : { color: Color.colorWhite },
                      ]}
                    >
                      {action.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  return useContext(DialogContext);
}

const CORNER_SIZE = 14;
const CORNER_OFFSET = 8;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    margin: 4,
    borderWidth: 1,
  },
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    opacity: 0.6,
  },
  cornerTL: { top: CORNER_OFFSET, left: CORNER_OFFSET, borderTopWidth: 1.5, borderLeftWidth: 1.5 },
  cornerTR: { top: CORNER_OFFSET, right: CORNER_OFFSET, borderTopWidth: 1.5, borderRightWidth: 1.5 },
  cornerBL: { bottom: CORNER_OFFSET, left: CORNER_OFFSET, borderBottomWidth: 1.5, borderLeftWidth: 1.5 },
  cornerBR: { bottom: CORNER_OFFSET, right: CORNER_OFFSET, borderBottomWidth: 1.5, borderRightWidth: 1.5 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 22,
    textAlign: "center",
  },
  description: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
  actionsRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginTop: 4,
  },
  actionButton: {
    minWidth: 120,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {},
  actionText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 15,
  },
  secondaryText: {},
});
