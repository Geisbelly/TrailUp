import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import StudentBasicsStep, { StudentBasics } from "./StudentBasicsStep";
import StudentModeStep from "./StudentModeStep";
import StudentPresentationStep from "./StudentPresentationStep";
import BrainHexIntroStep from "./BrainHexIntroStep";
import BrainHexQuizStep from "./BrainHexQuizStep";
import BrainHexResultStep from "./BrainHexResultStep";
import { BrainHexAnswers, computeBrainHexResult, isAllAnswered } from "@/features/signup/brainhex";

type StepKey =
  | "basics"
  | "modo_operacao"
  | "modo_apresentacao"
  | "brainhex_intro"
  | "brainhex_quiz"
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
  }) => Promise<void> | void;
  isSaving?: boolean;
}) {
  const steps: StepKey[] = useMemo(
    () => ["basics", "modo_operacao", "modo_apresentacao", "brainhex_intro", "brainhex_quiz", "brainhex_result"],
    []
  );

  const [stepIndex, setStepIndex] = useState(0);

  const [basics, setBasics] = useState<StudentBasics>({ nome: "", apelido: "" });
  const [modoOperacao, setModoOperacao] = useState("");
  const [modoApresentacao, setModoApresentacao] = useState("");
  const [brainhexAnswers, setBrainhexAnswers] = useState<BrainHexAnswers>({});
  const [quizPage, setQuizPage] = useState(0);

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
    const result = computeBrainHexResult(brainhexAnswers);

    await onConfirm({
      nome: basics.nome.trim(),
      apelido: basics.apelido.trim(),
      modoOperacao,
      modoApresentacao,
      brainhexPercent: result.percent,
      brainhexRaw: result.raw,
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
        />
      )}

      {step === "brainhex_result" && <BrainHexResultStep answers={brainhexAnswers} />}

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={back} disabled={stepIndex === 0 || Boolean(isSaving)}>
          Voltar
        </Button>

        {step !== "brainhex_result" ? (
          <Button className="flex-1" onClick={next} disabled={!canNext() || Boolean(isSaving)}>
            Próximo
          </Button>
        ) : (
          <Button className="flex-1" onClick={confirm} disabled={Boolean(isSaving)}>
            {isSaving ? "Confirmando..." : "Confirmar conta de aluno"}
          </Button>
        )}
      </div>
    </Card>
  );
}
