/**
 * @deprecated Use `usePersonalizacaoProvider()` em componentes/hooks React,
 *             ou `defaultTrailupApiProvider` diretamente em utils/scripts.
 *             Este arquivo é mantido apenas como shim de compatibilidade
 *             — todas as funções delegam para o provider canônico.
 */
import { defaultTrailupApiProvider } from "@/services/personalizacao/TrailupApiProvider";
import type {
  ListarJobsParams,
  ListarPersonalizacoesPerfilParams,
  MentorChatPayload,
  PersonalizacaoProgressDirectPayload,
  PersonalizarPayload,
  SubscribePersonalizacoesClasseParams,
} from "@/services/personalizacao/types";

export {
  PersonalizacaoAuthError,
  PersonalizacaoNetworkError,
  PersonalizacaoRlsError,
  isPersonalizacaoAuthError,
} from "@/services/personalizacao/errors";

export type {
  CardPersonalizadoRecord,
  ListarJobsParams,
  ListarPersonalizacoesPerfilParams,
  MentorChatMessagePayload,
  MentorChatPayload,
  MentorChatResponse,
  PersonalizacaoJobRecord,
  PersonalizacaoListResponse,
  PersonalizacaoProgressDirectPayload,
  PersonalizacaoProgressPayload,
  PersonalizacaoRecord,
  PersonalizarPayload,
  SubscribePersonalizacoesClasseParams,
} from "@/services/personalizacao/types";

export const hasPersonalizacaoApiConfigured = () =>
  defaultTrailupApiProvider.hasApiConfigured();

export const solicitarPersonalizacao = (payload: PersonalizarPayload) =>
  defaultTrailupApiProvider.solicitarPersonalizacao(payload);

export const listarPersonalizacoesPersistidasPerfil = (
  params: ListarPersonalizacoesPerfilParams
) => defaultTrailupApiProvider.listarPersonalizacoesPersistidasPerfil(params);

export const listarJobsPersistidosAluno = (params: ListarJobsParams) =>
  defaultTrailupApiProvider.listarJobsPersistidosAluno(params);

export const salvarProgressoPersonalizadoDiretoSupabase = (
  payload: PersonalizacaoProgressDirectPayload
) =>
  defaultTrailupApiProvider.salvarProgressoPersonalizadoDiretoSupabase(payload);

export const subscribePersonalizacoesPersistidasClasse = (
  params: SubscribePersonalizacoesClasseParams
) => defaultTrailupApiProvider.subscribePersonalizacoesPersistidasClasse(params);

export const conversarComMentorPersonalizacao = (payload: MentorChatPayload) =>
  defaultTrailupApiProvider.conversarComMentorPersonalizacao(payload);
