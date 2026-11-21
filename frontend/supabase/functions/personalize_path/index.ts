// Grafo da trilha por aluno: hoje é um stub que devolve listas vazias.
//
// O app ainda chama esta função ao abrir a trilha (`TrilhaContext`, `Classe.ts`) e, com a resposta
// vazia, monta o grafo dos tópicos no aparelho e lê o tema de `classe_mapa_tema` direto do banco.
// Ela existia só publicada, sem fonte neste repositório: ao montar o projeto Supabase novo
// (`liatqwotsiphjmnjenwu`, 21/11) ela ficou de fora, e cada abertura de trilha passou a registrar
// falha. Este é o código que estava no ar em `xrebtkmdewolzmpsdwgh` (versão 22), sem mudança de
// comportamento. Publicada com `--no-verify-jwt`, como lá.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function respostaJson(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // O corpo (`userId`, `classeId`, `perfil`, `visual`) é lido só para validar o JSON.
    await req.json();
    return respostaJson({ nodes: [], edges: [] }, 200);
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    return respostaJson({ error: mensagem }, 400);
  }
});
