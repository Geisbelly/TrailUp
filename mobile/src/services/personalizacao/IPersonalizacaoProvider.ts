import type { RealtimeChannel } from "@supabase/supabase-js";

import type {
  ListarJobsParams,
  ListarPersonalizacoesPerfilParams,
  ListarSugestoesMaterialTurmaParams,
  MentorChatPayload,
  MentorChatResponse,
  PersonalizacaoJobRecord,
  PersonalizacaoListResponse,
  PersonalizacaoProgressDirectPayload,
  ObterSugestaoMaterialParams,
  PersonalizacaoRecord,
  PersonalizarPayload,
  SubscribePersonalizacoesClasseParams,
  SugestaoMaterialResponse,
} from "@/services/personalizacao/types";

export interface IPersonalizacaoProvider {
  /** Verifica se há URL base configurada para a API HTTP. */
  hasApiConfigured(): boolean;

  /** Solicita uma nova personalização para um tópico/conteúdo (POST HTTP). */
  solicitarPersonalizacao(
    payload: PersonalizarPayload
  ): Promise<PersonalizacaoRecord>;

  /** Lê personalizações persistidas no Supabase filtradas por perfil BrainHex. */
  listarPersonalizacoesPersistidasPerfil(
    params: ListarPersonalizacoesPerfilParams
  ): Promise<PersonalizacaoListResponse>;

  /**
   * Ordem aconselhada de consumo do material do aluno num tópico (GET HTTP).
   *
   * Rota HTTP e não leitura direta do Supabase: criar a sugestão exige o motor,
   * que roda no servidor. A primeira chamada cria; as seguintes devolvem a mesma
   * até o ciclo de telemetria revisar.
   */
  obterSugestaoMaterial(
    params: ObterSugestaoMaterialParams
  ): Promise<SugestaoMaterialResponse | null>;

  /**
   * Sugestões JÁ CRIADAS do aluno na turma, por tópico, lidas direto do
   * Supabase (`personalizacao_sugestao`, só as do tópico inteiro).
   *
   * Leitura sem IA vai ao banco (regra de fronteira): é ela que deixa a ordem
   * pronta ANTES de o tópico abrir. Criar e revisar continua sendo
   * `obterSugestaoMaterial`. Sem policy de SELECT para o aluno, a RLS devolve
   * lista vazia — e o app cai na ordem canônica.
   */
  listarSugestoesMaterialTurma(
    params: ListarSugestoesMaterialTurmaParams
  ): Promise<Record<number, SugestaoMaterialResponse>>;

  /** Lista jobs de personalização em execução/concluídos. */
  listarJobsPersistidosAluno(
    params: ListarJobsParams
  ): Promise<PersonalizacaoJobRecord[]>;

  /** Persiste progresso de item personalizado direto no Supabase com merge. */
  salvarProgressoPersonalizadoDiretoSupabase(
    payload: PersonalizacaoProgressDirectPayload
  ): Promise<{ id: number | null; mode: "insert" | "update" }>;

  /** Assina realtime de mudanças em personalizações da classe. */
  subscribePersonalizacoesPersistidasClasse(
    params: SubscribePersonalizacoesClasseParams
  ): RealtimeChannel;

  /** Conversa com o mentor de personalização (POST HTTP). */
  conversarComMentorPersonalizacao(
    payload: MentorChatPayload
  ): Promise<MentorChatResponse>;
}
