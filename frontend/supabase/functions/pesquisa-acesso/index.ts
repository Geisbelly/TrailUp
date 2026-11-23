// Edge Function `pesquisa-acesso`: cria e libera o acesso de quem a equipe aprovou na pesquisa com
// professores (cartilha em /pesquisa/professores).
//
// Quem chama é a planilha de inscrições, por um Google Apps Script
// (`scripts/apps-script-formulario-professores/Planilha.gs`), com o header `x-pesquisa-segredo`.
// O mesmo script manda os e-mails: esta função não envia nada, só devolve o que vai neles.
//
// Ações, na ordem em que a planilha as usa:
//   criar          → conta de professor (e-mail ainda não confirmado), aluno de teste e turma de
//                    demonstração (`pesquisa_preparar_avaliador`, migration 20261123_01);
//   confirmacao    → link de confirmação do e-mail (magic link: abrir confirma o endereço);
//   situacao       → quem já confirmou;
//   acesso         → só para e-mail confirmado: senhas novas, aleatórias, para o professor e o aluno
//                    de teste. Não ficam gravadas em lugar nenhum além do Auth (com hash);
//   acesso_enviado → a planilha conta que o e-mail com o acesso saiu.
//
// Fica fora da API pela regra de fronteira: criar conta não tem modelo de linguagem no meio.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

import { segredoConfere } from "../pesquisa-arquivar/arquivo.ts";
import { emailDoAlunoDeTeste, gerarSenha, lerPedido, linkDeRetorno } from "./regras.ts";

const ORIGEM = "pesquisa-professores";

function json(status: number, corpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

type Avaliador = {
  email: string;
  nome: string;
  professor_id: string | null;
  aluno_teste_id: string | null;
  aluno_teste_email: string | null;
  classe_id: number | null;
  situacao: string;
  confirmado_em: string | null;
};

const COLUNAS = "email, nome, professor_id, aluno_teste_id, aluno_teste_email, classe_id, situacao, confirmado_em";

serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  if (!segredoConfere(req.headers.get("x-pesquisa-segredo"), Deno.env.get("PESQUISA_ACESSO_SEGREDO"))) {
    return json(401, { error: "Segredo ausente ou inválido." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const site = Deno.env.get("PESQUISA_SITE_URL") ?? "";
  const dominioDoAluno = Deno.env.get("PESQUISA_ALUNO_DOMINIO") ?? "trailup.app";
  if (!supabaseUrl || !chaveServico || !site) {
    console.error("[pesquisa-acesso] segredos ausentes no ambiente");
    return json(500, { error: "Acesso da pesquisa não configurado." });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return json(400, { error: "JSON inválido." });
  }
  const pedido = lerPedido(corpo);
  if (!pedido) return json(400, { error: "Pedido fora do contrato." });

  const db = createClient(supabaseUrl, chaveServico, { auth: { persistSession: false, autoRefreshToken: false } });

  const buscar = async (email: string): Promise<Avaliador | null> => {
    const { data, error } = await db.from("pesquisa_avaliador").select(COLUNAS).eq("email", email).maybeSingle();
    if (error) throw new Error(`pesquisa_avaliador: ${error.message}`);
    return (data as Avaliador | null) ?? null;
  };

  const emailConfirmado = async (professorId: string): Promise<string | null> => {
    const { data, error } = await db.auth.admin.getUserById(professorId);
    if (error) throw new Error(`auth: ${error.message}`);
    return data.user?.email_confirmed_at ?? null;
  };

  try {
    switch (pedido.acao) {
      case "criar": {
        const existente = await buscar(pedido.email);
        if (existente) {
          return json(200, { ok: true, ja_existia: true, classe_id: existente.classe_id, situacao: existente.situacao });
        }

        const professor = await db.auth.admin.createUser({
          email: pedido.email,
          email_confirm: false,
          user_metadata: { nome: pedido.nome, instituicao: pedido.instituicao, origem: ORIGEM },
        });
        if (professor.error || !professor.data.user) {
          const jaTem = professor.error?.code === "email_exists" || professor.error?.status === 422;
          return json(jaTem ? 409 : 500, {
            error: jaTem ? "email_ja_tem_conta" : `auth: ${professor.error?.message ?? "sem usuário"}`,
          });
        }

        const alunoEmail = emailDoAlunoDeTeste(dominioDoAluno);
        const aluno = await db.auth.admin.createUser({
          email: alunoEmail,
          email_confirm: true,
          // Provisória e descartada: a senha que vale é a do passo `acesso`.
          password: gerarSenha(20),
          user_metadata: { nome: `Aluno de teste de ${pedido.nome}`, origem: ORIGEM },
        });
        if (aluno.error || !aluno.data.user) {
          await db.auth.admin.deleteUser(professor.data.user.id);
          return json(500, { error: `auth (aluno de teste): ${aluno.error?.message ?? "sem usuário"}` });
        }

        const preparo = await db.rpc("pesquisa_preparar_avaliador", {
          p_email: pedido.email,
          p_nome: pedido.nome,
          p_instituicao: pedido.instituicao,
          p_professor: professor.data.user.id,
          p_aluno: aluno.data.user.id,
          p_aluno_email: alunoEmail,
        });
        if (preparo.error) {
          // Nada pela metade: sem turma, as duas contas saem.
          await db.auth.admin.deleteUser(aluno.data.user.id);
          await db.auth.admin.deleteUser(professor.data.user.id);
          return json(500, { error: `preparar avaliador: ${preparo.error.message}` });
        }
        const r = preparo.data as { classe_id?: number } | null;
        return json(200, { ok: true, ja_existia: false, classe_id: r?.classe_id ?? null, situacao: "conta_criada" });
      }

      case "confirmacao": {
        const avaliador = await buscar(pedido.email);
        if (!avaliador?.professor_id) return json(404, { error: "avaliador_nao_encontrado" });
        if (await emailConfirmado(avaliador.professor_id)) return json(200, { ok: true, ja_confirmado: true });

        const { data, error } = await db.auth.admin.generateLink({
          type: "magiclink",
          email: pedido.email,
          options: { redirectTo: linkDeRetorno(site) },
        });
        const link = data?.properties?.action_link;
        if (error || !link) return json(500, { error: `link: ${error?.message ?? "sem link"}` });

        await db.from("pesquisa_avaliador")
          .update({ confirmacao_enviada_em: new Date().toISOString(), situacao: "confirmacao_enviada", atualizado_em: new Date().toISOString() })
          .eq("email", pedido.email)
          .eq("situacao", "conta_criada");
        return json(200, { ok: true, ja_confirmado: false, link });
      }

      case "situacao": {
        const { data, error } = await db.from("pesquisa_avaliador").select(COLUNAS).in("email", pedido.emails);
        if (error) throw new Error(`pesquisa_avaliador: ${error.message}`);
        const linhas = (data ?? []) as Avaliador[];
        const resultado = [];
        for (const email of pedido.emails) {
          const a = linhas.find(l => l.email === email);
          if (!a?.professor_id) {
            resultado.push({ email, existe: false, confirmado: false, situacao: null });
            continue;
          }
          const confirmadoEm = a.confirmado_em ?? (await emailConfirmado(a.professor_id));
          if (confirmadoEm && !a.confirmado_em) {
            const agora = new Date().toISOString();
            await db.from("pesquisa_avaliador")
              .update({ confirmado_em: confirmadoEm, atualizado_em: agora })
              .eq("email", email);
            await db.from("pesquisa_avaliador")
              .update({ situacao: "confirmado", atualizado_em: agora })
              .eq("email", email)
              .in("situacao", ["conta_criada", "confirmacao_enviada"]);
          }
          resultado.push({ email, existe: true, confirmado: Boolean(confirmadoEm), confirmado_em: confirmadoEm, situacao: a.situacao });
        }
        return json(200, { ok: true, avaliadores: resultado });
      }

      case "acesso": {
        const avaliador = await buscar(pedido.email);
        if (!avaliador?.professor_id || !avaliador.aluno_teste_id || !avaliador.aluno_teste_email) {
          return json(404, { error: "avaliador_nao_encontrado" });
        }
        // A senha só sai depois de o avaliador provar que o e-mail é dele.
        if (!(await emailConfirmado(avaliador.professor_id))) return json(409, { error: "email_nao_confirmado" });

        const senhaProfessor = gerarSenha();
        const senhaAluno = gerarSenha();
        const p = await db.auth.admin.updateUserById(avaliador.professor_id, { password: senhaProfessor });
        if (p.error) return json(500, { error: `senha do professor: ${p.error.message}` });
        const a = await db.auth.admin.updateUserById(avaliador.aluno_teste_id, { password: senhaAluno });
        if (a.error) return json(500, { error: `senha do aluno de teste: ${a.error.message}` });

        let turma: string | null = null;
        if (avaliador.classe_id) {
          const { data } = await db.from("classe").select("descricao").eq("id", avaliador.classe_id).maybeSingle();
          turma = (data as { descricao?: string | null } | null)?.descricao ?? null;
        }
        return json(200, {
          ok: true,
          senha_professor: senhaProfessor,
          aluno_email: avaliador.aluno_teste_email,
          senha_aluno: senhaAluno,
          turma,
        });
      }

      case "acesso_enviado": {
        const agora = new Date().toISOString();
        const { error } = await db.from("pesquisa_avaliador")
          .update({ acesso_enviado_em: agora, situacao: "acesso_enviado", atualizado_em: agora })
          .eq("email", pedido.email);
        if (error) throw new Error(`pesquisa_avaliador: ${error.message}`);
        return json(200, { ok: true });
      }
    }
  } catch (erro) {
    console.error("[pesquisa-acesso]", pedido.acao, erro instanceof Error ? erro.message : erro);
    return json(500, { error: erro instanceof Error ? erro.message : "erro" });
  }
});
