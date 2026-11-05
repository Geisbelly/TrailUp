import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

// Todo POST deste servico passa por aqui (`app.post('*', ...)` em server.ts):
// as rotas de geracao gastam a cota das chaves Gemini do tier free, e as de
// Supabase caem nas credenciais do ambiente quando o corpo nao traz as suas.
// Quem chama em producao e' so o microservice, com BRAINHEXPDF_API_SECRET.
//
// Sem segredo configurado, producao RECUSA. So' a maquina de desenvolvimento
// passa direto, para a tela de demonstracao continuar funcionando no local:
// ela chama as rotas pelo navegador, sem cabecalho nenhum.

function iguais(a: string, b: string): boolean {
  // O digest iguala os tamanhos, que timingSafeEqual exige.
  const digest = (valor: string) => createHash("sha256").update(valor).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function criarExigirSegredo(env: Record<string, string | undefined>) {
  const segredo = (env.API_SHARED_SECRET ?? "").trim();
  const emProducao = env.NODE_ENV === "production";

  return function exigirSegredo(req: Request, res: Response, next: NextFunction) {
    if (!segredo) {
      if (!emProducao) return next();
      return res.status(503).json({ success: false, error: "API_SHARED_SECRET não configurado neste serviço." });
    }
    const enviado =
      req.header("x-api-secret") ?? req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!iguais(enviado, segredo)) {
      return res.status(401).json({ success: false, error: "auth obrigatória — header x-api-secret ausente ou inválido" });
    }
    return next();
  };
}

// GET /api/v1/decks fica sem cabecalho de proposito: o WebView do app e o
// preview do console abrem a URL gravada em `materiais`, e nenhum dos dois tem
// como mandar segredo. Mas ela le com a chave de servico, que alcanca bucket
// privado, entao so' entrega o que /render-and-store grava como deck:
// `conteudo_aluno/brainhex/<perfil>/classe-N/.../*.html`.
const BUCKET_DE_DECK = "conteudo_aluno";
const PREFIXO_DE_DECK = "brainhex/";
const EXTENSAO_DE_DECK = ".html";

export function deckPodeSerServido(bucket: string, caminho: string): boolean {
  return (
    bucket === BUCKET_DE_DECK &&
    caminho.startsWith(PREFIXO_DE_DECK) &&
    caminho.endsWith(EXTENSAO_DE_DECK) &&
    !caminho.includes("..") &&
    !caminho.includes("\\")
  );
}
