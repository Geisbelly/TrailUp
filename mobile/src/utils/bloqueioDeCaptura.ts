/**
 * Quando o print de tela fica bloqueado (#139).
 *
 * Só enquanto o aluno RESPONDE questões: é a primeira tentativa fotografada que vira cola
 * nas seguintes (O'Donovan et al., §6.9). Texto, vídeo, material personalizado, o resumo da
 * atividade concluída e a revisão das respostas continuam capturáveis — guardar o próprio
 * material é uso legítimo, e bloquear o app inteiro tiraria isso do aluno.
 *
 * Na web não há o que fazer: o navegador não deixa a página impedir captura.
 */
export type SituacaoDaAtividade = {
  plataforma: string;
  /** Chave do componente que o `ActivityRenderer` vai desenhar (`question`, `video`, `texto`). */
  componente: string | null | undefined;
  revisao: boolean;
  /** A tela de resumo (atividade concluída) está no lugar das questões. */
  mostrandoResumo: boolean;
};

export function deveBloquearCaptura({
  plataforma,
  componente,
  revisao,
  mostrandoResumo,
}: SituacaoDaAtividade): boolean {
  if (plataforma !== 'android' && plataforma !== 'ios') return false;
  if (componente !== 'question') return false;
  return !revisao && !mostrandoResumo;
}
