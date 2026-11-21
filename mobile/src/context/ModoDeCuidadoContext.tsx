/**
 * Modo de cuidado no aparelho (spec `2026-11-20-modo-de-cuidado-design.md`, seção 4).
 *
 * A lógica mora em `modoDeCuidado.core.ts` (sem React, testada); aqui só a fiação:
 * - os sinais da IA (`subscribeToSignals`) e o tempo visível na trilha alimentam o detector;
 * - a turma atual pergunta ao banco se há modo valendo (`cuidado_ativo`);
 * - o estado `ativo` é publicado para o `IAContext`, que desliga cronômetros e batalha com
 *   `disabledReason: "modo_cuidado"`;
 * - o aviso do sinal de uso e as técnicas de calma são desenhados aqui, por cima de tudo.
 *
 * Fica dentro do `IAProvider` e do `TrilhaProvider` (`app/(tabs)/_layout.tsx`).
 */
import { AvisoDeCuidado } from "@/components/cuidado/AvisoDeCuidado";
import { TecnicasDeCalma } from "@/components/cuidado/TecnicasDeCalma";
import { useIA } from "@/context/IAContext";
import {
  criarContadorSemParar,
  criarModoDeCuidado,
  publicarModoDeCuidadoAtivo,
  type ModoDeCuidado,
  type NivelDoGuia,
} from "@/context/modoDeCuidado.core";
import { useUsuario } from "@/context/SessaoContext";
import { useTrilha } from "@/context/TrilhaContext";
import { supabase } from "@/database/supabase";
import type { OrigemDoCuidado } from "@/services/cuidadoNoBanco";
import {
  lerConfigDoCuidado,
  lerCuidadoAtivo,
  registrarCuidadoNoBanco,
  responderCuidado,
} from "@/services/cuidadoNoBanco";
import { perfilVisualDoAluno } from "@/utils/brainHex";
import { estaNaTrilhaDeEstudo } from "@/utils/presencaDeEstudo";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { useSegments } from "expo-router";
import React, { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { AppState } from "react-native";

export type ModoDeCuidadoValor = {
  ativo: boolean;
  expiraEm: number | null;
  origem: OrigemDoCuidado | null;
  ligarPeloGuia(nivel: NivelDoGuia, expiraEmIso: string | null): void;
  abrirTecnicas(): void;
};

const INERTE: ModoDeCuidadoValor = {
  ativo: false,
  expiraEm: null,
  origem: null,
  ligarPeloGuia: () => undefined,
  abrirTecnicas: () => undefined,
};

const ModoDeCuidadoContext = createContext<ModoDeCuidadoValor | null>(null);

// A pausa sugerida é de 5 minutos: ficar fora da trilha esse tempo já é uma pausa.
const PAUSA_MIN_MS = 5 * 60_000;
// Conferir prazo e tempo na trilha. Fino o bastante para minutos; o prazo também é conferido
// quando o app volta ao primeiro plano, porque o intervalo não roda em segundo plano.
const TIQUE_MS = 30_000;

/** Constrói o modo com o Supabase de verdade. Separado para o teste montar o seu. */
export function criarModoDeCuidadoNoSupabase(): ModoDeCuidado {
  return criarModoDeCuidado({
    registrar: (params) => registrarCuidadoNoBanco(supabase, params),
    lerAtivo: (classeId) => lerCuidadoAtivo(supabase, classeId),
    responder: (momentoId, resposta) => responderCuidado(supabase, momentoId, resposta),
    agora: () => Date.now(),
  });
}

export function ModoDeCuidadoProvider({
  children,
  modo: modoInjetado,
}: {
  children: React.ReactNode;
  /** Só para teste. */
  modo?: ModoDeCuidado;
}) {
  const modoRef = useRef<ModoDeCuidado | null>(modoInjetado ?? null);
  if (!modoRef.current) modoRef.current = criarModoDeCuidadoNoSupabase();
  const modo = modoRef.current;

  const { usuario } = useUsuario();
  const { classeAtual } = useTrilha();
  const { subscribeToSignals } = useIA();
  const segmentos = useSegments() as string[];
  const naTrilha = estaNaTrilhaDeEstudo(segmentos as readonly string[]);
  const alunoId = usuario?.id ?? null;
  const classeId = classeAtual?.classe_id ?? null;

  const estado = useSyncExternalStore(modo.assinar, modo.estado, modo.estado);

  // Troca de aluno: nada do anterior vale.
  useEffect(() => {
    modo.zerar();
    if (!alunoId) {
      modo.definirConfig(null);
      return;
    }
    let vivo = true;
    void lerConfigDoCuidado(supabase).then((config) => {
      if (vivo) modo.definirConfig(config);
    });
    return () => {
      vivo = false;
    };
  }, [alunoId, modo]);

  useEffect(() => {
    if (!alunoId) return;
    void modo.definirTurma(classeId);
  }, [alunoId, classeId, modo]);

  useEffect(() => subscribeToSignals((sinal) => modo.registrarSinal(sinal)), [modo, subscribeToSignals]);

  // O IAContext lê só este bit.
  useEffect(() => {
    publicarModoDeCuidadoAtivo(estado.ativo);
  }, [estado.ativo]);
  useEffect(() => () => publicarModoDeCuidadoAtivo(false), []);

  // Tempo visível na trilha, sem parar.
  const contadorRef = useRef(criarContadorSemParar(PAUSA_MIN_MS));
  const naTrilhaRef = useRef(naTrilha);
  naTrilhaRef.current = naTrilha;
  useEffect(() => {
    const marcar = () => {
      const visivel = naTrilhaRef.current && AppState.currentState === "active";
      modo.registrarMinutosNaTrilha(contadorRef.current.marcar(visivel, Date.now()));
    };
    const tique = () => {
      modo.conferirExpiracao();
      marcar();
    };
    tique();
    const id = setInterval(tique, TIQUE_MS);
    const inscricao = AppState.addEventListener("change", tique);
    return () => {
      clearInterval(id);
      inscricao.remove();
    };
  }, [modo, naTrilha]);
  // Fim do modo: a contagem recomeça, senão o tempo de antes dispararia o aviso de novo.
  useEffect(() => {
    if (!estado.ativo) contadorRef.current.zerar();
  }, [estado.ativo]);

  const palette = getProfileShellPalette(perfilVisualDoAluno(usuario) ?? null);

  const valor = useMemo<ModoDeCuidadoValor>(
    () => ({
      ativo: estado.ativo,
      expiraEm: estado.expiraEm,
      origem: estado.origem,
      ligarPeloGuia: modo.ligarPeloGuia,
      abrirTecnicas: modo.abrirTecnicas,
    }),
    [estado.ativo, estado.expiraEm, estado.origem, modo]
  );

  return (
    <ModoDeCuidadoContext.Provider value={valor}>
      {children}
      <AvisoDeCuidado
        visivel={estado.avisoVisivel}
        palette={palette}
        onPausar={modo.fazerPausa}
        onContinuar={modo.continuar}
      />
      <TecnicasDeCalma visivel={estado.tecnicasVisiveis} palette={palette} onFechar={modo.fecharTecnicas} />
    </ModoDeCuidadoContext.Provider>
  );
}

/**
 * Fora do provider devolve um modo inerte em vez de lançar: o cuidado é um extra, e a falta
 * dele nunca pode derrubar a tela que o consulta.
 */
export function useModoDeCuidado(): ModoDeCuidadoValor {
  return useContext(ModoDeCuidadoContext) ?? INERTE;
}
