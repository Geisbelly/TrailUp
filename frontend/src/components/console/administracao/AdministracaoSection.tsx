import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { createRequestGuard } from "@/lib/requestGuard";
import SegmentedPills from "../dashboard/SegmentedPills";
import { quando } from "../tecnico/disponibilidade";
import { Numero, Secao, Tabela } from "../tecnico/pecasDoPainel";
import {
  alunosParaVincular,
  lerAcessos,
  lerEconomia,
  lerMolduras,
  precoParaGravar,
  rotuloDoAluno,
  type AcaoAdmin,
  type Acessos,
  type Economia,
  type MolduraAdmin,
  type Molduras,
  type ProfessorAdmin,
} from "./administracao";

type Aba = "acessos" | "molduras" | "economia";

const ABAS: { value: Aba; label: string }[] = [
  { value: "acessos", label: "Professores e alunos" },
  { value: "molduras", label: "Molduras" },
  { value: "economia", label: "Economia" },
];

const CLASSE_SELECT = "h-9 max-w-full rounded-lg border border-border bg-background px-2 text-[12.5px] text-foreground";

async function chamar(funcao: string, argumentos: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await supabase.rpc(funcao as never, argumentos as never);
  if (error) throw new Error(error.code === "42501" ? "Sem permissão." : error.message || "Falha ao falar com o banco.");
  return data;
}

/** Lê direto do banco, como o painel técnico: a tela não pode cair junto com a API. */
function useLeitura<T>(funcao: string, argumentos: Record<string, unknown>, ler: (dado: unknown) => T | null) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const guarda = useRef(createRequestGuard());
  const chave = JSON.stringify(argumentos);

  const carregar = useCallback(async () => {
    const pedido = guarda.current.next();
    try {
      const lido = ler(await chamar(funcao, JSON.parse(chave)));
      if (!pedido.isCurrent()) return;
      if (!lido) return setErro("Resposta inesperada do banco.");
      setDados(lido);
      setErro(null);
    } catch (e) {
      if (pedido.isCurrent()) setErro(e instanceof Error ? e.message : "Falha ao ler.");
    }
  }, [funcao, chave, ler]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { dados, erro, carregar };
}

function Estado({ erro }: { erro: string | null }) {
  if (erro) return <p role="alert" className="text-[13px] text-destructive">Não foi possível carregar: {erro}</p>;
  return (
    <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…
    </p>
  );
}

/** Roda uma escrita, avisa o resultado e relê. A frase de erro é a do banco. */
function useEscrita(depois: () => Promise<void>) {
  const [ocupado, setOcupado] = useState(false);
  const escrever = useCallback(
    async (funcao: string, argumentos: Record<string, unknown>, sucesso: string) => {
      setOcupado(true);
      try {
        await chamar(funcao, argumentos);
        await depois();
        toast.success(sucesso);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
      } finally {
        setOcupado(false);
      }
    },
    [depois],
  );
  return { ocupado, escrever };
}

function CartaoDoProfessor({ p, alunos, ocupado, escrever }: { p: ProfessorAdmin; alunos: Acessos["alunos"]; ocupado: boolean; escrever: ReturnType<typeof useEscrita>["escrever"] }) {
  const [escolhido, setEscolhido] = useState("");
  const disponiveis = alunosParaVincular(p, alunos);
  const nome = p.nome ?? "Professor sem nome";
  const detalhes = [p.instituicao, p.disciplina].filter(Boolean).join(" · ");

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-bold text-foreground">{nome}</h3>
          <p className="text-[12.5px] text-muted-foreground">{detalhes || "Sem instituição informada"}</p>
          {p.descricao && <p className="mt-1 text-[12.5px] text-muted-foreground">{p.descricao}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-semibold text-foreground">{p.liberado ? "Liberado" : "Bloqueado"}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={ocupado}
            onClick={() => void escrever("admin_professor_liberar", { p_professor: p.professor_id, p_liberado: !p.liberado }, p.liberado ? `${nome} bloqueado.` : `${nome} liberado.`)}
          >
            {p.liberado ? "Bloquear" : "Liberar"}
          </Button>
        </div>
      </div>

      {p.alunos.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">Nenhum aluno vinculado diretamente.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {p.alunos.map((a) => (
            <li key={a.aluno_id} className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-foreground">
              <span className="min-w-0 break-words">{rotuloDoAluno(a)}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={ocupado}
                aria-label={`Desvincular ${rotuloDoAluno(a)} de ${nome}`}
                onClick={() => void escrever("admin_professor_aluno", { p_professor: p.professor_id, p_aluno: a.aluno_id, p_has_acesso: false }, "Vínculo removido.")}
              >
                Desvincular
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={`Aluno para vincular a ${nome}`} className={CLASSE_SELECT} value={escolhido} onChange={(e) => setEscolhido(e.target.value)} disabled={disponiveis.length === 0}>
          <option value="">{disponiveis.length === 0 ? "Todos os alunos já vinculados" : "Escolha um aluno"}</option>
          {disponiveis.map((a) => (
            <option key={a.aluno_id} value={a.aluno_id}>
              {rotuloDoAluno(a)}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          disabled={ocupado || !escolhido}
          onClick={() => {
            void escrever("admin_professor_aluno", { p_professor: p.professor_id, p_aluno: escolhido, p_has_acesso: true }, "Aluno vinculado.");
            setEscolhido("");
          }}
        >
          Vincular
        </Button>
      </div>
    </li>
  );
}

function AbaAcessos() {
  const { dados, erro, carregar } = useLeitura("admin_acessos", {}, lerAcessos);
  const { ocupado, escrever } = useEscrita(carregar);
  if (!dados) return <Estado erro={erro} />;
  const liberados = dados.professores.filter((p) => p.liberado).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Numero rotulo="Professores" valor={dados.professores.length} />
        <Numero rotulo="Liberados" valor={liberados} />
        <Numero rotulo="Alunos" valor={dados.alunos.length} />
      </div>
      <p className="text-[12.5px] text-muted-foreground">Vínculo direto é o acesso do professor a um aluno fora de uma turma. A matrícula em turma não muda aqui.</p>
      {dados.professores.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">Nenhum professor cadastrado.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {dados.professores.map((p) => (
            <CartaoDoProfessor key={p.professor_id} p={p} alunos={dados.alunos} ocupado={ocupado} escrever={escrever} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LinhaDaMoldura({ m, ocupado, escrever }: { m: MolduraAdmin; ocupado: boolean; escrever: ReturnType<typeof useEscrita>["escrever"] }) {
  const [ativa, setAtiva] = useState(m.ativa);
  const [preco, setPreco] = useState(m.preco === null ? "" : String(m.preco));
  useEffect(() => {
    setAtiva(m.ativa);
    setPreco(m.preco === null ? "" : String(m.preco));
  }, [m.ativa, m.preco]);
  const gravar = precoParaGravar(m.origem, preco);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <div className="text-[13px] font-bold text-foreground">{m.nome}</div>
        <div className="text-[12px] text-muted-foreground">
          {m.origem === "conquista" && m.conquista ? `Conquista: ${m.conquista}` : m.origem === "loja" ? "Loja" : "Ação"} · {m.donos} {m.donos === 1 ? "aluno tem" : "alunos têm"}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {m.origem === "loja" && <Input aria-label={`Preço de ${m.nome}`} type="number" min={1} max={1000} value={preco} onChange={(e) => setPreco(e.target.value)} className="h-9 w-24" />}
        <Switch aria-label={`${m.nome} ativa`} checked={ativa} onCheckedChange={setAtiva} />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={ocupado || !gravar.ok}
          onClick={() => gravar.ok && void escrever("admin_moldura_salvar", { p_codigo: m.codigo, p_ativa: ativa, p_preco: gravar.preco }, `${m.nome} salva.`)}
        >
          Salvar
        </Button>
      </div>
    </li>
  );
}

function LinhaDaAcao({ a, raras, ocupado, escrever }: { a: AcaoAdmin; raras: MolduraAdmin[]; ocupado: boolean; escrever: ReturnType<typeof useEscrita>["escrever"] }) {
  const [ativa, setAtiva] = useState(a.ativa);
  const [moldura, setMoldura] = useState(a.moldura_codigo ?? "");
  useEffect(() => {
    setAtiva(a.ativa);
    setMoldura(a.moldura_codigo ?? "");
  }, [a.ativa, a.moldura_codigo]);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <div className="text-[13px] font-bold text-foreground">{a.rotulo}</div>
        <div className="text-[12px] text-muted-foreground">
          {a.descricao ? `${a.descricao} · ` : ""}
          {a.feitas} {a.feitas === 1 ? "aluno fez" : "alunos fizeram"}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label={`Moldura de ${a.rotulo}`} className={CLASSE_SELECT} value={moldura} onChange={(e) => setMoldura(e.target.value)}>
          <option value="">Sem moldura</option>
          {raras.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.nome}
            </option>
          ))}
        </select>
        <Switch aria-label={`${a.rotulo} ativa`} checked={ativa} onCheckedChange={setAtiva} />
        <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => void escrever("admin_moldura_acao_salvar", { p_acao: a.acao, p_ativa: ativa, p_moldura: moldura || null }, `${a.rotulo} salva.`)}>
          Salvar
        </Button>
      </div>
    </li>
  );
}

function AbaMolduras() {
  const { dados, erro, carregar } = useLeitura<Molduras>("admin_molduras", {}, lerMolduras);
  const { ocupado, escrever } = useEscrita(carregar);
  if (!dados) return <Estado erro={erro} />;
  const raras = dados.molduras.filter((m) => m.origem === "acao");
  return (
    <div className="flex flex-col gap-6">
      <Secao id="admin-molduras" titulo="Catálogo">
        <p className="text-[12.5px] text-muted-foreground">Desligar tira a moldura da loja e das recompensas. Quem já tem continua com ela. Toda mudança vai para a auditoria.</p>
        <ul className="flex flex-col gap-2.5">
          {dados.molduras.map((m) => (
            <LinhaDaMoldura key={m.codigo} m={m} ocupado={ocupado} escrever={escrever} />
          ))}
        </ul>
      </Secao>
      <Secao id="admin-acoes" titulo="Ações que liberam moldura rara">
        <p className="text-[12.5px] text-muted-foreground">A ação é declarada pelo app e libera a moldura uma vez por aluno. Desligada, o app continua registrando quem fez, mas não entrega.</p>
        {dados.acoes.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">Nenhuma ação cadastrada.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {dados.acoes.map((a) => (
              <LinhaDaAcao key={a.acao} a={a} raras={raras} ocupado={ocupado} escrever={escrever} />
            ))}
          </ul>
        )}
      </Secao>
    </div>
  );
}

function AbaEconomia() {
  const [filtro, setFiltro] = useState("");
  const [operacao, setOperacao] = useState("");
  const { dados, erro } = useLeitura<Economia>("admin_economia", { p_operacao: operacao || null, p_limite: 80 }, lerEconomia);
  if (!dados) return <Estado erro={erro} />;
  return (
    <div className="flex flex-col gap-6">
      <Secao id="admin-consistencia" titulo="Consistência">
        <Numero rotulo="Alunos com inconsistência" valor={dados.consistencia.length} destaque={dados.consistencia.length > 0} />
        <Tabela
          cabecalho={["Aluno", "Saldo", "Compras sem débito", "Estornos sem crédito"]}
          vazio="Saldos, compras e estornos batem."
          linhas={dados.consistencia.map((c) => [c.aluno_id ?? "—", c.saldo, c.compras_sem_debito, c.estornos_sem_credito])}
        />
      </Secao>
      <Secao id="admin-auditoria" titulo="Auditoria">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setOperacao(filtro.trim());
          }}
        >
          <Input aria-label="Filtrar por operação" placeholder="Operação (ex.: compra)" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-9 w-56" />
          <Button type="submit" size="sm" variant="outline">
            Filtrar
          </Button>
        </form>
        <Tabela
          cabecalho={["Quando", "Operação", "Entidade", "Aluno", "Antes", "Depois"]}
          vazio="Nada registrado com esse filtro."
          linhas={dados.auditoria.map((e) => [
            quando(e.ocorrido_em),
            e.operacao,
            [e.entidade, e.entidade_id].filter(Boolean).join(" ") || "—",
            e.aluno_id ?? "—",
            e.antes === null ? "—" : JSON.stringify(e.antes),
            e.depois === null ? "—" : JSON.stringify(e.depois),
          ])}
        />
      </Secao>
    </div>
  );
}

export default function AdministracaoSection() {
  const [aba, setAba] = useState<Aba>("acessos");
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Administração</h1>
          <p className="text-[13px] text-muted-foreground">Acessos, molduras e auditoria do projeto. Lê e grava direto no banco, e funciona com a API fora do ar.</p>
        </div>
        <SegmentedPills<Aba> ariaLabel="Partes da administração" opcoes={ABAS} valor={aba} onChange={setAba} />
      </header>
      {aba === "acessos" ? <AbaAcessos /> : aba === "molduras" ? <AbaMolduras /> : <AbaEconomia />}
    </div>
  );
}
