import type { SlideData } from '../types';
import { truncarNoLimite } from './quizSanitize';

// Orcamento de texto dos campos livres do slide.
//
// O quiz ja tinha esse limite, e o comentario que o justifica no schema diz a
// causa com todas as letras: "Sem nenhum limite aqui, producao real mostrou o
// modelo entrar em loop de repeticao e gerar milhares de caracteres pra uma
// unica pergunta/alternativa". O diagnostico estava certo — mas so' o quiz foi
// protegido. `contentParagraphs`, `keyTakeaways`, a fala do guia e o beat
// narrativo ficaram sem teto nenhum, apesar de as descricoes do schema
// prometerem "2 a 4 paragrafos" e "1 a 2 frases".
//
// O log de producao de 2026-09-28 mostra a conta chegando:
//
//   [Batch 7-7] resposta truncada: Unterminated string in JSON
//               at position 163073 (line 26 column 160638)
//
// Coluna 160638 de uma UNICA linha: um so' campo de texto com 160 mil
// caracteres, e `candidatesTokenCount` travado em 32752-32754 em toda falha do
// log — o teto de saida inteiro gasto num campo. Nao era volume de slides;
// dividir o bloco nunca ia resolver.
//
// Os numeros abaixo nao apertam o conteudo pedido: um paragrafo dito "denso"
// vive entre 600 e 900 caracteres, entao 1200 e' folga. Quatro deles somam
// ~4,8k caracteres por slide, contra os 160k observados.

/** Paragrafo de `contentParagraphs`. Denso cabe em muito menos que isso. */
export const MAX_PARAGRAPH_CHARS = 1200;
/** Item de `keyTakeaways` — e' uma conclusao curta, nao um paragrafo. */
export const MAX_TAKEAWAY_CHARS = 320;
/** `characterGuide.speechText` — fala do guia, nao aula inteira. */
export const MAX_GUIDE_SPEECH_CHARS = 900;
/** `characterGuide.analogy`. */
export const MAX_GUIDE_ANALOGY_CHARS = 600;
/** `thematicStorytelling.narrativeBeat` — o schema pede 1 a 2 frases. */
export const MAX_NARRATIVE_BEAT_CHARS = 400;
/** `conceptTitle` — titulo, e titulo nao tem paragrafo. */
export const MAX_CONCEPT_TITLE_CHARS = 160;

/**
 * Aplica o orcamento acima aos campos livres de cada slide.
 *
 * Mesma divisao de trabalho do quiz: o `maxLength` do schema tenta evitar que o
 * modelo GASTE os tokens, e esta funcao garante o que vai ser RENDERIZADO. Ela
 * nao recupera token nenhum — quando o modelo estoura o teto, quem evita a perda
 * de slide e' `salvarSlidesCompletos`. Aqui o objetivo e o piso visual: nenhum
 * slide vira parede de texto repetido.
 *
 * Nao rejeita nem regenera slide: so' corta.
 */
export function sanitizeSlideTextBudget(slides: SlideData[]): SlideData[] {
  if (!Array.isArray(slides)) return slides;

  return slides.map((slide) => {
    if (!slide || typeof slide !== 'object') return slide;

    const next: SlideData = { ...slide };

    if (typeof slide.conceptTitle === 'string') {
      next.conceptTitle = truncarNoLimite(slide.conceptTitle, MAX_CONCEPT_TITLE_CHARS);
    }

    if (Array.isArray(slide.contentParagraphs)) {
      next.contentParagraphs = slide.contentParagraphs.map(
        (paragrafo) => truncarNoLimite(paragrafo, MAX_PARAGRAPH_CHARS) ?? paragrafo,
      );
    }

    if (Array.isArray(slide.keyTakeaways)) {
      next.keyTakeaways = slide.keyTakeaways.map(
        (item) => truncarNoLimite(item, MAX_TAKEAWAY_CHARS) ?? item,
      );
    }

    if (slide.characterGuide) {
      next.characterGuide = {
        ...slide.characterGuide,
        speechText: truncarNoLimite(slide.characterGuide.speechText, MAX_GUIDE_SPEECH_CHARS),
        analogy: truncarNoLimite(slide.characterGuide.analogy, MAX_GUIDE_ANALOGY_CHARS),
      };
    }

    if (slide.thematicStorytelling) {
      next.thematicStorytelling = {
        ...slide.thematicStorytelling,
        narrativeBeat:
          truncarNoLimite(slide.thematicStorytelling.narrativeBeat, MAX_NARRATIVE_BEAT_CHARS) ??
          slide.thematicStorytelling.narrativeBeat,
      };
    }

    return next;
  });
}
