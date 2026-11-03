import type { ImageSourcePropType } from 'react-native';

import type { FrameOpening } from '@/utils/profileFrameLayout';

// As 40 molduras além das 7 de perfil (20261103_09). O código é a chave de `public.molduras`;
// nome, preço e como ganhar vêm do banco (`molduras_catalogo`), aqui só o que precisa estar no
// aparelho: a imagem e a abertura onde a foto entra.
//
// A abertura foi medida no canal alfa de cada PNG original do Drive (1254 px, reduzido a 256):
// centro por ajuste de círculo na borda interna e raio no percentil 90 da distância até o
// primeiro pixel opaco. Conferida contra as 7 de perfil, medidas à mão: centro igual, raio a
// até 2 px.
export const molduras: Record<string, { source: ImageSourcePropType; opening: FrameOpening }> = {
  folhagem: { source: require('@/assets/design/molduras/folhagem.webp'), opening: { x: 128, y: 134, radius: 90 } },
  rubi_fino: { source: require('@/assets/design/molduras/rubi_fino.webp'), opening: { x: 127, y: 127, radius: 90 } },
  ramo_de_jade: { source: require('@/assets/design/molduras/ramo_de_jade.webp'), opening: { x: 128, y: 130, radius: 92 } },
  safira: { source: require('@/assets/design/molduras/safira.webp'), opening: { x: 128, y: 133, radius: 84 } },
  ametista: { source: require('@/assets/design/molduras/ametista.webp'), opening: { x: 128, y: 131, radius: 97 } },
  louros: { source: require('@/assets/design/molduras/louros.webp'), opening: { x: 127, y: 134, radius: 90 } },
  agua_marinha: { source: require('@/assets/design/molduras/agua_marinha.webp'), opening: { x: 128, y: 133, radius: 88 } },
  quartzo_rosa: { source: require('@/assets/design/molduras/quartzo_rosa.webp'), opening: { x: 127, y: 128, radius: 89 } },
  petalas: { source: require('@/assets/design/molduras/petalas.webp'), opening: { x: 127, y: 131, radius: 87 } },
  esmeralda: { source: require('@/assets/design/molduras/esmeralda.webp'), opening: { x: 127, y: 128, radius: 83 } },
  cobalto: { source: require('@/assets/design/molduras/cobalto.webp'), opening: { x: 128, y: 125, radius: 82 } },
  cristal_violeta: { source: require('@/assets/design/molduras/cristal_violeta.webp'), opening: { x: 127, y: 123, radius: 83 } },
  brasa: { source: require('@/assets/design/molduras/brasa.webp'), opening: { x: 127, y: 126, radius: 86 } },
  hera_dourada: { source: require('@/assets/design/molduras/hera_dourada.webp'), opening: { x: 128, y: 123, radius: 85 } },
  lapis_lazuli: { source: require('@/assets/design/molduras/lapis_lazuli.webp'), opening: { x: 128, y: 129, radius: 90 } },
  orquidea: { source: require('@/assets/design/molduras/orquidea.webp'), opening: { x: 128, y: 128, radius: 86 } },
  coroa_de_ouro: { source: require('@/assets/design/molduras/coroa_de_ouro.webp'), opening: { x: 128, y: 123, radius: 79 } },
  turquesa_real: { source: require('@/assets/design/molduras/turquesa_real.webp'), opening: { x: 128, y: 128, radius: 86 } },
  prata_polida: { source: require('@/assets/design/molduras/prata_polida.webp'), opening: { x: 127, y: 127, radius: 86 } },
  rubi_real: { source: require('@/assets/design/molduras/rubi_real.webp'), opening: { x: 128, y: 128, radius: 88 } },
  geada: { source: require('@/assets/design/molduras/geada.webp'), opening: { x: 128, y: 131, radius: 89 } },
  labareda: { source: require('@/assets/design/molduras/labareda.webp'), opening: { x: 127, y: 128, radius: 90 } },
  diamante: { source: require('@/assets/design/molduras/diamante.webp'), opening: { x: 128, y: 127, radius: 80 } },
  aurora: { source: require('@/assets/design/molduras/aurora.webp'), opening: { x: 128, y: 126, radius: 86 } },
  meia_noite: { source: require('@/assets/design/molduras/meia_noite.webp'), opening: { x: 128, y: 131, radius: 86 } },
  trepadeira: { source: require('@/assets/design/molduras/trepadeira.webp'), opening: { x: 129, y: 121, radius: 87 } },
  mare: { source: require('@/assets/design/molduras/mare.webp'), opening: { x: 128, y: 133, radius: 89 } },
  sol_dourado: { source: require('@/assets/design/molduras/sol_dourado.webp'), opening: { x: 128, y: 130, radius: 83 } },
  fogo_e_ouro: { source: require('@/assets/design/molduras/fogo_e_ouro.webp'), opening: { x: 127, y: 126, radius: 85 } },
  coral_vivo: { source: require('@/assets/design/molduras/coral_vivo.webp'), opening: { x: 128, y: 129, radius: 89 } },
  lua_violeta: { source: require('@/assets/design/molduras/lua_violeta.webp'), opening: { x: 128, y: 128, radius: 89 } },
  lua_crescente: { source: require('@/assets/design/molduras/lua_crescente.webp'), opening: { x: 128, y: 126, radius: 90 } },
  noite_de_lua: { source: require('@/assets/design/molduras/noite_de_lua.webp'), opening: { x: 128, y: 131, radius: 95 } },
  bussola: { source: require('@/assets/design/molduras/bussola.webp'), opening: { x: 127, y: 123, radius: 84 } },
  rosa: { source: require('@/assets/design/molduras/rosa.webp'), opening: { x: 130, y: 126, radius: 85 } },
  chama_rara: { source: require('@/assets/design/molduras/chama_rara.webp'), opening: { x: 131, y: 123, radius: 92 } },
  ceu_estrelado: { source: require('@/assets/design/molduras/ceu_estrelado.webp'), opening: { x: 131, y: 119, radius: 89 } },
  estrela_guia: { source: require('@/assets/design/molduras/estrela_guia.webp'), opening: { x: 128, y: 134, radius: 85 } },
  constelacao: { source: require('@/assets/design/molduras/constelacao.webp'), opening: { x: 128, y: 125, radius: 84 } },
  nebulosa: { source: require('@/assets/design/molduras/nebulosa.webp'), opening: { x: 127, y: 131, radius: 88 } },
};

export function molduraConhecida(codigo: string | null | undefined): codigo is string {
  return Boolean(codigo && Object.prototype.hasOwnProperty.call(molduras, codigo));
}
