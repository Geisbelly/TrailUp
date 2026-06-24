import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { parseOptionalPositiveScore } from "@/lib/question-score";

import {
  buildActivityContentContext,
  saveEssayAttempt,
  type EssayValidationResult,
  validateEssayAnswerWithAi,
} from "./essayValidationApi";

interface EssayQuestionRendererProps {
  questaoId: number;
  atividadeId: number;
  enunciado: string;
  respostaProfessor?: string | null;
  notaEstabelecida?: number | null;
  conteudoReferencia?: string | null;
  materiaNome?: string | null;
  materiaDescricao?: string | null;
  classeNome?: string | null;
  topicoNome?: string | null;
  topicoDescricao?: string | null;
  initialRespostaAluno?: string;
  saveAttempt?: boolean;
  onValidated?: (result: EssayValidationResult) => void;
}

export default function EssayQuestionRenderer({
  questaoId,
  atividadeId,
  enunciado,
  respostaProfessor,
  notaEstabelecida,
  conteudoReferencia,
  materiaNome,
  materiaDescricao,
  classeNome,
  topicoNome,
  topicoDescricao,
  initialRespostaAluno = "",
  saveAttempt,
  onValidated,
}: EssayQuestionRendererProps) {
  const { user, userRole } = useAuth();
  const [respostaAluno, setRespostaAluno] = useState(initialRespostaAluno);
  const [resultado, setResultado] = useState<EssayValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [conteudoContextual, setConteudoContextual] = useState((conteudoReferencia || "").trim());

  const notaParsed = useMemo(() => parseOptionalPositiveScore(notaEstabelecida), [notaEstabelecida]);
  const notaMaxima = notaParsed.value ?? 100;
  const usaEscalaPadrao = notaParsed.value === null;
  const shouldPersistAttempt = saveAttempt ?? userRole === "aluno";

  useEffect(() => {
    let active = true;
    const provided = (conteudoReferencia || "").trim();
    if (provided) {
      setConteudoContextual(provided);
      return () => {
        active = false;
      };
    }
    if (!atividadeId || atividadeId <= 0) {
      setConteudoContextual("");
      return () => {
        active = false;
      };
    }

    setIsLoadingContext(true);
    buildActivityContentContext(atividadeId)
      .then((context) => {
        if (active) setConteudoContextual(context);
      })
      .catch((error) => {
        console.error("Erro ao carregar contexto da atividade:", error);
      })
      .finally(() => {
        if (active) setIsLoadingContext(false);
      });

    return () => {
      active = false;
    };
  }, [atividadeId, conteudoReferencia]);

  const handleValidate = async () => {
    const resposta = respostaAluno.trim();
    if (!resposta) {
      toast.error("Informe a resposta do aluno antes de validar.");
      return;
    }

    setIsValidating(true);
    try {
      const validation = await validateEssayAnswerWithAi({
        enunciado,
        respostaAluno: resposta,
        respostaProfessor: respostaProfessor ?? "",
        conteudoBase: conteudoContextual,
        notaEstabelecida: notaParsed.value,
        materiaNome,
        materiaDescricao,
        classeNome,
        topicoNome,
        topicoDescricao,
      });

      setResultado(validation);
      onValidated?.(validation);

      if (shouldPersistAttempt && user?.id) {
        await saveEssayAttempt({
          alunoId: user.id,
          atividadeId,
          questaoId,
          respostaAluno: resposta,
          result: validation,
        });
      }

      toast.success(`Resposta validada: nota ${validation.nota_obtida.toFixed(2)} de ${validation.nota_maxima.toFixed(2)}.`);
    } catch (error) {
      console.error("Erro ao validar resposta dissertativa:", error);
      toast.error("Nao foi possivel validar a resposta dissertativa.");
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <Card className="border-slate-700 bg-slate-950/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-100 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          Questao Dissertativa
        </CardTitle>
        <CardDescription className="text-slate-400">
          Nota maxima:{" "}
          <span className="font-medium text-slate-200">{notaMaxima.toFixed(2)}</span>
          {usaEscalaPadrao ? " (escala percentual padrao)" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-200 whitespace-pre-wrap">
          {enunciado}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-200">Resposta do aluno</label>
          <Textarea
            value={respostaAluno}
            onChange={(event) => setRespostaAluno(event.target.value)}
            rows={6}
            placeholder="Digite ou cole a resposta dissertativa do aluno..."
            className="bg-slate-900/40 border-slate-700 text-slate-100"
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            {isLoadingContext
              ? "Carregando conteudo de referencia..."
              : conteudoContextual
              ? "Conteudo de referencia pronto para avaliacao."
              : "Sem conteudo de referencia vinculado."}
          </span>
          {shouldPersistAttempt && user?.id && <span>Tentativa sera salva automaticamente.</span>}
        </div>

        <Button
          onClick={handleValidate}
          disabled={isValidating || isLoadingContext || !respostaAluno.trim()}
          className="w-full"
        >
          {isValidating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Validando...
            </>
          ) : (
            "Validar com IA"
          )}
        </Button>

        {resultado && (
          <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Badge variant={resultado.correta ? "default" : "destructive"}>
                {resultado.correta ? "Criterio atingido" : "Requer reforco"}
              </Badge>
              <div className="text-sm text-slate-200 font-medium">
                {resultado.nota_obtida.toFixed(2)} / {resultado.nota_maxima.toFixed(2)}
              </div>
            </div>
            <Progress value={resultado.percentual} />
            <p className="text-sm text-slate-200 whitespace-pre-wrap">{resultado.feedback}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <h5 className="text-xs uppercase tracking-wide text-emerald-400 mb-1">Pontos fortes</h5>
                <ul className="text-sm text-slate-200 space-y-1 list-disc pl-4">
                  {resultado.pontos_fortes.map((item, index) => (
                    <li key={`forte-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h5 className="text-xs uppercase tracking-wide text-amber-400 mb-1">Pontos de melhoria</h5>
                <ul className="text-sm text-slate-200 space-y-1 list-disc pl-4">
                  {resultado.pontos_melhoria.map((item, index) => (
                    <li key={`melhoria-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
