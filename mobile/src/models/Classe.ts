// src/models/Classe.ts
import { getSessionSafe, supabase } from '@/database/supabase'
import { buildClasseAcademicMetrics } from '@/utils/classeMetrics'
import { clampPercent } from '@/utils/dataValidation'
import { Atividade } from './Atividade'
import { ClasseResumo } from './ClasseResumo'
import { Conteudo } from './Conteudo'
import { Midia } from './Midia'
import { Questao } from './Questao'
import { QuestaoAluno } from './QuestaoAluno'
import { Topico } from './Topico'

function safeJsonParse(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

function toObjectRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  const parsed = safeJsonParse(value)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>
  }

  return null
}

function toArrayValue(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  const parsed = safeJsonParse(value)
  if (Array.isArray(parsed)) return parsed
  return null
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

function mergeMediaCandidates(...values: unknown[]) {
  const merged: unknown[] = []

  values.forEach((value) => {
    const fromArray = toArrayValue(value)
    if (fromArray?.length) {
      merged.push(...fromArray)
      return
    }

    if (value == null) return
    if (typeof value === 'string' && !value.trim()) return

    if (typeof value === 'object') {
      merged.push(value)
      return
    }

    const text = String(value).trim()
    if (text) merged.push(text)
  })

  return merged.length ? merged : null
}

export class Classe {
  public resumo: ClasseResumo | null = null
  public topicos: Topico[] = []

  private constructor(
    public readonly aluno_id: string,
    public readonly classe_id: number
  ) {}

  // Fábrica principal
  static async findByAlunoClasse(aluno_id: string, classe_id: number): Promise<Classe> {
    const classe = new Classe(aluno_id, classe_id)
    const [resumo, topicos] = await Promise.all([
      Classe.loadResumo(aluno_id, classe_id),
      Classe.loadDetalhado(aluno_id, classe_id),
    ])
    classe.resumo = resumo
    classe.topicos = topicos
    return classe
  }

  // Invoca Edge Function (grafo personalizado)
  static async getPersonalizedGraph(userId: string, classeId: number, perfil: string, modo: string) {
    const { data, error } = await supabase.functions.invoke('personalize_path', {
      body: { userId, classeId, perfil, modo },
    })
    if (error) throw error
    return data // { nodes, edges }
  }

  // Retorna resumo por aluno
  static async listResumosByAluno(aluno_id: string): Promise<ClasseResumo[]> {
    const { data, error } = await supabase
      .from('vw_aluno_classe_resumo')
      .select('*')
      .eq('aluno_id', aluno_id)

    if (error) throw error
    return (data ?? []).map(Classe.mapResumoRow)
  }

  static async listClasseIdsByAluno(aluno_id: string): Promise<number[]> {
    const { data, error } = await supabase
      .from('classe_aluno')
      .select('classe_id')
      .eq('aluno_id', aluno_id)

    if (error) throw error
    return (data ?? []).map((r: any) => r.classe_id as number)
  }

  // Lista todas as classes (com ou sem detalhe)
  static async findAllByAluno(aluno_id: string, opts: { withDetalhe?: boolean } = {}): Promise<Classe[]> {
    const { withDetalhe = true } = opts
    const { data, error } = await supabase
      .from('vw_aluno_classe_resumo')
      .select('*')
      .eq('aluno_id', aluno_id)
      .order('classe_id', { ascending: true })

    if (error) throw error
    const rows = data ?? []

    if (!withDetalhe) {
      return rows.map(Classe.fromResumoRow)
    }

    const promises = rows.map(async (row: any) => {
      const classe = new Classe(row.aluno_id, row.classe_id)
      classe.resumo = Classe.mapResumoRow(row)
      classe.topicos = await Classe.loadDetalhado(row.aluno_id, row.classe_id)
      return classe
    })

    return Promise.all(promises)
  }

  static async findAllForCurrentUser(opts: { withDetalhe?: boolean } = {}): Promise<Classe[]> {
    const session = await getSessionSafe()
    const aluno_id = session?.user?.id
    if (!aluno_id) throw new Error('Sem sessão ativa')
    return Classe.findAllByAluno(aluno_id, opts)
  }

  async refresh(): Promise<void> {
    const [resumo, topicos] = await Promise.all([
      Classe.loadResumo(this.aluno_id, this.classe_id),
      Classe.loadDetalhado(this.aluno_id, this.classe_id),
    ])
    this.resumo = resumo
    this.topicos = topicos
  }

  /** ✅ NOVO: Atualiza percentual de progresso de um tópico específico */
  async updateTopicoProgress(topicoId: number): Promise<void> {
    const topico = this.topicos.find(t => t.id === topicoId);
    if (!topico) return;

    try {
      // Conta conteúdos concluídos
      const totalConteudos = topico.conteudos.length;
      const conteudosConcluidos = topico.conteudos.filter(c => {
        const status = String(c.status ?? '').toLowerCase();
        const pct = Number(c.percentual_concluido ?? 0);
        return status.includes('concl') || pct >= 100;
      }).length;

      // Conta atividades concluídas
      const totalAtividades = topico.atividades.length;
      const atividadesConcluidas = topico.atividades.filter(a => {
        const status = String(a.status ?? '').toLowerCase();
        const pct = Number(a.percentual_concluido ?? 0);
        return status.includes('concl') || pct >= 100;
      }).length;

      // Calcula percentual
      const total = totalConteudos + totalAtividades;
      const completados = conteudosConcluidos + atividadesConcluidas;
      const percentual = clampPercent(total > 0 ? (completados / total) * 100 : 0);

      // Determina status
      const hasConteudoEmAndamento = topico.conteudos.some((conteudo) => {
        const status = String(conteudo.status ?? '').toLowerCase();
        const pct = Number(conteudo.percentual_concluido ?? 0);
        const tempo = Number((conteudo as any).tempo_gasto_min ?? 0);
        return status.includes('andamento') || status.includes('concl') || pct > 0 || tempo > 0;
      });

      const hasAtividadeEmAndamento = topico.atividades.some((atividade) => {
        const status = String(atividade.status ?? '').toLowerCase();
        const pct = Number(atividade.percentual_concluido ?? 0);
        const tempo = Number((atividade as any).tempo_gasto_min ?? 0);
        const hasQuestaoRespondida = Array.isArray((atividade as any).questoes)
          ? (atividade as any).questoes.some((questao: any) => questao?.resposta_aluno != null)
          : false;
        return (
          status.includes('andamento') ||
          status.includes('concl') ||
          pct > 0 ||
          tempo > 0 ||
          (atividade as any).resposta_aluno != null ||
          Number((atividade as any).ultima_tentativa ?? 0) > 0 ||
          hasQuestaoRespondida
        );
      });

      let status: 'concluido' | 'em andamento' | 'não iniciado';
      if (percentual >= 100) {
        status = 'concluido';
      } else if (percentual > 0 || hasConteudoEmAndamento || hasAtividadeEmAndamento) {
        status = 'em andamento';
      } else {
        status = 'não iniciado';
      }

      let ultimaAtividade: number | null = null;
      for (let index = topico.atividades.length - 1; index >= 0; index -= 1) {
        const atividade = topico.atividades[index];
        const statusAtividade = String(atividade.status ?? '').toLowerCase();
        const pctAtividade = Number(atividade.percentual_concluido ?? 0);
        const tempoAtividade = Number((atividade as any).tempo_gasto_min ?? 0);
        const hasQuestaoRespondida = Array.isArray((atividade as any).questoes)
          ? (atividade as any).questoes.some((questao: any) => questao?.resposta_aluno != null)
          : false;
        const foiInteragida =
          statusAtividade.includes('andamento') ||
          statusAtividade.includes('concl') ||
          pctAtividade > 0 ||
          tempoAtividade > 0 ||
          (atividade as any).resposta_aluno != null ||
          Number((atividade as any).ultima_tentativa ?? 0) > 0 ||
          hasQuestaoRespondida;
        if (foiInteragida) {
          ultimaAtividade = Number(atividade.id);
          break;
        }
      }

      // Atualiza no banco
      await supabase
        .from('topico_aluno')
        .upsert({
          aluno_id: this.aluno_id,
          topico_id: topicoId,
          percentual_concluido: percentual,
          status: status,
          ultima_atividade: ultimaAtividade,
          ultima_visualizacao: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'aluno_id,topico_id'
        });

      // Atualiza objeto local
      topico.percentual_concluido = percentual;
      topico.status = status;
      topico.ultima_atividade = ultimaAtividade;

      console.log(`[Classe] Tópico ${topicoId} atualizado: ${percentual.toFixed(1)}%`);
    } catch (err) {
      console.warn('[Classe] Erro ao atualizar progresso do tópico:', err);
    }
  }

  /** ✅ NOVO: Calcula progresso geral da classe */
  getProgressoGeral(): number {
    return buildClasseAcademicMetrics(this).progressPct;
  }

  toJSON() {
    return {
      aluno_id: this.aluno_id,
      classe_id: this.classe_id,
      resumo: this.resumo,
      topicos: this.topicos,
    }
  }

  /** ===== PRIVADOS ===== */

  private static fromResumoRow(row: any): Classe {
    const c = new Classe(row.aluno_id, row.classe_id)
    c.resumo = Classe.mapResumoRow(row)
    return c
  }

  private static mapResumoRow(row: any): ClasseResumo {
    return {
      aluno_id: row.aluno_id,
      classe_id: row.classe_id,
      materia_nome: row.materia_nome ?? null,
      materia_descricao: row.materia_descricao ?? null,
      professor_nome: row.professor_nome ?? null,
      professor_descricao: row.professor_descricao ?? null,
      notaMedia: row.notamedia ?? null,
      tempoMedioPorAtividade: row.tempomedioporatividade ?? null,
      acertosPercentual: row.acertospercentual ?? null,
      porcentagemConcluida: row.porcentagemconcluida ?? null,
      ultimaAtividade: row.ultimaatividade ?? null,
      tempoGastoMin: row.tempogastomin ?? null,
      isComplete: row.iscomplete ?? null,
      atividadesConcluidas: row.atividadesconcluidas ?? null,
      recomendacaoTrilha: row.recomendacaotrilha ?? null,
      modoOperacao: row.modooperacao ?? null,
      insights: row.insights ?? null,
      perfisDetectados: row.perfisdetectados ?? null,
    }
  }

  private static async loadResumo(aluno_id: string, classe_id: number): Promise<ClasseResumo | null> {
    const { data, error } = await supabase
      .from('vw_aluno_classe_resumo')
      .select('*')
      .eq('aluno_id', aluno_id)
      .eq('classe_id', classe_id)
      .single()

    if (error && (error as any).code !== 'PGRST116') throw error
    return data ? Classe.mapResumoRow(data) : null
  }

  // ======= DETALHADO (View) =======
  public static async loadDetalhado(aluno_id: string, classe_id: number): Promise<Topico[]> {
    const { data, error } = await supabase
      .from('vw_aluno_classe_detalhado')
      .select('*')
      .eq('aluno_id', aluno_id)
      .eq('classe_id', classe_id)
      .order('topico_ordem', { ascending: true })
      .order('conteudo_ordem', { ascending: true })
      .order('midia_ordem', { ascending: true })

    if (error) throw error
    

    const topicoMap = new Map<number, Topico>()
    const conteudoMap = new Map<number, Conteudo>()
    const atividadeMap = new Map<number, Atividade>()
    const questaoList: Questao[] = []
    const questaoToAtividade = new Map<number, Atividade>()

    for (const row of data ?? []) {
      const tId = row.topico_id as number
      let topico = topicoMap.get(tId)
      if (!topico) {
        topico = new Topico(
          tId,
          row.classe_id,
          row.topico_nome,
          row.topico_descricao ?? null,
          row.topico_ordem ?? null,
          row.topico_next ?? null,
          row.topico_depende ?? null,
          row.topico_status ?? null,
          row.topico_percentual_concluido ?? null,
          (row as any).topico_tempo_gasto_min ?? null,
          row.topico_ultima_atividade ?? null,
          row.topico_ultima_visualizacao ?? null,
          row.topico_updated_at ?? null
        )
        topicoMap.set(tId, topico)
      }

      const cId = (row.conteudo_id ?? null) as number | null
      if (cId) {
        let conteudo = conteudoMap.get(cId)
        if (!conteudo) {
          conteudo = new Conteudo(
            cId,
            row.conteudo_titulo,
            row.conteudo_tipo,
            row.conteudo_conteudo ?? null,
            row.conteudo_ordem ?? null,
            row.conteudo_metadata ?? null,
            row.conteudo_status ?? null,
            row.conteudo_percentual_concluido ?? null,
            row.conteudo_tempo_gasto_min ?? null,
            row.conteudo_ultima_visualizacao ?? null
          )
          conteudoMap.set(cId, conteudo)
          topico.addConteudo(conteudo)
        }

        const mId = (row.midia_id ?? null) as number | null
        if (mId) {
          conteudo.addMidia(
            new Midia(
              mId,
              row.midia_tipo ?? null,
              row.midia_url ?? null,
              row.midia_legenda ?? null,
              row.midia_ordem ?? null
            )
          )
        }
      }

      const aId = (row.atividade_id ?? null) as number | null
      if (aId) {
        let atividade = atividadeMap.get(aId)
        if (!atividade) {
          atividade = new Atividade(
            aId,
            row.atividade_titulo,
            row.atividade_descricao ?? null,
            row.atividade_tipo ?? null,
            row.status??null,
            row.pontuacao_maxima ?? null,
            row.atividade_data_entrega ?? null,
            (row as any).atividade_tempo_gasto_min ?? null,
            (row as any).atividade_metadata ?? null
          )
          atividade.topico_id = topico.id
          atividade.pontuacao_obtida = (row as any).atividade_pontuacao_obtida ?? null
          atividade.pontuacao_maxima_avaliada = (row as any).atividade_pontuacao_maxima ?? null
          atividade.mostrar_gabarito_ao_errar =
            (row as any).atividade_mostrar_gabarito_ao_errar ??
            (row as any).atividade_mostrar_resposta ??
            (row as any).atividade_exibir_gabarito ??
            null
          atividade.percentual_concluido =
            (row as any).atividade_percentual_concluido ??
            (String(row.status ?? '').toLowerCase().includes('concl') ? 100 : 0)
          atividadeMap.set(aId, atividade)
          topico.addAtividade(atividade)
        }

        const qId = (row.questao_id ?? null) as number | null
        if (qId && !atividade.questoes.find(q => q.id === qId)) {
          const rawMostrarGabarito =
            (row as any).questao_mostrar_gabarito_ao_errar ??
            (row as any).questao_mostrar_resposta ??
            (row as any).questao_modo_adaptacao ??
            null
          const questaoMetadata =
            toObjectRecord((row as any).questao_metadata ?? (row as any).questao_meta ?? null)
          const questaoMidiaUrl = pickFirstString(
            row.questao_midia_url ?? null,
            (row as any).questao_media_url ?? null,
            (row as any).questao_url_midia ?? null
          )
          const questaoMidias = mergeMediaCandidates(
            (row as any).questao_midias ?? null,
            (row as any).questao_media ?? null,
            (row as any).questao_anexos ?? null,
            (row as any).questao_arquivos ?? null,
            (row as any).questao_fontes ?? null,
            (row as any).questao_materiais ?? null,
            (questaoMetadata as any)?.midias ?? null,
            (questaoMetadata as any)?.media ?? null,
            (questaoMetadata as any)?.anexos ?? null,
            (questaoMetadata as any)?.arquivos ?? null,
            (questaoMetadata as any)?.fontes ?? null,
            (questaoMetadata as any)?.materiais ?? null
          )
          const questaoMidia =
            (row as any).questao_midia ??
            (row as any).questao_media_item ??
            (questaoMetadata as any)?.midia ??
            null

          const questao = new Questao(
            qId,
            row.questao_enunciado,
            row.questao_tipo ?? null,
            row.questao_alternativas ?? null,
            row.questao_resposta_correta ?? null,
            questaoMidiaUrl,
            {
              resposta_aluno: (row as any).questao_resposta_aluno ?? null,
              correta_aluno: (row as any).questao_correta ?? (row as any).questao_correta_aluno ?? null,
              ultima_tentativa: (row as any).questao_tentativa ?? null,
              acertos_percentual: (row as any).questao_acertos_percentual ?? null,
              tempo_gasto_seg: (row as any).questao_tempo_gasto_seg ?? null,
              metadata: questaoMetadata,
              midia: questaoMidia,
              midias: questaoMidias,
              media: toArrayValue((row as any).questao_media ?? null),
              anexos: toArrayValue((row as any).questao_anexos ?? null),
              arquivos: toArrayValue((row as any).questao_arquivos ?? null),
              fontes: toArrayValue((row as any).questao_fontes ?? null),
              materiais: toArrayValue((row as any).questao_materiais ?? null),
              audio_url: pickFirstString(
                (row as any).questao_audio_url ?? null,
                (questaoMetadata as any)?.audio_url ?? null
              ),
              video_url: pickFirstString(
                (row as any).questao_video_url ?? null,
                (questaoMetadata as any)?.video_url ?? null
              ),
              imagem_url: pickFirstString(
                (row as any).questao_imagem_url ?? null,
                (questaoMetadata as any)?.imagem_url ?? null
              ),
              image_url: pickFirstString(
                (row as any).questao_image_url ?? null,
                (questaoMetadata as any)?.image_url ?? null
              ),
              pdf_url: pickFirstString(
                (row as any).questao_pdf_url ?? null,
                (questaoMetadata as any)?.pdf_url ?? null
              ),
              arquivo_url: pickFirstString(
                (row as any).questao_arquivo_url ?? null,
                (questaoMetadata as any)?.arquivo_url ?? null
              ),
              file_url: pickFirstString(
                (row as any).questao_file_url ?? null,
                (questaoMetadata as any)?.file_url ?? null
              ),
              document_url: pickFirstString(
                (row as any).questao_document_url ?? null,
                (questaoMetadata as any)?.document_url ?? null
              ),
              documento_url: pickFirstString(
                (row as any).questao_documento_url ?? null,
                (questaoMetadata as any)?.documento_url ?? null
              ),
              apresentacao_url: pickFirstString(
                (row as any).questao_apresentacao_url ?? null,
                (questaoMetadata as any)?.apresentacao_url ?? null
              ),
              embed_html: pickFirstString(
                (row as any).questao_embed_html ?? null,
                (questaoMetadata as any)?.embed_html ?? null
              ),
              html: pickFirstString(
                (row as any).questao_html ?? null,
                (questaoMetadata as any)?.html ?? null
              ),
              mostrar_gabarito_ao_errar:
                typeof rawMostrarGabarito === 'boolean'
                  ? rawMostrarGabarito
                  : typeof rawMostrarGabarito === 'string'
                  ? !String(rawMostrarGabarito).toLowerCase().includes('ocultar')
                  : undefined,
            }
          )
          atividade.addQuestao(questao)
          questaoList.push(questao)
          questaoToAtividade.set(qId, atividade)

          if (questao.resposta_aluno && !atividade.resposta_aluno) {
            atividade.resposta_aluno = questao.resposta_aluno
            atividade.correta_aluno = questao.correta_aluno
            atividade.acertos_percentual = questao.acertos_percentual
            atividade.ultima_tentativa = questao.ultima_tentativa
          }
        }

        const acConteudoId = (row.atividade_conteudo_conteudo_id ?? null) as number | null
        if (acConteudoId) {
          atividade.linkConteudo(acConteudoId)
          const c = conteudoMap.get(acConteudoId)
          if (c) c.linkAtividade(aId)
        }
      }
    }

    if (atividadeMap.size > 0) {
      try {
        const atividadeIds = Array.from(atividadeMap.keys())
        const { data: atividadeMetadataRows, error: atividadeMetadataError } = await supabase
          .from('atividades')
          .select('id, metadata')
          .in('id', atividadeIds)

        if (!atividadeMetadataError) {
          ;(atividadeMetadataRows ?? []).forEach((row: any) => {
            const atividade = atividadeMap.get(Number(row.id))
            if (!atividade) return
            atividade.metadata = (row?.metadata ?? null) as Record<string, unknown> | null
          })
        }
      } catch (err) {
        console.warn('[Classe] Erro ao hidratar metadata das atividades:', err)
      }
    }

    if (questaoList.length) {
      try {
        const questaoIds = Array.from(new Set(questaoList.map((q) => q.id)))
        const latestByQuestao = await QuestaoAluno.buscarUltimasPorQuestoes(aluno_id, questaoIds)

        questaoList.forEach((q) => {
          const resp = latestByQuestao[q.id]
          if (!resp) return
          q.resposta_aluno = resp.resposta ?? q.resposta_aluno ?? null
          q.correta_aluno = resp.correta ?? q.correta_aluno ?? null
          q.ultima_tentativa = resp.tentativa ?? q.ultima_tentativa ?? null
          q.acertos_percentual = resp.acertos_percentual ?? q.acertos_percentual ?? null
          q.tempo_gasto_seg = resp.tempo_gasto_seg ?? q.tempo_gasto_seg ?? null

          const atividade = questaoToAtividade.get(q.id)
          if (atividade) {
            atividade.resposta_aluno = resp.resposta ?? atividade.resposta_aluno
            atividade.correta_aluno = resp.correta ?? atividade.correta_aluno
            atividade.acertos_percentual = resp.acertos_percentual ?? atividade.acertos_percentual
            atividade.ultima_tentativa = resp.tentativa ?? atividade.ultima_tentativa
          }
        })
      } catch (err) {
        console.warn('[Classe] Erro ao carregar respostas do aluno:', err)
      }
    }

    return Array.from(topicoMap.values()).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
  }
}
