import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

import { useUsuario } from "@/context/SessaoContext";
import { supabase } from "@/database/supabase";
import {
  avaliarPortoes,
  cerimoniasPendentes,
  chaveDaCerimonia,
  PORTOES,
  PROGRESSO_ZERADO,
  type Aberturas,
  type Funcionalidade,
  type ProgressoDoAluno,
} from "@/utils/portoes";

interface PortoesContextValue {
  aberturas: Aberturas;
  progresso: ProgressoDoAluno;
  carregando: boolean;
  /** A cerimônia que está na vez, ou `null`. Uma de cada vez. */
  cerimoniaAtual: Funcionalidade | null;
  /** Marca a cerimônia como vista e passa para a próxima da fila. */
  concluirCerimonia: () => void;
  recarregar: () => void;
}

const PortoesContext = createContext<PortoesContextValue | null>(null);

// Enquanto o progresso não chegou, tudo fica fechado. Abrir por padrão e fechar
// depois faria a aba piscar; fechar e abrir depois é só a aba aparecendo.
const FECHADO = avaliarPortoes(PROGRESSO_ZERADO);

export const PortoesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { usuario } = useUsuario();
  const alunoId = usuario?.id ?? null;

  const [progresso, setProgresso] = useState<ProgressoDoAluno>(PROGRESSO_ZERADO);
  const [carregando, setCarregando] = useState(true);
  const [jaVistas, setJaVistas] = useState<Funcionalidade[] | null>(null);
  const [versao, setVersao] = useState(0);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  // Só os dois números que os portões precisam. `head: true` não traz linha
  // nenhuma -- só o total.
  useEffect(() => {
    if (!alunoId) {
      setProgresso(PROGRESSO_ZERADO);
      setCarregando(false);
      return;
    }

    let ativo = true;
    setCarregando(true);

    void (async () => {
      const [conteudos, topicos] = await Promise.all([
        supabase
          .from("conteudo_aluno")
          .select("id", { count: "exact", head: true })
          .eq("aluno_id", alunoId)
          .or("status.eq.concluido,percentual_concluido.gte.100"),
        supabase
          .from("topico_aluno")
          .select("id", { count: "exact", head: true })
          .eq("aluno_id", alunoId)
          .or("status.eq.concluido,percentual_concluido.gte.100"),
      ]);

      if (!ativo) return;

      // Erro de rede não pode abrir portão: sem resposta, fica fechado.
      setProgresso({
        conteudosConcluidos: conteudos.error ? 0 : (conteudos.count ?? 0),
        topicosConcluidos: topicos.error ? 0 : (topicos.count ?? 0),
      });
      setCarregando(false);
    })();

    return () => {
      ativo = false;
    };
  }, [alunoId, versao]);

  // O progresso pode mudar enquanto o aluno continua dentro da mesma tela.
  // Sem esta assinatura, o primeiro conteúdo concluído só atualizava o banco;
  // o snapshot local seguia fechado e mantinha o cadeado na aba.
  useEffect(() => {
    if (!alunoId) return;

    const atualizarAoVoltar = (estado: AppStateStatus) => {
      if (estado === "active") setVersao((v) => v + 1);
    };
    const appStateSubscription = AppState.addEventListener("change", atualizarAoVoltar);
    const channel = supabase
      .channel(`portoes-progresso-${alunoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conteudo_aluno", filter: `aluno_id=eq.${alunoId}` },
        () => setVersao((v) => v + 1),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "topico_aluno", filter: `aluno_id=eq.${alunoId}` },
        () => setVersao((v) => v + 1),
      )
      .subscribe();

    return () => {
      appStateSubscription.remove();
      void supabase.removeChannel(channel);
    };
  }, [alunoId]);

  // Quais cerimônias este aluno já viu.
  useEffect(() => {
    if (!alunoId) {
      setJaVistas(null);
      return;
    }

    let ativo = true;
    void (async () => {
      const pares = await Promise.all(
        PORTOES.map(async (portao) => {
          const marca = await AsyncStorage.getItem(
            chaveDaCerimonia(alunoId, portao.funcionalidade),
          ).catch(() => null);
          return [portao.funcionalidade, marca != null] as const;
        }),
      );

      if (!ativo) return;
      setJaVistas(pares.filter(([, visto]) => visto).map(([f]) => f));
    })();

    return () => {
      ativo = false;
    };
  }, [alunoId]);

  const aberturas = useMemo(
    () => (carregando ? FECHADO : avaliarPortoes(progresso)),
    [carregando, progresso],
  );

  const cerimoniaAtual = useMemo(() => {
    // `jaVistas === null` é "ainda não sei" -- mostrar antes de saber repetiria
    // a cerimônia toda vez que o app abrisse.
    if (carregando || jaVistas === null) return null;
    return cerimoniasPendentes(aberturas, jaVistas)[0] ?? null;
  }, [aberturas, carregando, jaVistas]);

  const concluirCerimonia = useCallback(() => {
    const atual = cerimoniaAtual;
    if (!atual || !alunoId) return;

    // Marca antes de esperar o disco: se a gravação falhar, o pior caso é a
    // cerimônia voltar na próxima abertura -- melhor que travar a fila.
    setJaVistas((antes) => (antes ? [...antes, atual] : [atual]));
    void AsyncStorage.setItem(chaveDaCerimonia(alunoId, atual), String(Date.now())).catch(
      () => undefined,
    );
  }, [alunoId, cerimoniaAtual]);

  const value = useMemo(
    () => ({ aberturas, progresso, carregando, cerimoniaAtual, concluirCerimonia, recarregar }),
    [aberturas, progresso, carregando, cerimoniaAtual, concluirCerimonia, recarregar],
  );

  return <PortoesContext.Provider value={value}>{children}</PortoesContext.Provider>;
};

export function usePortoes(): PortoesContextValue {
  const ctx = useContext(PortoesContext);
  if (!ctx) {
    // Fora do provider nada trava: esconder por acidente é pior que mostrar.
    return {
      aberturas: avaliarPortoes({ conteudosConcluidos: 1, topicosConcluidos: 1 }),
      progresso: PROGRESSO_ZERADO,
      carregando: false,
      cerimoniaAtual: null,
      concluirCerimonia: () => undefined,
      recarregar: () => undefined,
    };
  }
  return ctx;
}
