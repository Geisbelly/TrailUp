// src/models/Conteudo.ts
import { supabase } from '@/database/supabase';
import { clampPercent, normalizeNonNegativeNumber } from '@/utils/dataValidation';
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
      const tempoNormalizado =
        tempo_gasto_min != null
          ? normalizeNonNegativeNumber(tempo_gasto_min)
          : normalizeNonNegativeNumber(this.tempo_gasto_min ?? 0);

      const { error } = await supabase
        .from('conteudo_aluno')
        .upsert({
          aluno_id,
          conteudo_id: this.id,
          status: 'concluido',
          percentual_concluido: 100,
          tempo_gasto_min: tempoNormalizado,
          ultima_visualizacao: agora,
          updated_at: agora,
        }, {
          onConflict: 'aluno_id,conteudo_id'
        });

      if (error) throw error;

      // Atualiza localmente
      this.status = 'concluido';
      this.percentual_concluido = 100;
      this.tempo_gasto_min = tempoNormalizado;
      this.ultima_visualizacao = agora;

      console.log(`[Conteudo] Marcado como visto: ${this.id}`);
    } catch (err) {
      console.warn('[Conteudo] Erro ao marcar visto:', err);
      throw err;
    }
  }

  /** ✅ Atualiza tempo gasto */
  async atualizarTempoGasto(aluno_id: string, minutos: number): Promise<void> {
    try {
      const agora = new Date().toISOString();
      const tempoNormalizado = normalizeNonNegativeNumber(minutos);
      const statusAtual =
        this.status ?? (Number(this.percentual_concluido ?? 0) >= 100 ? 'concluido' : 'em andamento');
      const percentualAtual = String(statusAtual).toLowerCase().includes('concl')
        ? 100
        : clampPercent(this.percentual_concluido ?? 0);

      const { error } = await supabase
        .from('conteudo_aluno')
        .upsert(
          {
            aluno_id,
            conteudo_id: this.id,
            status: statusAtual,
            percentual_concluido: percentualAtual,
            tempo_gasto_min: tempoNormalizado,
            ultima_visualizacao: agora,
            updated_at: agora,
          },
          {
            onConflict: 'aluno_id,conteudo_id',
          }
        );

      if (error) throw error;

      this.status = statusAtual;
      this.percentual_concluido = percentualAtual;
      this.tempo_gasto_min = tempoNormalizado;
      this.ultima_visualizacao = agora;
    } catch (err) {
      console.warn('[Conteudo] Erro ao atualizar tempo:', err);
      throw err;
    }
  }
}
