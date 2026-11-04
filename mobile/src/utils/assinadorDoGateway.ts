import { supabase } from "@/database/supabase";

import { criarAssinador, type RespostaDeLinks } from "./linkDoGateway";

// Um assinador para o app inteiro: o cache de links vale entre telas.
// `functions.invoke` manda o JWT da sessao no Authorization, que e' o que o gateway confere.
const assinador = criarAssinador(async (caminhos) => {
  const { data, error } = await supabase.functions.invoke<RespostaDeLinks>("storage-redirect", {
    body: { paths: caminhos },
  });
  if (error || !data) throw error ?? new Error("resposta vazia do gateway");
  return data;
});

/** A URL pronta para baixar ou tocar: assinada quando e' do gateway, a mesma em qualquer outro caso. */
export const assinarUrlDoGateway = assinador.assinar;
