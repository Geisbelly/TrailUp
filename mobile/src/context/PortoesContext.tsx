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
  /** A turma cujos portões `aberturas` descreve. */
  turmaAtual: number | null;
  /** Quem sabe a turma escolhida é o `TrilhaContext`, que mora ABAIXO deste provider. */
  definirTurma: (classeId: number | null) => void;
  progresso: ProgressoDoAluno;
  carregando: boolean;
  /** A cerimônia que está na vez, ou `null`. Uma de cada vez. */
  cerimoniaAtual: Funcionalidade | null;
  /** Marca a cerimônia como vista e passa para a próxima da fila. */
  concluirCerimonia: () => void;
  recarregar: () => void;
}

/** O que a view devolve, como o PostgREST entrega (numericos podem vir string). */
type LinhaDaView = {
  classe_id: number | string;
  conteudos_concluidos: number | string | null;
  topicos_concluidos: number | string | null;
  social_liberado: boolean | null;
  rank_liberado: boolean | null;
};

type LinhaDePortao = { social: boolean; rank: boolean; progresso: ProgressoDoAluno };

const PortoesContext = createContext<PortoesContextValue | null>(null);

// Enquanto o progresso não chegou, tudo fica fechado. Abrir por padrão e fechar
// depois faria a aba piscar; fechar e abrir depois é só a aba aparecendo.
const FECHADO = avaliarPortoes(PROGRESSO_ZERADO);

export const PortoesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { usuario } = useUsuario();
  const alunoId = usuario?.id ?? null;

  const [turmaAtual, setTurmaAtual] = useState<number | null>(null);
  // Uma linha por turma, como a view devolve. `null` = ainda nao sei.
  const [porTurma, setPorTurma] = useState<Record<number, LinhaDePortao> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [jaVistas, setJaVistas] = useState<Funcionalidade[] | null>(null);
  const [versao, setVersao] = useState(0);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  // Quem decide e' a view `vw_portoes_do_aluno` (migration 20261022_02), uma linha por
  // (aluno, turma). Antes eram DUAS contagens aqui, globais — nem `conteudo_aluno` nem
  // `topico_aluno` tem `classe_id` — e qualquer erro de rede virava zero, trancando as abas
  // de quem ja' tinha concluido.
  useEffect(() => {
    if (!alunoId) {
      setPorTurma(null);
      setCarregando(false);
      return;
    }

    let ativo = true;
    setCarregando(true);

    void (async () => {
      const { data, error } = await supabase
        .from("vw_portoes_do_aluno")
        .select("classe_id, conteudos_concluidos, topicos_concluidos, social_liberado, rank_liberado");

      if (!ativo) return;

      if (error || !data) {
        // Sem resposta o estado e' DESCONHECIDO, nao "fechado": manter `porTurma` como esta'
        // preserva a ultima leitura boa em vez de trancar a aba de quem ja' concluiu. Na
        // primeira carga ele ainda e' `null`, e `null` segura tudo fechado.
        setCarregando(false);
        return;
      }

      const mapa: Record<number, LinhaDePortao> = {};
      for (const linha of data as unknown as LinhaDaView[]) {
        mapa[Number(linha.classe_id)] = {
          social: Boolean(linha.social_liberado),
          rank: Boolean(linha.rank_liberado),
          progresso: {
            conteudosConcluidos: Number(linha.conteudos_concluidos ?? 0),
            topicosConcluidos: Number(linha.topicos_concluidos ?? 0),
          },
        };
      }
      setPorTurma(mapa);
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
  // A cerimonia e' por TURMA: o portao que abriu na turma A nao foi "visto" na turma B, onde
  // ele ainda nem abriu. Sem a turma na chave, entrar numa turma nova abriria a aba calada.
  useEffect(() => {
    if (!alunoId || turmaAtual == null) {
      setJaVistas(null);
      return;
    }

    let ativo = true;
    void (async () => {
      const pares = await Promise.all(
        PORTOES.map(async (portao) => {
          const marca = await AsyncStorage.getItem(
            chaveDaCerimonia(alunoId, portao.funcionalidade, turmaAtual),
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
  }, [alunoId, turmaAtual]);

  const linha = useMemo(
    () => (turmaAtual != null && porTurma ? (porTurma[turmaAtual] ?? null) : null),
    [porTurma, turmaAtual],
  );

  // Sem linha, tudo fechado: pode ser "ainda nao carregou" ou "turma nao escolhida". Abrir por
  // padrao e fechar depois faria a aba piscar; fechar e abrir depois e' so' a aba aparecendo.
  const aberturas: Aberturas = useMemo(
    () => (linha ? { social: linha.social, rank: linha.rank } : FECHADO),
    [linha],
  );

  const progresso = linha?.progresso ?? PROGRESSO_ZERADO;

  const cerimoniaAtual = useMemo(() => {
    // `jaVistas === null` é "ainda não sei" -- mostrar antes de saber repetiria
    // a cerimônia toda vez que o app abrisse.
    if (carregando || jaVistas === null || turmaAtual == null) return null;
    return cerimoniasPendentes(aberturas, jaVistas)[0] ?? null;
  }, [aberturas, carregando, jaVistas, turmaAtual]);

  const concluirCerimonia = useCallback(() => {
    const atual = cerimoniaAtual;
    if (!atual || !alunoId || turmaAtual == null) return;

    // Marca antes de esperar o disco: se a gravação falhar, o pior caso é a
    // cerimônia voltar na próxima abertura -- melhor que travar a fila.
    setJaVistas((antes) => (antes ? [...antes, atual] : [atual]));
    void AsyncStorage.setItem(
      chaveDaCerimonia(alunoId, atual, turmaAtual),
      String(Date.now()),
    ).catch(() => undefined);
  }, [alunoId, cerimoniaAtual, turmaAtual]);

  const definirTurma = useCallback((classeId: number | null) => {
    setTurmaAtual((atual) => (atual === classeId ? atual : classeId));
  }, []);

  const value = useMemo(
    () => ({
      aberturas,
      turmaAtual,
      definirTurma,
      progresso,
      carregando,
      cerimoniaAtual,
      concluirCerimonia,
      recarregar,
    }),
    [aberturas, turmaAtual, definirTurma, progresso, carregando, cerimoniaAtual, concluirCerimonia, recarregar],
  );

  return <PortoesContext.Provider value={value}>{children}</PortoesContext.Provider>;
};

export function usePortoes(): PortoesContextValue {
  const ctx = useContext(PortoesContext);
  if (!ctx) {
    // Fora do provider nada trava: esconder por acidente é pior que mostrar.
    return {
      aberturas: avaliarPortoes({ conteudosConcluidos: 1, topicosConcluidos: 1 }),
      turmaAtual: null,
      definirTurma: () => undefined,
      progresso: PROGRESSO_ZERADO,
      carregando: false,
      cerimoniaAtual: null,
      concluirCerimonia: () => undefined,
      recarregar: () => undefined,
    };
  }
  return ctx;
}
