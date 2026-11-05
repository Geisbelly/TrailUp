import { useMemo, useState } from "react";
import { quando } from "../tecnico/disponibilidade";
import { Numero, Secao, Tabela } from "../tecnico/pecasDoPainel";
import { lerEconomia, resumirMudanca, type Economia } from "./administracao";
import { CLASSE_SELECT, Estado, useLeitura } from "./comum";

export default function AbaEconomia() {
  const [operacao, setOperacao] = useState("");
  const argumentos = useMemo(() => ({ p_operacao: operacao || null, p_limite: 80 }), [operacao]);
  const { dados, erro } = useLeitura<Economia>("admin_economia", argumentos, lerEconomia);
  if (!dados) return <Estado erro={erro} />;
  return (
    <div className="flex flex-col gap-6">
      <Secao id="admin-consistencia" titulo="Consistência">
        <div className="max-w-xs">
          <Numero rotulo="Alunos com inconsistência" valor={dados.consistencia.length} destaque={dados.consistencia.length > 0} />
        </div>
        <Tabela
          cabecalho={["Aluno", "Saldo", "Compras sem débito", "Estornos sem crédito"]}
          vazio="Saldos, compras e estornos batem."
          linhas={dados.consistencia.map((c) => [c.aluno_nome ?? c.aluno_id ?? "—", c.saldo, c.compras_sem_debito, c.estornos_sem_credito])}
        />
      </Secao>
      <Secao id="admin-auditoria" titulo="Auditoria">
        <select aria-label="Filtrar por operação" className={`${CLASSE_SELECT} w-fit`} value={operacao} onChange={(e) => setOperacao(e.target.value)}>
          <option value="">Todas as operações</option>
          {dados.operacoes.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <Tabela
          cabecalho={["Quando", "Operação", "Onde", "Aluno", "O que mudou"]}
          vazio={operacao ? "Nada registrado nessa operação." : "Nenhuma operação registrada ainda."}
          linhas={dados.auditoria.map((e) => [quando(e.ocorrido_em), e.operacao, [e.entidade, e.entidade_id].filter(Boolean).join(" ") || "—", e.aluno_nome ?? e.aluno_id ?? "—", resumirMudanca(e.antes, e.depois)])}
        />
      </Secao>
    </div>
  );
}
