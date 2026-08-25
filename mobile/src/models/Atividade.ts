import { supabase } from "@/database/supabase";
import { clampPercent, normalizeNonNegativeNumber } from "@/utils/dataValidation";
import { Questao } from "./Questao";

export type AtividadeTipo =
  | "questao"
  | "quiz"
  | "video"
  | "texto"
  | "true_false"
  | "true or false"
  | "true_or_false"
  | "truefalse"
  | "verdadeiro_falso"
  | "verdadeiro ou falso"
  | "verdadeiro/falso"
  | "booleano"
  | "fill_blank"
  | "fili_blank"
  | "fill in the blank"
  | "fill-in-the-blank"
  | "fillblank"
  | "completar_lacuna"
  | "completar lacuna"
  | "lacuna"
  | null;

export class Atividade {
  public questoes: Questao[] = [];
  public conteudo_ids: number[] = [];
  public topico_id: number | null = null;
  public percentual_concluido: number | null = null;
  public resposta_aluno: string | null = null;
  public ultima_tentativa: number | null = null;
  public acertos_percentual: number | null = null;
  public correta_aluno: boolean | null = null;
  public mostrar_gabarito_ao_errar: boolean | null = null;
  public tempo_gasto_min: number | null = null;
  public metadata: Record<string, unknown> | null = null;
  public pontuacao_obtida: number | null = null;
  public pontuacao_maxima_avaliada: number | null = null;

  constructor(
    public id: number,
    public titulo: string,
    public descricao: string | null,
    public tipo: AtividadeTipo,
    public status: string | null,
    public pontuacao_maxima: number | null,
    public data_entrega: string | null,
    tempo_gasto_min: number | null = null,
    metadata: Record<string, unknown> | null = null
  ) {
    this.tempo_gasto_min = tempo_gasto_min;
    this.metadata = metadata;
  }

  addQuestao(q: Questao) {
    if (!this.questoes.find((x) => x.id === q.id)) this.questoes.push(q);
  }

  linkConteudo(conteudoId: number) {
    if (!this.conteudo_ids.includes(conteudoId)) this.conteudo_ids.push(conteudoId);
  }

  async registrarConclusao(
    aluno_id: string,
    acertos_percentual: number,
    tempo_gasto_min?: number,
    pontuacao_obtida?: number | null,
    pontuacao_maxima?: number | null,
    avaliacao_metadata?: Record<string, unknown> | null
  ): Promise<void> {
    try {
      const agora = new Date().toISOString();
      const acertosNormalizado = clampPercent(acertos_percentual);
      const tempoNormalizado =
        tempo_gasto_min != null
          ? normalizeNonNegativeNumber(tempo_gasto_min)
          : normalizeNonNegativeNumber(this.tempo_gasto_min ?? 0);

      const { error } = await supabase.from("atividade_aluno").upsert(
        {
          aluno_id,
          atividade_id: this.id,
          status: "concluido",
          percentual_concluido: 100,
          acertos_percentual: acertosNormalizado,
          tempo_gasto_min: tempoNormalizado,
          pontuacao_obtida: pontuacao_obtida ?? null,
          pontuacao_maxima: pontuacao_maxima ?? this.pontuacao_maxima ?? null,
          avaliacao_metadata: avaliacao_metadata ?? {},
          ultima_visualizacao: agora,
          updated_at: agora,
        },
        {
          onConflict: "aluno_id,atividade_id",
        }
      );

      if (error) throw error;

      this.status = "concluido";
      this.percentual_concluido = 100;
      this.acertos_percentual = acertosNormalizado;
      this.tempo_gasto_min = tempoNormalizado;
      this.pontuacao_obtida = pontuacao_obtida ?? this.pontuacao_obtida;
      this.pontuacao_maxima_avaliada =
        pontuacao_maxima ?? this.pontuacao_maxima_avaliada ?? this.pontuacao_maxima ?? null;
    } catch (err) {
      console.warn("[Atividade] Erro ao registrar conclusão:", err);
      throw err;
    }
  }

  async marcarIniciada(aluno_id: string): Promise<void> {
    try {
      const { error } = await supabase.from("atividade_aluno").upsert(
        {
          aluno_id,
          atividade_id: this.id,
          status: "em andamento",
          ultima_visualizacao: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "aluno_id,atividade_id",
        }
      );

      if (error) throw error;

      this.status = "em andamento";
      this.percentual_concluido = clampPercent(this.percentual_concluido ?? 0);
    } catch (err) {
      console.warn("[Atividade] Erro ao marcar iniciada:", err);
      throw err;
    }
  }

  async atualizarTempoGasto(aluno_id: string, tempo_gasto_min: number): Promise<void> {
    try {
      const agora = new Date().toISOString();
      const tempoNormalizado = normalizeNonNegativeNumber(tempo_gasto_min);

      const { error } = await supabase.from("atividade_aluno").upsert(
        {
          aluno_id,
          atividade_id: this.id,
          status: this.status ?? "em andamento",
          percentual_concluido: String(this.status ?? "").toLowerCase().includes("concl") ? 100 : 0,
          acertos_percentual: this.acertos_percentual ?? 0,
          tempo_gasto_min: tempoNormalizado,
          ultima_visualizacao: agora,
          updated_at: agora,
        },
        {
          onConflict: "aluno_id,atividade_id",
        }
      );

      if (error) throw error;

      this.tempo_gasto_min = tempoNormalizado;
      this.percentual_concluido = String(this.status ?? "").toLowerCase().includes("concl")
        ? 100
        : Number(this.percentual_concluido ?? 0);
    } catch (err) {
      console.warn("[Atividade] Erro ao atualizar tempo:", err);
      throw err;
    }
  }
}
