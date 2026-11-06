import { NavigationContext } from '@react-navigation/native';
import { useCallback, useContext, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { criarTempoCorrido } from '@/utils/presencaDeEstudo';

/**
 * Segundos em que esta tela esteve de fato diante do aluno, desde a última troca
 * de `chave`. Tela desligada, app em segundo plano e outra aba não contam.
 *
 * A checagem vem do `NavigationContext`, não de `useIsFocused`: este hook roda em
 * componentes que também aparecem fora de um navegador, onde `useIsFocused` lança.
 */
export function useTempoVisivel(chave: unknown) {
  const tempoRef = useRef(criarTempoCorrido());
  const navegacao = useContext(NavigationContext);

  const tocar = useCallback(() => {
    const visivel = AppState.currentState === 'active' && (navegacao?.isFocused() ?? true);
    if (visivel) tempoRef.current.avancar(Date.now());
    else tempoRef.current.pausar(Date.now());
  }, [navegacao]);

  useEffect(() => {
    tempoRef.current.zerar();
    tocar();
  }, [chave, tocar]);

  useEffect(() => {
    const relogio = setInterval(tocar, 1000);
    const assinatura = AppState.addEventListener('change', tocar);
    return () => {
      clearInterval(relogio);
      assinatura.remove();
    };
  }, [tocar]);

  return useCallback(() => {
    tocar();
    return Math.round(tempoRef.current.decorridoMs() / 1000);
  }, [tocar]);
}
