import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRequestGuard } from "@/lib/requestGuard";
import { lerAcessosDosAlunos, lerDisponibilidade, type AcessoDoAluno, type Disponibilidade } from "./disponibilidade";
import { eSemPermissao } from "./painelTecnico";

export type EstadoDaLeitura = { tipo: "carregando" } | { tipo: "pronto" } | { tipo: "indisponivel" } | { tipo: "erro"; detalhe: string };

const INTERVALO_MS = 60_000;

function eFuncaoAusente(erro: { code?: string } | null | undefined): boolean {
  return erro?.code === "42883" || erro?.code === "PGRST202";
}

/** Lê direto do Supabase: a API é uma das coisas observadas, e este painel não pode cair junto com ela. */
export function useDisponibilidade(horas: number) {
  const [dados, setDados] = useState<Disponibilidade | null>(null);
  const [estado, setEstado] = useState<EstadoDaLeitura>({ tipo: "carregando" });
  const guarda = useRef(createRequestGuard());

  const carregar = useCallback(async () => {
    const request = guarda.current.next();
    const { data, error } = await supabase.rpc("painel_disponibilidade" as never, { p_horas: horas } as never);
    if (!request.isCurrent()) return;
    if (error) {
      if (eFuncaoAusente(error)) return setEstado({ tipo: "indisponivel" });
      return setEstado((atual) => (atual.tipo === "pronto" ? atual : { tipo: "erro", detalhe: eSemPermissao(error) ? "Sem permissão." : error.message ?? "erro desconhecido" }));
    }
    const lido = lerDisponibilidade(data);
    if (!lido) return setEstado({ tipo: "erro", detalhe: "Resposta inesperada do banco." });
    setDados(lido);
    setEstado({ tipo: "pronto" });
  }, [horas]);

  useEffect(() => {
    void carregar();
    const timer = window.setInterval(() => void carregar(), INTERVALO_MS);
    return () => window.clearInterval(timer);
  }, [carregar]);

  return { dados, estado };
}

/** A lista por aluno. Mostrar os nomes é um pedido explícito, registrado pelo banco em `monitor_consulta`. */
export function useAcessosDosAlunos(dias: number) {
  const [alunos, setAlunos] = useState<AcessoDoAluno[]>([]);
  const [revelado, setRevelado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const guarda = useRef(createRequestGuard());

  const carregar = useCallback(
    async (revelar: boolean) => {
      const request = guarda.current.next();
      const { data, error } = await supabase.rpc("painel_acessos_alunos" as never, { p_dias: dias, p_revelar: revelar } as never);
      if (!request.isCurrent()) return;
      if (error) return setErro(error.message ?? "erro desconhecido");
      setErro(null);
      setAlunos(lerAcessosDosAlunos(data));
      setRevelado(revelar);
    },
    [dias],
  );

  useEffect(() => {
    void carregar(false);
  }, [carregar]);

  return { alunos, revelado, erro, revelar: () => void carregar(true), ocultar: () => void carregar(false) };
}
