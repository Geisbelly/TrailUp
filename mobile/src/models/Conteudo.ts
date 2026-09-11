// src/models/Conteudo.ts
import { construirEscritaDeConteudo, statusConhecido } from '@/services/progressoEscritas';
import { gravarProgresso } from '@/services/progressoOutbox';
import { clampPercent } from '@/utils/dataValidation';
import { Midia } from './Midia';

export class Conteudo {
  public midias: Midia[] = [];
  public atividade_ids: number[] = [];

  constructor(
    public id: number,
    public titulo: string,
    public tipo: string,
    public conteudo: string | null,
    public ordem: number | null,
    public metadata: unknown | null,
    public status: string | null,
    public percentual_concluido: number | null,
    public tempo_gasto_min: number | null,
    public ultima_visualizacao: string | null
  ) {}

  addMidia(m: Midia) {
    if (!this.midias.find(x => x.id === m.id)) this.midias.push(m);
  }

  linkAtividade(atividadeId: number) {
    if (!this.atividade_ids.includes(atividadeId)) this.atividade_ids.push(atividadeId);
  }

  /** ✅ Marca conteúdo como visualizado */
  async marcarVisto(aluno_id: string, tempo_gasto_min?: number): Promise<void> {
    try {
      const agora = new Date().toISOString();
      // Sem `tempo_gasto_min`: ele e derivado da telemetria por trigger
      // (`20260826_19`). Aqui o valor caia em `this.tempo_gasto_min ?? 0`, ou
      // seja, marcar um conteudo como visto sobrescrevia o tempo do banco com
      // o que a memoria do app tivesse -- ou com zero.
      await gravarProgresso(
        construirEscritaDeConteudo({
          alunoId: aluno_id,
          conteudoId: this.id,
          status: 'concluido',
          percentual: 100,
          agora,
        })
      );

      // Atualiza localmente
      this.status = 'concluido';
      this.percentual_concluido = 100;
      this.ultima_visualizacao = agora;

      console.log(`[Conteudo] Marcado como visto: ${this.id}`);
    } catch (err) {
      console.warn('[Conteudo] Erro ao marcar visto:', err);
      throw err;
    }
  }

  /** ✅ Atualiza tempo gasto */
  /**
   * Registra a visita ao conteúdo.
   *
   * Não grava `tempo_gasto_min`: ele é derivado da telemetria por trigger
   * (`20260826_19`). O contador do cliente era acumulado por
   * leitura-soma-escrita e perdia todo intervalo cuja escrita falhasse — o
   * tópico chegava a marcar menos tempo que um conteúdo dentro dele.
   *
   * `status` e `percentual_concluido` continuam: em `conteudo_aluno` eles são
   * dado de origem, e é deles que o trigger de progresso deriva o percentual
   * do tópico.
   */
  async registrarVisita(aluno_id: string): Promise<void> {
    try {
      const agora = new Date().toISOString();
      // O percentual do banco é preservado, não recalculado: aqui só se sabe
      // que houve visita. Quando ele já prova conclusão, `statusConhecido`
      // devolve `concluido` -- é o que impede a visita de demover a linha.
      const statusAtual = statusConhecido({
        status: this.status,
        percentual: this.percentual_concluido,
      });
      const percentualAtual =
        statusAtual === 'concluido' ? 100 : clampPercent(this.percentual_concluido ?? 0);

      await gravarProgresso(
        construirEscritaDeConteudo({
          alunoId: aluno_id,
          conteudoId: this.id,
          status: statusAtual,
          percentual: percentualAtual,
          agora,
        })
      );

      this.status = statusAtual ?? this.status;
      this.percentual_concluido = percentualAtual;
      this.ultima_visualizacao = agora;
    } catch (err) {
      console.warn('[Conteudo] Erro ao atualizar tempo:', err);
      throw err;
    }
  }
}
