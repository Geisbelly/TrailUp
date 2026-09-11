import {
  construirEscritaDeAtividade,
  normalizarStatus,
} from "@/services/progressoEscritas";
import { gravarProgresso } from "@/services/progressoOutbox";
import { clampPercent } from "@/utils/dataValidation";
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

  /**
   * Não recebe mais `tempo_gasto_min`, e não grava a coluna.
   *
   * Ela é derivada da telemetria por trigger (`20260826_19`). O parâmetro
   * existia, o único chamador passava `undefined`, e o valor caía em
   * `this.tempo_gasto_min ?? 0` -- ou seja, CONCLUIR uma atividade apagava o
   * tempo que o trigger tinha somado e punha no lugar o que a memória do app
   * tivesse, quase sempre zero. Era o mesmo defeito que a `20260826_19`
   * removeu dos outros gravadores; este sobreviveu por estar num parâmetro
   * opcional.
   */
  async registrarConclusao(
    aluno_id: string,
    acertos_percentual: number,
    pontuacao_obtida?: number | null,
    pontuacao_maxima?: number | null,
    avaliacao_metadata?: Record<string, unknown> | null
  ): Promise<void> {
    try {
      const agora = new Date().toISOString();
      const acertosNormalizado = clampPercent(acertos_percentual);

      await gravarProgresso(
        construirEscritaDeAtividade({
          alunoId: aluno_id,
          atividadeId: this.id,
          status: "concluido",
          percentual: 100,
          acertosPercentual: acertosNormalizado,
          pontuacaoObtida: pontuacao_obtida ?? null,
          pontuacaoMaxima: pontuacao_maxima ?? this.pontuacao_maxima ?? null,
          avaliacaoMetadata: avaliacao_metadata ?? {},
          agora,
        })
      );

      this.status = "concluido";
      this.percentual_concluido = 100;
      this.acertos_percentual = acertosNormalizado;
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
      await gravarProgresso(
        construirEscritaDeAtividade({
          alunoId: aluno_id,
          atividadeId: this.id,
          status: "em andamento",
        })
      );

      this.status = "em andamento";
      this.percentual_concluido = clampPercent(this.percentual_concluido ?? 0);
    } catch (err) {
      console.warn("[Atividade] Erro ao marcar iniciada:", err);
      throw err;
    }
  }

  /**
   * Registra a visita à atividade.
   *
   * Já se chamou `atualizarTempoGasto` e escrevia três coisas que não são
   * dela:
   *
   * - `tempo_gasto_min` — agora derivado da telemetria por trigger
   *   (`20260826_19`). O contador do cliente perdia todo intervalo cuja
   *   escrita falhasse e ficava até 29x fora.
   * - `acertos_percentual: this.acertos_percentual ?? 0` — com o modelo local
   *   sem a taxa carregada, **registrar tempo zerava a taxa de acertos** da
   *   atividade. Quem escreve isso é `registrarConclusao`, que sabe o valor.
   * - `percentual_concluido: ... : 0` — pelo mesmo caminho, derrubava para
   *   zero o percentual de uma atividade em andamento.
   *
   * Omitir a coluna do upsert preserva o que está no banco quando a linha já
   * existe: o `ON CONFLICT` só toca no que foi enviado.
   */
  async registrarVisita(aluno_id: string): Promise<void> {
    try {
      const agora = new Date().toISOString();

      await gravarProgresso(
        construirEscritaDeAtividade({
          alunoId: aluno_id,
          atividadeId: this.id,
          status: normalizarStatus(this.status) ?? "em andamento",
          agora,
        })
      );
    } catch (err) {
      console.warn("[Atividade] Erro ao registrar visita:", err);
      throw err;
    }
  }
}
