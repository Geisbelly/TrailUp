/**
 * Termo do responsável em papel, registrado pelo professor (#195, caminho C).
 *
 * A regra que vale é a do banco (migração 20261024_02): só aluno matriculado
 * numa turma DESTE professor; versão vigente; data de assinatura não futura;
 * nome e relação obrigatórios num aceite. O professor vê a SITUAÇÃO de cada
 * aluno (`professor_termos_da_turma`), nunca a data de nascimento.
 */
import { supabase } from "@/integrations/supabase/client";

// As MESMAS strings de `api/alembic/versions/20261024_02_*.py`; o teste
// `test_migration_consentimento_responsavel.py` confere que batem.
export const CONSENTIMENTO_RESPONSAVEL_VERSAO = "2026-10-24-resp-v1";
export const CONSENTIMENTO_PESQUISA_VERSAO = "2026-10-24-pesq-v1";

export const FINALIDADES = [
  { chave: "camera", rotulo: "Câmera durante o estudo" },
  { chave: "emocional", rotulo: "Análise de emoções" },
  { chave: "telemetria", rotulo: "Telemetria de uso" },
  { chave: "mentor", rotulo: "Mentor de IA" },
  { chave: "pesquisa", rotulo: "Uso em pesquisa acadêmica" },
] as const;
export type Finalidade = (typeof FINALIDADES)[number]["chave"];
export type Finalidades = Record<Finalidade, boolean>;

export const NENHUMA_FINALIDADE: Finalidades = {
  camera: false,
  emocional: false,
  telemetria: false,
  mentor: false,
  pesquisa: false,
};

export const RELACOES = [
  { valor: "mae", rotulo: "Mãe" },
  { valor: "pai", rotulo: "Pai" },
  { valor: "responsavel_legal", rotulo: "Responsável legal" },
  { valor: "outro", rotulo: "Outro" },
] as const;
export type Relacao = (typeof RELACOES)[number]["valor"];

export type Situacao = "sem_data_nascimento" | "maior" | "menor_sem_termo" | "menor_com_termo";

export type TermoDoAluno = {
  aluno_id: string;
  situacao: Situacao;
  metodo: "aparelho" | "papel" | null;
  versao: string | null;
  decidido_em: string | null;
  vigente: boolean;
};

export function rotuloDaSituacao(t: TermoDoAluno | undefined): { texto: string; tom: "ok" | "pendente" | "neutro" } {
  if (!t) return { texto: "termo: carregando", tom: "neutro" };
  const quando = t.decidido_em ? new Date(t.decidido_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null;
  switch (t.situacao) {
    case "maior":
      return { texto: "maior de idade — termo do responsável não se aplica", tom: "neutro" };
    case "sem_data_nascimento":
      return { texto: "sem data de nascimento — modo restrito", tom: "pendente" };
    case "menor_com_termo":
      return {
        texto: `termo do responsável ${t.metodo === "papel" ? "em papel" : "no app"}${quando ? ` em ${quando}` : ""} (versão ${t.versao})`,
        tom: "ok",
      };
    default:
      return {
        texto:
          t.metodo && !t.vigente && t.versao === CONSENTIMENTO_RESPONSAVEL_VERSAO
            ? `responsável não autorizou${quando ? ` (${quando})` : ""} — modo restrito`
            : "menor sem termo do responsável — modo restrito",
        tom: "pendente",
      };
  }
}

export type DadosTermoPapel = {
  alunoId: string;
  aceito: boolean;
  dataAssinatura: string; // AAAA-MM-DD
  nome: string;
  relacao: Relacao | "";
  finalidades: Finalidades;
};

export function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

export function validarTermoPapel(d: DadosTermoPapel, agora: Date = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dataAssinatura)) return "Informe a data de assinatura do termo.";
  if (d.dataAssinatura > hojeEmBrasilia(agora)) return "A data de assinatura não pode estar no futuro.";
  if (!d.aceito) return null;
  const nome = d.nome.trim();
  if (nome.length < 3 || nome.length > 120) return "Informe o nome completo do responsável.";
  if (!d.relacao) return "Informe a relação do responsável com o aluno.";
  return null;
}

export function argumentosTermoPapel(d: DadosTermoPapel) {
  const finalidades = d.aceito ? d.finalidades : NENHUMA_FINALIDADE;
  return {
    p_aluno: d.alunoId,
    p_versao: CONSENTIMENTO_RESPONSAVEL_VERSAO,
    p_data_assinatura: d.dataAssinatura,
    p_nome_responsavel: d.aceito ? d.nome.trim() : null,
    p_relacao: d.aceito ? d.relacao || null : null,
    p_finalidades: finalidades,
    p_pesquisa_versao: finalidades.pesquisa ? CONSENTIMENTO_PESQUISA_VERSAO : null,
    p_aceito: d.aceito,
  };
}

export async function listarTermosDaTurma(classeId: number): Promise<TermoDoAluno[]> {
  const { data, error } = await supabase.rpc("professor_termos_da_turma" as never, { p_classe_id: classeId } as never);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TermoDoAluno[];
}

export async function registrarTermoPapel(d: DadosTermoPapel): Promise<void> {
  const { error } = await supabase.rpc("professor_registrar_termo_papel" as never, argumentosTermoPapel(d) as never);
  if (error) throw new Error(error.message);
}
