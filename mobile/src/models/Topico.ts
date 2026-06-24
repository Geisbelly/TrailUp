import { supabase } from '@/database/supabase';
import { clampPercent } from '@/utils/dataValidation';
import { Atividade } from './Atividade';
import { Conteudo } from './Conteudo';

export class Topico {
  public conteudos: Conteudo[] = [];
  public atividades: Atividade[] = [];

  constructor(
    public id: number,
    public classe_id: number,
    public nome: string,
    public descricao: string | null,
    public ordem: number | null,
    public next: unknown | null,
    public depende: unknown | null,
    public status: 'em andamento' | 'não iniciado' | 'concluido' | null,
    public percentual_concluido: number | null,
    public tempo_gasto_min: number | null,
    public ultima_atividade: number | null,
    public ultima_visualizacao: string | null,
    public updated_at: string | null
  ) {}

  addConteudo(c: Conteudo) {
    if (!this.conteudos.find(x => x.id === c.id)) this.conteudos.push(c);
  }

  addAtividade(a: Atividade) {
    if (!this.atividades.find(x => x.id === a.id)) this.atividades.push(a);
  }

  private isConteudoPersonalizado(conteudo: any): boolean {
    return Boolean(
      conteudo?.isPersonalizedLocal ||
      conteudo?.metadata?.personalized === true ||
      conteudo?.metadata?.source === "personalizado"
    );
  }

  private isCardPersonalizado(conteudo: any): boolean {
    return (
      String(conteudo?.personalizationKind ?? "content") === "cards" ||
      String(conteudo?.tipo ?? "").toLowerCase() === "cards"
    );
  }

  ordenarConteudosParaTrilha(conteudos: any[]): any[] {
    if (!Array.isArray(conteudos) || !conteudos.length) return [];

    const conteudosPadraoIds = new Set(
      (this.conteudos ?? [])
        .map((conteudo) => Number(conteudo?.id))
        .filter((id) => Number.isFinite(id))
    );

    const personalizados = conteudos.filter((conteudo) =>
      this.isConteudoPersonalizado(conteudo)
    );
    const personalizadosPrincipais = personalizados.filter(
      (conteudo) => !this.isCardPersonalizado(conteudo)
    );
    const cardsPersonalizados = personalizados.filter((conteudo) =>
      this.isCardPersonalizado(conteudo)
    );

    const padrao = conteudos.filter((conteudo) => {
      if (this.isConteudoPersonalizado(conteudo)) return false;
      const conteudoId = Number(conteudo?.id);
      return (
        conteudosPadraoIds.size === 0 ||
        (Number.isFinite(conteudoId) && conteudosPadraoIds.has(conteudoId))
      );
    });

    const ordered = [...personalizadosPrincipais, ...cardsPersonalizados, ...padrao];
    const seen = new Set<string>();

    return ordered.filter((conteudo) => {
      const key = String(conteudo?.id ?? "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private atividadeFoiInteragida(atividade: Atividade): boolean {
    const status = String(atividade.status ?? '').toLowerCase();
    const percentual = Number(atividade.percentual_concluido ?? 0);
    const tempoGasto = Number(atividade.tempo_gasto_min ?? 0);
    const hasQuestaoRespondida = Array.isArray(atividade.questoes)
      ? atividade.questoes.some((questao: any) => questao?.resposta_aluno != null)
      : false;

    return (
      status.includes('andamento') ||
      status.includes('concl') ||
      percentual > 0 ||
      tempoGasto > 0 ||
      atividade.resposta_aluno != null ||
      Number(atividade.ultima_tentativa ?? 0) > 0 ||
      hasQuestaoRespondida
    );
  }

  private conteudoFoiInteragido(conteudo: Conteudo): boolean {
    const status = String(conteudo.status ?? '').toLowerCase();
    const percentual = Number(conteudo.percentual_concluido ?? 0);
    const tempoGasto = Number(conteudo.tempo_gasto_min ?? 0);
    return status.includes('andamento') || status.includes('concl') || percentual > 0 || tempoGasto > 0;
  }

  private inferirUltimaAtividadeId(): number | null {
    for (let i = this.atividades.length - 1; i >= 0; i -= 1) {
      const atividade = this.atividades[i];
      if (this.atividadeFoiInteragida(atividade)) {
        return atividade.id;
      }
    }
    return this.ultima_atividade ?? null;
  }

  /** ✅ Calcula percentual de conclusão baseado em conteúdos e atividades */
  calcularPercentual(): number {
    const totalConteudos = this.conteudos.length;
    const conteudosConcluidos = this.conteudos.filter(c => {
      const status = String(c.status ?? '').toLowerCase();
      const pct = Number(c.percentual_concluido ?? 0);
      return status.includes('concl') || pct >= 100;
    }).length;

    const totalAtividades = this.atividades.length;
    const atividadesConcluidas = this.atividades.filter(a => {
      const status = String(a.status ?? '').toLowerCase();
      const pct = Number(a.percentual_concluido ?? 0);
      return status.includes('concl') || pct >= 100;
    }).length;

    const total = totalConteudos + totalAtividades;
    const completados = conteudosConcluidos + atividadesConcluidas;
    
    return clampPercent(total > 0 ? (completados / total) * 100 : 0);
  }

  /** ✅ Determina o status com base no percentual */
  calcularStatus(): 'concluido' | 'em andamento' | 'não iniciado' {
    const percentual = clampPercent(this.calcularPercentual());
    
    if (percentual >= 100) return 'concluido';
    if (percentual > 0) return 'em andamento';

    const hasConteudoEmAndamento = this.conteudos.some((conteudo) => this.conteudoFoiInteragido(conteudo));
    const hasAtividadeEmAndamento = this.atividades.some((atividade) => this.atividadeFoiInteragida(atividade));
    if (hasConteudoEmAndamento || hasAtividadeEmAndamento) return 'em andamento';

    return 'não iniciado';
  }

  /** ✅ Atualiza progresso no banco */
  async atualizarProgresso(aluno_id: string): Promise<void> {
    try {
      const agora = new Date().toISOString();
      const percentual = clampPercent(this.calcularPercentual());
      const status = this.calcularStatus();
      const ultimaAtividade = this.inferirUltimaAtividadeId();

      const { error } = await supabase
        .from('topico_aluno')
        .upsert({
          aluno_id,
          topico_id: this.id,
          percentual_concluido: percentual,
          status,
          ultima_atividade: ultimaAtividade,
          ultima_visualizacao: agora,
          updated_at: agora
        }, {
          onConflict: 'aluno_id,topico_id'
        });

      if (error) throw error;

      // Atualiza localmente
      this.percentual_concluido = percentual;
      this.status = status;
      this.ultima_atividade = ultimaAtividade;
      this.ultima_visualizacao = agora;

      console.log(`[Topico] Progresso atualizado: ${percentual.toFixed(1)}%`);
    } catch (err) {
      console.warn('[Topico] Erro ao atualizar progresso:', err);
      throw err;
    }
  }

  /** ✅ Marca tópico como iniciado */
  async marcarIniciado(aluno_id: string): Promise<void> {
    try {
      const agora = new Date().toISOString();
      const { error } = await supabase
        .from('topico_aluno')
        .upsert({
          aluno_id,
          topico_id: this.id,
          status: 'em andamento',
          ultima_visualizacao: agora,
          updated_at: agora
        }, {
          onConflict: 'aluno_id,topico_id'
        });

      if (error) throw error;

      this.status = 'em andamento';
      this.ultima_visualizacao = agora;
    } catch (err) {
      console.warn('[Topico] Erro ao marcar iniciado:', err);
      throw err;
    }
  }

  /** ✅ Marca tópico como concluído */
  async marcarConcluido(aluno_id: string): Promise<void> {
    try {
      const agora = new Date().toISOString();
      const ultimaAtividade = this.inferirUltimaAtividadeId();
      const { error } = await supabase
        .from('topico_aluno')
        .upsert({
          aluno_id,
          topico_id: this.id,
          status: 'concluido',
          percentual_concluido: 100,
          ultima_atividade: ultimaAtividade,
          ultima_visualizacao: agora,
          updated_at: agora
        }, {
          onConflict: 'aluno_id,topico_id'
        });

      if (error) throw error;

      this.status = 'concluido';
      this.percentual_concluido = 100;
      this.ultima_atividade = ultimaAtividade;
      this.ultima_visualizacao = agora;
    } catch (err) {
      console.warn('[Topico] Erro ao marcar concluído:', err);
      throw err;
    }
  }

  /** ✅ Verifica se está desbloqueado */
  async estaDesbloqueado(aluno_id: string, todosTopicos: Topico[]): Promise<boolean> {
    // Se não tem dependências, está desbloqueado
    if (!this.depende || (Array.isArray(this.depende) && this.depende.length === 0)) {
      return true;
    }

    // Lista de IDs dos tópicos que este depende
    const dependencias: number[] = Array.isArray(this.depende) 
      ? this.depende.map(d => Number(d)).filter(Boolean)
      : [];

    if (dependencias.length === 0) return true;

    // Verifica se todas as dependências estão concluídas
    for (const depId of dependencias) {
      const topicoDep = todosTopicos.find(t => t.id === depId);
      if (!topicoDep) continue;

      const status = String(topicoDep.status ?? '').toLowerCase();
      const pct = Number(topicoDep.percentual_concluido ?? 0);
      
      if (!status.includes('concl') && pct < 100) {
        return false; // Uma dependência não está concluída
      }
    }

    return true;
  }

  /** ✅ Desbloqueia próximos tópicos */
  async desbloquearProximos(aluno_id: string, todosTopicos: Topico[]): Promise<Topico[]> {
    const desbloqueados: Topico[] = [];

    // Lista de próximos tópicos
    const proximos: number[] = Array.isArray(this.next)
      ? this.next.map(n => Number(n)).filter(Boolean)
      : [];

    for (const proximoId of proximos) {
      const proximoTopico = todosTopicos.find(t => t.id === proximoId);
      if (!proximoTopico) continue;

      const estaDesbloqueado = await proximoTopico.estaDesbloqueado(aluno_id, todosTopicos);
      if (estaDesbloqueado) {
        desbloqueados.push(proximoTopico);
      }
    }

    return desbloqueados;
  }
}
