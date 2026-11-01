import type { ProfileShellPalette } from "./profileShellPalette";

/**
 * Vermelho de "Excluir" no detalhe da notificação: o mesmo do protótipo mobile-v1
 * (`--danger`/`--danger-border` em `assets/app.css`) e da caixa de entrada larga
 * (`NotificacoesDesktop`). Fixo, como `success`/`warning`/`info`: derivar do accent
 * deixaria o botão destrutivo da cor do perfil — no Daredevil, vermelho sobre vermelho.
 */
export const PERIGO_NOTIFICACAO = {
  texto: "#f0847c",
  borda: "#8a4250",
} as const;

/**
 * Cores do detalhe da notificação, todas da paleta do perfil (exceto o vermelho fixo).
 * Separado da tela para que o teste confira o contraste dos 7 perfis sem carregar
 * react-native: cada par texto × fundo usado na tela está aqui.
 */
export function coresDoDetalheDaNotificacao(palette: ProfileShellPalette, lida: boolean) {
  return {
    fundo: palette.background,
    cartao: palette.surface,
    borda: palette.border,
    bordaForte: palette.borderStrong,
    iconeFundo: palette.surfaceElevated,
    icone: palette.accent,
    // Lida: o título recua, como na lista (`CardNotificacao`).
    titulo: lida ? palette.textMuted : palette.text,
    texto: palette.text,
    textoMudo: palette.textMuted,
    textoSutil: palette.textSubtle,
    // Selo: "Nova" é cheio na cor do perfil; "Lida" só contorna, em tom neutro. Com
    // accent sobre accentMuted o Conqueror ficava em 4,46:1.
    seloFundo: lida ? "transparent" : palette.accent,
    seloBorda: lida ? palette.borderStrong : palette.accent,
    seloTexto: lida ? palette.textMuted : palette.background,
    perigoTexto: PERIGO_NOTIFICACAO.texto,
    perigoBorda: PERIGO_NOTIFICACAO.borda,
  };
}
