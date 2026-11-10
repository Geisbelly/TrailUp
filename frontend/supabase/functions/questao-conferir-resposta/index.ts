// Conferência da numérica e da expressão, sem IA (spec B, PR 2; banco em `20261110_02`).
//
// O app manda `questaoId`, `resposta` e `tempoGastoSeg`. A esperada e os critérios são lidos aqui
// pela chave de serviço (`questao_conferencia_contexto`, que confere matrícula e prazo), a
// conferência é do mathjs, e a correção é gravada por `questao_registrar_correcao_servidor`, com
// a pontuação do banco. A esperada só volta ao aluno quando o banco a libera.
//
// Sem modelo de linguagem, então sem a trava de idade da IA.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";
import { all, create } from "npm:mathjs@15.2.0";
import { conferir, EsperadaInvalida, lerContextoDaConferencia, type MathJs } from "./conferir.ts";
import { lerQuestaoId, lerResposta, lerTempo, respostaAoAluno, respostaDoErroDaRpc } from "./servidor.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const math = create(all) as unknown as MathJs;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// verify_jwt só recusa token ausente ou inválido, e a anon key pública também passa. Aqui o token
// tem de ser de um usuário logado.
async function usuarioLogado(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!authHeader || !supabaseUrl || !supabaseAnonKey) return null;
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await authClient.auth.getUser();
  return !error && data?.user?.id ? data.user.id : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const aluno = await usuarioLogado(req);
  if (!aluno) return jsonResponse({ error: "unauthorized" }, 401);

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const questaoId = lerQuestaoId(body.questaoId);
    if (!questaoId) return jsonResponse({ error: "missing_questao_id" }, 400);
    const resposta = lerResposta(body.resposta);
    if (resposta === null) return jsonResponse({ error: "missing_resposta" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !chaveServico) return jsonResponse({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, 500);
    const servico = createClient(supabaseUrl, chaveServico, { auth: { persistSession: false } });

    const { data, error } = await servico.rpc("questao_conferencia_contexto", {
      p_aluno: aluno,
      p_questao_id: questaoId,
    });
    if (error) {
      const falha = respostaDoErroDaRpc(error.message);
      return jsonResponse({ error: falha.error }, falha.status);
    }

    let conferencia;
    try {
      conferencia = conferir(math, lerContextoDaConferencia(data), resposta, questaoId);
    } catch (erro) {
      if (erro instanceof EsperadaInvalida) {
        // Erro do professor: nada é gravado, e o aluno não perde a tentativa. Sem a esperada no log.
        console.warn(`questao-conferir-resposta: gabarito inválido na questão ${questaoId}`);
        return jsonResponse({ error: "gabarito_invalido" }, 422);
      }
      throw erro;
    }

    const { data: registro, error: erroDoRegistro } = await servico.rpc("questao_registrar_correcao_servidor", {
      p_aluno: aluno,
      p_questao_id: questaoId,
      p_resposta: resposta,
      p_correta: conferencia.correta,
      p_tempo_gasto_seg: lerTempo(body.tempoGastoSeg),
    });
    if (erroDoRegistro) {
      const falha = respostaDoErroDaRpc(erroDoRegistro.message);
      return jsonResponse({ error: falha.error }, falha.status);
    }
    return jsonResponse(respostaAoAluno(conferencia, registro));
  } catch (erro) {
    // Sem a mensagem crua: ela pode carregar o texto da questão.
    console.error("questao-conferir-resposta:", erro instanceof Error ? erro.name : "erro");
    return jsonResponse({ error: "erro_inesperado" }, 500);
  }
});
