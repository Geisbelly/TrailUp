import { EMPTY_STUDY_CONTEXT, type CurrentStudyContext } from '../context/metricas/acumuladorLote';

/** A abertura assíncrona da sessão não pode apagar o item que a tela já abriu. */
export function initialStudyContext(topicId: number | null, current: CurrentStudyContext): CurrentStudyContext {
  return current.topicoId === topicId
    ? { ...current }
    : { ...EMPTY_STUDY_CONTEXT, topicoId: topicId };
}
