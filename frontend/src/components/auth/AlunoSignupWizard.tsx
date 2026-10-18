import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import StudentBasicsStep, { StudentBasics } from "./StudentBasicsStep";
import StudentModeStep from "./StudentModeStep";
import StudentPresentationStep from "./StudentPresentationStep";
import BrainHexIntroStep from "./BrainHexIntroStep";
import BrainHexOrdenacaoStep from "./BrainHexOrdenacaoStep";
import BrainHexQuizStep from "./BrainHexQuizStep";
import BrainHexResultStep from "./BrainHexResultStep";
import { ordemInicial } from "@/features/signup/brainhexOrdenacao";
import type { QualidadeDaResposta } from "@/features/signup/brainhexScoring";
import { computarPerfil } from "@/features/signup/priorDoPerfil";
import {
  BrainHexAnswers,
  BrainHexProfileKey,
  isAllAnswered,
  resolveRepresentativeBrainHexResults,
} from "@/features/signup/brainhex";

type StepKey =
  | "basics"
  | "modo_operacao"
  | "modo_apresentacao"
  | "brainhex_intro"
  | "brainhex_quiz"
  | "brainhex_ordenacao"
  | "brainhex_result";

export function AlunoSignupWizard({
  onConfirm,
  isSaving,
}: {
  onConfirm: (payload: {
    nome: string;
    apelido: string;
    modoOperacao: string;
    modoApresentacao: string;
    brainhexPercent: Record<string, number>;
    brainhexRaw: Record<string, number>;
    perfilInicial: BrainHexProfileKey;
    /** Ordem declarada no bloco ipsativo — o prior que a fase 3 vai comparar
     *  com o comportamento. Sem guardar, nao ha' com o que comparar. */
    ordenacao: BrainHexProfileKey[];
    confiancaDoPerfil: number;
    concordanciaDoPerfil: number;
    qualidadeDaResposta: QualidadeDaResposta;
  }) => Promise<void> | void;
  isSaving?: boolean;
}) {
  const steps: StepKey[] = useMemo(
    () => [
      "basics",
      "modo_operacao",
      "modo_apresentacao",
      "brainhex_intro",
      "brainhex_quiz",
      "brainhex_ordenacao",
      "brainhex_result",
    ],
    []
  );

  const [stepIndex, setStepIndex] = useState(0);

  const [basics, setBasics] = useState<StudentBasics>({ nome: "", apelido: "" });
  const [modoOperacao, setModoOperacao] = useState("");
  const [modoApresentacao, setModoApresentacao] = useState("");
  const [brainhexAnswers, setBrainhexAnswers] = useState<BrainHexAnswers>({});
  const [perfilInicial, setPerfilInicial] = useState<BrainHexProfileKey | null>(null);
  const [quizPage, setQuizPage] = useState(0);

  // Ordem embaralhada uma vez por sessao de cadastro. Comecar sempre na mesma
  // ordem criaria ancoragem: quem nao mexe entregaria a ordem do sistema, nao a
  // dele. A semente fica no estado inicial para a ordem nao mudar a cada
  // re-render.
  const [ordenacao, setOrdenacao] = useState<BrainHexProfileKey[]>(() =>
    ordemInicial(Date.now()),
  );

  // UMA conta para a tela e para o banco. Recalcular em dois lugares foi
  // exatamente como o percentual mostrado e o percentual salvo divergiram.
  const perfilComputado = useMemo(
    () => computarPerfil({ answers: brainhexAnswers, ordenacao }),
    [brainhexAnswers, ordenacao],
  );

  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);
  const step = steps[stepIndex];

  const canNext = () => {
    if (step === "basics") return basics.nome.trim().length >= 2 && basics.apelido.trim().length >= 2;
    if (step === "modo_operacao") return Boolean(modoOperacao);
    if (step === "modo_apresentacao") return Boolean(modoApresentacao);
    if (step === "brainhex_quiz") return isAllAnswered(brainhexAnswers);
    return true;
  };

  const next = () => {
    if (!canNext()) {
      toast.error("Preencha os campos obrigatórios para continuar.");
      return;
    }
    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
  };

  const back = () => {
    setStepIndex((i) => Math.max(0, i - 1));
  };

  const confirm = async () => {
    if (!isAllAnswered(brainhexAnswers)) {
      toast.error("Conclua o questionário BrainHex antes de confirmar.");
      return;
    }
    // UMA conta so': o que a tela mostra e o que o banco guarda saem daqui.
    // Antes, `aluno_perfil` recebia o percentual do `computeBrainHexResult`
    // antigo -- sem normalizacao de peso, sem centragem e sem a ordenacao --
    // enquanto o pipeline corrigido alimentava so' a tabela de medida. O
    // formulario calculava a correcao e nao a usava.
    const prior = perfilComputado;
    const perfisRepresentativos = resolveRepresentativeBrainHexResults(prior.ordenado);
    const perfilEscolhido =
      perfisRepresentativos.find((profile) => profile.key === perfilInicial)?.key ??
      perfisRepresentativos[0]?.key;
    if (!perfilEscolhido) {
      toast.error("Não foi possível definir seu perfil inicial.");
      return;
    }

    await onConfirm({
      nome: basics.nome.trim(),
      apelido: basics.apelido.trim(),
      modoOperacao,
      modoApresentacao,
      brainhexPercent: prior.percentual,
      ordenacao,
      confiancaDoPerfil: prior.confianca,
      concordanciaDoPerfil: prior.concordancia,
      qualidadeDaResposta: prior.qualidade,
      brainhexRaw: prior.afinidade,
      perfilInicial: perfilEscolhido,
    });
  };

  return (
    <Card className="p-6 border-primary/20 bg-card/60 backdrop-blur space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Cadastro do aluno</span>
          <span className="text-muted-foreground">{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {step === "basics" && <StudentBasicsStep value={basics} onChange={setBasics} />}

      {step === "modo_operacao" && <StudentModeStep value={modoOperacao} onChange={setModoOperacao} />}

      {step === "modo_apresentacao" && (
        <StudentPresentationStep value={modoApresentacao} onChange={setModoApresentacao} />
      )}

      {step === "brainhex_intro" && <BrainHexIntroStep />}

      {step === "brainhex_quiz" && (
        <BrainHexQuizStep
          answers={brainhexAnswers}
          onChange={setBrainhexAnswers}
          page={quizPage}
          setPage={setQuizPage}
          perPage={5}
          onBack={back}
          onFinish={next}
        />
      )}

      {step === "brainhex_ordenacao" && (
        <BrainHexOrdenacaoStep
          ordem={ordenacao}
          onChange={setOrdenacao}
          onBack={back}
          onFinish={next}
        />
      )}

      {step === "brainhex_result" && (
        <BrainHexResultStep
          resultado={perfilComputado}
          selectedProfile={perfilInicial}
          onSelectProfile={setPerfilInicial}
        />
      )}

      {/* O quiz tem sua própria navegação (Anterior / Próximo página / Finalizar Análise);
          o rodapé abaixo ficaria duplicado e com "Próximo" fazendo algo diferente do botão
          interno, então só aparece nas demais etapas. */}
      {step !== "brainhex_quiz" && step !== "brainhex_ordenacao" && (
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={back} disabled={stepIndex === 0 || Boolean(isSaving)}>
            Voltar
          </Button>

          {step !== "brainhex_result" ? (
            <Button className="flex-1" onClick={next} disabled={!canNext() || Boolean(isSaving)}>
              Próximo
            </Button>
          ) : (
            <Button
              className="flex-1"
              onClick={confirm}
              disabled={Boolean(isSaving) || !perfilInicial}
            >
              {isSaving ? "Confirmando..." : "Confirmar conta de aluno"}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
