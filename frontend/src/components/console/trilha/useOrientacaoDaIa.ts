import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ORIENTACAO_VAZIA,
  lerOrientacao,
  mesmaOrientacao,
  orientacaoParaOPedido,
  salvarOrientacao,
  type OrientacaoDaIa,
} from "./orientacaoDaTurma";

export type EstadoDaOrientacao = ReturnType<typeof useOrientacaoDaIa>;

/**
 * A orientação da turma como está na tela. O que vai para a IA é o que está
 * escrito agora, mesmo sem salvar; `garantirSalva` grava antes de gerar, para
 * a próxima geração (e o próximo computador) usar a mesma.
 */
export function useOrientacaoDaIa(classeId: number | null) {
  const [salva, setSalva] = useState<OrientacaoDaIa>(ORIENTACAO_VAZIA);
  const [texto, setTexto] = useState<OrientacaoDaIa>(ORIENTACAO_VAZIA);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const textoRef = useRef(texto);
  textoRef.current = texto;
  const salvaRef = useRef(salva);
  salvaRef.current = salva;

  useEffect(() => {
    setSalva(ORIENTACAO_VAZIA);
    setTexto(ORIENTACAO_VAZIA);
    if (!classeId) return;
    let vivo = true;
    setCarregando(true);
    lerOrientacao(classeId)
      .then((o) => {
        if (!vivo) return;
        setSalva(o);
        setTexto(o);
      })
      .catch((erro) => console.warn("[ia] orientação da turma não foi lida", erro))
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [classeId]);

  const salvar = useCallback(
    async ({ silencioso = false }: { silencioso?: boolean } = {}) => {
      if (!classeId) return false;
      const atual = textoRef.current;
      setSalvando(true);
      try {
        await salvarOrientacao(classeId, atual);
        setSalva(atual);
        if (!silencioso) toast.success("Orientação salva para a turma.");
        return true;
      } catch (erro) {
        console.warn("[ia] orientação da turma não foi salva", erro);
        toast.error(
          silencioso
            ? "A orientação foi usada nesta geração, mas não foi salva para a turma."
            : "Não foi possível salvar a orientação.",
        );
        return false;
      } finally {
        setSalvando(false);
      }
    },
    [classeId],
  );

  const alterada = !mesmaOrientacao(texto, salva);

  /** Antes de gerar: grava o que mudou, sem travar a geração se falhar. */
  const garantirSalva = useCallback(async () => {
    if (!mesmaOrientacao(textoRef.current, salvaRef.current)) await salvar({ silencioso: true });
  }, [salvar]);

  /** `{ orientacao }` para o corpo do pedido, ou nada. */
  const paraOPedido = useCallback(() => orientacaoParaOPedido(textoRef.current), []);

  return { texto, setTexto, carregando, salvando, alterada, salvar, garantirSalva, paraOPedido };
}
