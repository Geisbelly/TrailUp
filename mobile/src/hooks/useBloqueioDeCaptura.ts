import { useEffect, useId, useRef } from 'react';

type ModuloDeCaptura = typeof import('expo-screen-capture');

let modulo: ModuloDeCaptura | null | undefined;

/**
 * Carregado sob demanda e sem quebrar: o `expo-screen-capture` é nativo, então não existe no
 * Expo Go nem num dev client compilado antes desta dependência — ali o `import` estático
 * derrubaria a tela da atividade inteira. Sem o módulo, a atividade abre sem bloqueio.
 */
function moduloDeCaptura(): ModuloDeCaptura | null {
  if (modulo === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      modulo = require('expo-screen-capture') as ModuloDeCaptura;
    } catch {
      modulo = null;
    }
  }
  return modulo;
}

/**
 * Bloqueia print e gravação de tela enquanto `ativo` for verdadeiro, e libera ao desligar ou
 * desmontar (#139). Android: `FLAG_SECURE` (o print sai preto). iOS 13+: o print sai sem o
 * conteúdo, e a gravação também.
 *
 * `aoCapturar` é chamado quando o sistema avisa que houve tentativa de print: no iOS sempre;
 * no Android só do 14 em diante (`DETECT_SCREEN_CAPTURE`). No Android 13 o aviso exigiria
 * `READ_MEDIA_IMAGES`, que o `app.json` bloqueia de propósito — o print já sai preto, e a
 * permissão de fotos só para isso é motivo de recusa na Play Store.
 *
 * A chave é por instância: com duas atividades montadas ao mesmo tempo, a que sai não pode
 * liberar a captura da que continua aberta.
 */
export function useBloqueioDeCaptura(ativo: boolean, aoCapturar?: () => void) {
  const chave = `trailup-avaliacao-${useId()}`;
  const aoCapturarRef = useRef(aoCapturar);
  aoCapturarRef.current = aoCapturar;

  useEffect(() => {
    if (!ativo) return;
    const captura = moduloDeCaptura();
    if (!captura) return;

    captura.preventScreenCaptureAsync(chave).catch(() => undefined);
    let assinatura: { remove: () => void } | null = null;
    try {
      assinatura = captura.addScreenshotListener(() => aoCapturarRef.current?.());
    } catch {
      assinatura = null;
    }

    return () => {
      assinatura?.remove();
      captura.allowScreenCaptureAsync(chave).catch(() => undefined);
    };
  }, [ativo, chave]);
}
