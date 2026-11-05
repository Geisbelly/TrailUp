import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import SegmentedPills from "../dashboard/SegmentedPills";
import { Secao } from "../tecnico/pecasDoPainel";
import { comoLiberaARara, filtrarMolduras, lerMolduras, precoParaGravar, type AcaoAdmin, type FiltroDeOrigem, type MolduraAdmin, type Molduras } from "./administracao";
import { CampoDeBusca, CLASSE_SELECT, Estado, useEscrita, useLeitura, Vazio, type Escrever } from "./comum";

const ORIGENS: { value: FiltroDeOrigem; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "loja", label: "Loja" },
  { value: "conquista", label: "Conquista" },
  { value: "acao", label: "Ação" },
];

const LINHA = "flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2";

function LinhaDaMoldura({ m, acoes, ocupado, escrever }: { m: MolduraAdmin; acoes: AcaoAdmin[]; ocupado: boolean; escrever: Escrever }) {
  const salvo = m.preco === null ? "" : String(m.preco);
  const [ativa, setAtiva] = useState(m.ativa);
  const [preco, setPreco] = useState(salvo);
  useEffect(() => {
    setAtiva(m.ativa);
    setPreco(salvo);
  }, [m.ativa, salvo]);
  const gravar = precoParaGravar(m.origem, preco);
  const mudou = ativa !== m.ativa || preco !== salvo;
  const rara = m.origem === "acao" ? comoLiberaARara(m.codigo, acoes) : null;

  return (
    <li className={LINHA}>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-foreground">{m.nome}</div>
        <div className="truncate text-[11.5px] text-muted-foreground">
          {rara ? <span className={rara.alerta ? "font-semibold text-[hsl(var(--warning))]" : undefined}>{rara.texto}</span> : m.origem === "conquista" ? `Conquista${m.conquista ? `: ${m.conquista}` : ""}` : "Loja"} · {m.donos} {m.donos === 1 ? "aluno tem" : "alunos têm"}
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        {m.origem === "loja" && <Input aria-label={`Preço de ${m.nome}`} type="number" min={1} max={1000} value={preco} onChange={(e) => setPreco(e.target.value)} className="h-8 w-20 text-[12.5px]" />}
        <Switch aria-label={`${m.nome} ativa`} checked={ativa} onCheckedChange={setAtiva} />
        <Button type="button" size="sm" variant="outline" className="h-8" disabled={ocupado || !gravar.ok || !mudou} onClick={() => gravar.ok && void escrever("admin_moldura_salvar", { p_codigo: m.codigo, p_ativa: ativa, p_preco: gravar.preco }, `${m.nome} salva.`)}>
          Salvar
        </Button>
      </div>
    </li>
  );
}

function LinhaDaAcao({ a, raras, ocupado, escrever }: { a: AcaoAdmin; raras: MolduraAdmin[]; ocupado: boolean; escrever: Escrever }) {
  const salva = a.moldura_codigo ?? "";
  const [ativa, setAtiva] = useState(a.ativa);
  const [moldura, setMoldura] = useState(salva);
  useEffect(() => {
    setAtiva(a.ativa);
    setMoldura(salva);
  }, [a.ativa, salva]);
  const mudou = ativa !== a.ativa || moldura !== salva;

  return (
    <li className={LINHA}>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-foreground">{a.rotulo}</div>
        <div className="truncate text-[11.5px] text-muted-foreground">
          {a.descricao ? `${a.descricao} · ` : ""}
          {a.feitas} {a.feitas === 1 ? "aluno fez" : "alunos fizeram"}
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <select aria-label={`Moldura de ${a.rotulo}`} className={`${CLASSE_SELECT} h-8`} value={moldura} onChange={(e) => setMoldura(e.target.value)}>
          <option value="">Sem moldura</option>
          {raras.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.nome}
            </option>
          ))}
        </select>
        <Switch aria-label={`${a.rotulo} ativa`} checked={ativa} onCheckedChange={setAtiva} />
        <Button type="button" size="sm" variant="outline" className="h-8" disabled={ocupado || !mudou} onClick={() => void escrever("admin_moldura_acao_salvar", { p_acao: a.acao, p_ativa: ativa, p_moldura: moldura || null }, `${a.rotulo} salva.`)}>
          Salvar
        </Button>
      </div>
    </li>
  );
}

export default function AbaMolduras() {
  const { dados, erro, carregar } = useLeitura<Molduras>("admin_molduras", {}, lerMolduras);
  const { ocupado, escrever } = useEscrita(carregar);
  const [termo, setTermo] = useState("");
  const [origem, setOrigem] = useState<FiltroDeOrigem>("todas");
  const lista = useMemo(() => filtrarMolduras(dados?.molduras ?? [], termo, origem), [dados, termo, origem]);
  if (!dados) return <Estado erro={erro} />;
  const raras = dados.molduras.filter((m) => m.origem === "acao");
  return (
    <div className="flex flex-col gap-6">
      <Secao id="admin-molduras" titulo="Catálogo">
        <p className="text-[12.5px] text-muted-foreground">Desligar tira a moldura da loja e das recompensas. Quem já tem continua com ela. Toda mudança vai para a auditoria.</p>
        <div className="flex flex-wrap items-center gap-2">
          <CampoDeBusca rotulo="Buscar moldura ou conquista" valor={termo} onChange={setTermo} contagem={`${lista.length} de ${dados.molduras.length}`} className="min-w-[220px] flex-1" />
          <SegmentedPills<FiltroDeOrigem> ariaLabel="Filtrar por origem" opcoes={ORIGENS} valor={origem} onChange={setOrigem} />
        </div>
        {lista.length === 0 ? (
          <Vazio>Nenhuma moldura com esse filtro.</Vazio>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {lista.map((m) => (
              <LinhaDaMoldura key={m.codigo} m={m} acoes={dados.acoes} ocupado={ocupado} escrever={escrever} />
            ))}
          </ul>
        )}
      </Secao>
      <Secao id="admin-acoes" titulo="Ações que liberam moldura rara">
        <p className="text-[12.5px] text-muted-foreground">A ação é declarada pelo app e libera a moldura uma vez por aluno. Desligada, o app continua registrando quem fez, mas não entrega.</p>
        {dados.acoes.length === 0 ? (
          <Vazio>Nenhuma ação cadastrada.</Vazio>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {dados.acoes.map((a) => (
              <LinhaDaAcao key={a.acao} a={a} raras={raras} ocupado={ocupado} escrever={escrever} />
            ))}
          </ul>
        )}
      </Secao>
    </div>
  );
}
