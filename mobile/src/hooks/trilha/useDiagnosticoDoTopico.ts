import { useCallback, useEffect, useRef, useState } from "react";

import {
  dispensarDiagnostico,
  lerDiagnostico,
  pedirDiagnostico,
  responderDiagnostico,
} from "@/services/diagnostico/diagnosticoService";
import {
  continuaConsultando,
  faseDoDiagnostico,
  intervaloDaConsulta,
  lerPerguntas,
  MAX_CONSULTAS,
  respostasParaEnviar,
  type FaseDoDiagnostico,
  type LinhaDoDiagnostico,
  type NivelDoDiagnostico,
  type PerguntaDoDiagnostico,
} from "@/services/diagnostico/diagnosticoModel";

/**
 * Diagnóstico curto antes do tópico (#137). Só pede quando o tópico ainda não foi começado (`ativo`); o
 * banco confere de novo (`ja_iniciado`) e devolve `retido` para turma do estudo. Enquanto a IA escreve,
 * consulta a própria linha (4 s, 8 s...) e desiste em silêncio depois de `MAX_CONSULTAS`: o aluno só deixa
 * de ver o convite, e o pedido continua na fila para a próxima abertura.
 *
 * Nunca bloqueia: qualquer falha deixa a tela como estava (sem cartão), como `useAlteracoesDoProfessor`.
 */
export function useDiagnosticoDoTopico(params: { topicoId: number | null | undefined; ativo: boolean }) {
  const topicoId = typeof params.topicoId === "number" && Number.isFinite(params.topicoId) ? params.topicoId : null;
  const ativo = params.ativo && topicoId != null;
  const [fase, setFase] = useState<FaseDoDiagnostico>("nada");
  const [perguntas, setPerguntas] = useState<PerguntaDoDiagnostico[]>([]);
  const [nivel, setNivel] = useState<NivelDoDiagnostico | null>(null);
  const [enviando, setEnviando] = useState(false);
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    setFase("nada");
    setPerguntas([]);
    setNivel(null);
    idRef.current = null;
    if (!ativo || topicoId == null) return;

    let cancelado = false;
    let temporizador: ReturnType<typeof setTimeout> | null = null;

    const aplicar = (linha: LinhaDoDiagnostico | null, pedido: Awaited<ReturnType<typeof pedirDiagnostico>> | null) => {
      if (cancelado) return;
      setPerguntas(lerPerguntas(linha?.perguntas));
      const fase = faseDoDiagnostico(pedido, linha);
      // Já respondido em outra abertura: o resultado foi mostrado na hora, e voltar a ele seria ruído.
      // Só `responder` (esta sessão) leva à fase "respondido".
      setFase(fase === "respondido" ? "nada" : fase);
    };

    const consultar = async (id: string, tentativa: number) => {
      try {
        const linha = await lerDiagnostico(id);
        if (cancelado) return;
        aplicar(linha, null);
        if (continuaConsultando(linha?.status) && tentativa < MAX_CONSULTAS) {
          temporizador = setTimeout(() => void consultar(id, tentativa + 1), intervaloDaConsulta(tentativa));
        } else if (continuaConsultando(linha?.status)) {
          setFase("nada");
        }
      } catch (erro) {
        console.warn("[diagnostico] Falha ao ler o diagnostico:", erro);
        if (!cancelado) setFase("nada");
      }
    };

    void (async () => {
      try {
        const pedido = await pedirDiagnostico(topicoId);
        if (cancelado) return;
        if (!pedido.id) {
          aplicar(null, pedido);
          return;
        }
        idRef.current = pedido.id;
        await consultar(pedido.id, 1);
      } catch (erro) {
        console.warn("[diagnostico] Falha ao pedir o diagnostico:", erro);
        if (!cancelado) setFase("nada");
      }
    })();

    return () => {
      cancelado = true;
      if (temporizador) clearTimeout(temporizador);
    };
  }, [ativo, topicoId]);

  /** Corrige pelo banco. Falha de rede deixa o cartão como está, para o aluno tentar de novo ou pular. */
  const responder = useCallback(async (escolhas: readonly (number | null | undefined)[]) => {
    const id = idRef.current;
    if (!id || enviando) return false;
    setEnviando(true);
    try {
      const resultado = await responderDiagnostico(id, respostasParaEnviar(escolhas, perguntas.length));
      setNivel(resultado.nivel);
      setFase("respondido");
      return true;
    } catch (erro) {
      console.warn("[diagnostico] Falha ao responder o diagnostico:", erro);
      return false;
    } finally {
      setEnviando(false);
    }
  }, [enviando, perguntas.length]);

  /** Pular some com o cartão na hora; o banco confirma em segundo plano. */
  const dispensar = useCallback(() => {
    const id = idRef.current;
    setFase("nada");
    if (!id) return;
    dispensarDiagnostico(id).catch((erro) => {
      console.warn("[diagnostico] Falha ao dispensar o diagnostico:", erro);
    });
  }, []);

  return { fase, perguntas, nivel, enviando, responder, dispensar };
}
