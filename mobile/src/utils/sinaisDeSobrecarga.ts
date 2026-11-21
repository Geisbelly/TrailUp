/**
 * Sinais de uso que sugerem sobrecarga (modo de cuidado, spec 2026-11-20, seção 3).
 *
 * Puro: sem React, sem relógio e sem número fixo. Os limites vêm de `app_config`
 * (`cuidado_erros_seguidos`, `cuidado_minutos_sem_parar`, `cuidado_abandonos`) por quem chama, e o
 * tempo entra por `registrarMinutosNaTrilha`, alimentado com o tempo visível na trilha.
 *
 * O que sai daqui são fatos de uso (números), nunca uma leitura de emoção: quem mostra o aviso fala
 * do uso ("Você está há um tempo nisso."), não de ansiedade.
 */
import type { IATriggerSignal } from "../interfaces/personalizacao/IAContracts";

export type LimitesDeSobrecarga = {
  errosSeguidos: number;
  minutosSemParar: number;
  abandonos: number;
};

export type FatosDeSobrecarga = {
  erros_seguidos?: number;
  minutos_sem_parar?: number;
  abandonos?: number;
};

export type DetectorDeSobrecarga = {
  /** Um sinal do barramento da IA. Devolve os fatos quando um limite é atingido pela primeira vez. */
  registrarSinal(sinal: IATriggerSignal): FatosDeSobrecarga | null;
  /** Minutos de trilha ativa sem pausa, como quem chama os mede. */
  registrarMinutosNaTrilha(minutosSemParar: number): FatosDeSobrecarga | null;
  /** O aluno fez uma pausa: recomeça as contagens, mas não rearma o disparo. */
  pausou(): void;
  /** Recomeça tudo e rearma (fim do modo de cuidado, troca de aluno). */
  zerar(): void;
};

// O banco aceita cada fato entre 0 e 1000 (`fn_cuidado_registrar`).
const TETO_DO_FATO = 1000;

function limitar(valor: number): number {
  if (!Number.isFinite(valor) || valor < 0) return 0;
  return Math.min(Math.floor(valor), TETO_DO_FATO);
}

export function criarDetectorDeSobrecarga(limites: LimitesDeSobrecarga): DetectorDeSobrecarga {
  let topicoDosErros: number | null = null;
  let errosSeguidos = 0;
  let abandonos = 0;
  let atividadeAberta: number | null = null;
  let minutosVistos = 0;
  let minutosNaPausa = 0;
  let disparou = false;

  const minutosDesdeAPausa = () => Math.max(0, minutosVistos - minutosNaPausa);

  const fatos = (): FatosDeSobrecarga => {
    const saida: FatosDeSobrecarga = {};
    if (errosSeguidos > 0) saida.erros_seguidos = limitar(errosSeguidos);
    const minutos = limitar(minutosDesdeAPausa());
    if (minutos > 0) saida.minutos_sem_parar = minutos;
    if (abandonos > 0) saida.abandonos = limitar(abandonos);
    return saida;
  };

  const atingiu = () =>
    errosSeguidos >= limites.errosSeguidos ||
    minutosDesdeAPausa() >= limites.minutosSemParar ||
    abandonos >= limites.abandonos;

  const conferir = (): FatosDeSobrecarga | null => {
    if (disparou || !atingiu()) return null;
    disparou = true;
    return fatos();
  };

  const abandonarAtividadeAberta = () => {
    if (atividadeAberta !== null) abandonos += 1;
    atividadeAberta = null;
  };

  return {
    registrarSinal(sinal) {
      switch (sinal.type) {
        case "activity_wrong": {
          const topico = sinal.topicoId ?? null;
          if (topico !== topicoDosErros) {
            topicoDosErros = topico;
            errosSeguidos = 0;
          }
          errosSeguidos += 1;
          break;
        }
        case "activity_correct":
          errosSeguidos = 0;
          break;
        case "activity_start":
          // Começar outra atividade sem concluir a anterior conta como abandono da anterior.
          // Reabrir a mesma não conta.
          if (atividadeAberta !== null && atividadeAberta !== (sinal.activityId ?? null)) {
            abandonarAtividadeAberta();
          }
          atividadeAberta = sinal.activityId ?? null;
          break;
        case "content_open":
          abandonarAtividadeAberta();
          break;
        case "activity_complete":
          atividadeAberta = null;
          break;
        default:
          // `wrong_streak` e os demais ficam de fora: a sequência é contada aqui, uma vez só.
          return null;
      }
      return conferir();
    },

    registrarMinutosNaTrilha(minutosSemParar) {
      const minutos = Number.isFinite(minutosSemParar) ? Math.max(0, minutosSemParar) : 0;
      // Quem chama recomeçou a própria contagem: a pausa anterior não vale mais.
      if (minutos < minutosVistos) minutosNaPausa = 0;
      minutosVistos = minutos;
      return conferir();
    },

    pausou() {
      errosSeguidos = 0;
      abandonos = 0;
      atividadeAberta = null;
      minutosNaPausa = minutosVistos;
    },

    zerar() {
      topicoDosErros = null;
      errosSeguidos = 0;
      abandonos = 0;
      atividadeAberta = null;
      minutosVistos = 0;
      minutosNaPausa = 0;
      disparou = false;
    },
  };
}
