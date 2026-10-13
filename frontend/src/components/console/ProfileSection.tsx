import { useEffect, useState } from "react";
import { AlertTriangle, Check, Lock, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { ProfessorUpdateData } from "@/pages/Console";
import AlterarSenhaCard from "./AlterarSenhaCard";
import { DESCRICAO_MAX, desdeQuando, iniciais, plural } from "./meusdados/conta";
import { ExcluirContaDialog } from "./meusdados/ExcluirContaDialog";
import { useContaEmNumeros } from "./meusdados/useContaEmNumeros";

interface ProfileSectionProps {
  professorData: {
    id: string;
    nome: string;
    email: string | null;
    instituicao: string | null;
    disciplina: string | null;
    descricao: string | null;
    geracaoAutomatica: boolean;
    criadoEm?: string | null;
  } | null;
  /** Resolve true quando gravou — só então o aviso "Alterações salvas" aparece. */
  onUpdate: (data: ProfessorUpdateData) => Promise<boolean>;
  isLoading?: boolean;
}

const rotulo = "text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const campo = "mt-2 rounded-[14px] bg-muted";

const doProfessor = (p: ProfileSectionProps["professorData"]) => ({
  nome: p?.nome || "",
  instituicao: p?.instituicao || "",
  disciplina: p?.disciplina || "",
  descricao: p?.descricao || "",
  geracaoAutomatica: p?.geracaoAutomatica ?? true,
});

export default function ProfileSection({ professorData, onUpdate, isLoading }: ProfileSectionProps) {
  const [formData, setFormData] = useState(doProfessor(professorData));
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const numeros = useContaEmNumeros(professorData?.id);

  useEffect(() => {
    setFormData(doProfessor(professorData));
  }, [professorData]);

  const alterar = (parcial: Partial<typeof formData>) => {
    setSalvo(false);
    setFormData((f) => ({ ...f, ...parcial }));
  };

  const handleSave = async () => {
    if (!formData.nome.trim() || !formData.instituicao.trim()) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }
    setSalvando(true);
    try {
      setSalvo(await onUpdate(formData));
    } finally {
      setSalvando(false);
    }
  };

  const desabilitado = isLoading || !professorData || salvando;
  const desde = desdeQuando(professorData?.criadoEm);
  const nomeExibido = professorData?.nome || "Professor";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-[18px]">
        <div aria-hidden="true" className="flex h-[50px] w-[50px] flex-none items-center justify-center rounded-full bg-primary text-base font-extrabold text-primary-foreground">
          {iniciais(nomeExibido)}
        </div>
        <div className="min-w-0">
          <h2 className="text-[28px] font-bold leading-tight">Meus dados</h2>
          <p className="mt-1.5 text-[13.5px] text-muted-foreground">
            {[professorData?.email, desde && `no TrailUp desde ${desde}`].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {salvo && (
        <div role="status" className="flex items-center gap-3.5 rounded-2xl border border-success/40 bg-success/15 px-5 py-3.5">
          <span aria-hidden="true" className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-success text-background">
            <Check className="h-3.5 w-3.5" strokeWidth={3.4} />
          </span>
          <span className="text-[13.5px] font-bold">Alterações salvas</span>
          <button type="button" onClick={() => setSalvo(false)} className="ml-auto text-[12.5px] font-semibold text-muted-foreground hover:text-foreground">
            Fechar
          </button>
        </div>
      )}

      <div className="grid items-start gap-5 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
        <section className="rounded-[20px] border border-primary bg-card p-6">
          <h3 className="text-[19px] font-bold">Informações pessoais</h3>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Aparecem para os alunos junto do material da sua turma</p>

          <div className="mt-5">
            <Label htmlFor="nome" className={rotulo}>Nome completo *</Label>
            <Input id="nome" className={campo} value={formData.nome} onChange={(e) => alterar({ nome: e.target.value })} placeholder="Seu nome completo" disabled={desabilitado} />
          </div>

          <div className="mt-4">
            <Label htmlFor="email" className={rotulo}>E-mail</Label>
            <div className="relative">
              <Lock aria-hidden="true" className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input id="email" value={professorData?.email || ""} disabled className={`${campo} bg-background pl-10`} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              O e-mail é a sua identificação de login e não pode ser alterado aqui. Para trocar, fale com o suporte.
            </p>
          </div>

          <div className="mt-4 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
            <div>
              <Label htmlFor="instituicao" className={rotulo}>Instituição *</Label>
              <Input id="instituicao" className={campo} value={formData.instituicao} onChange={(e) => alterar({ instituicao: e.target.value })} placeholder="Ex: ULBRA Palmas" disabled={desabilitado} />
            </div>
            <div>
              <Label htmlFor="disciplina" className={rotulo}>Disciplina principal</Label>
              <Input id="disciplina" className={campo} value={formData.disciplina} onChange={(e) => alterar({ disciplina: e.target.value })} placeholder="Ex: Redes de Computadores" disabled={desabilitado} />
            </div>
          </div>

          <div className="mt-4">
            <Label htmlFor="descricao" className={rotulo}>Descrição / apresentação</Label>
            <Textarea
              id="descricao"
              className={`${campo} min-h-[84px] leading-relaxed`}
              value={formData.descricao}
              maxLength={DESCRICAO_MAX}
              onChange={(e) => alterar({ descricao: e.target.value })}
              placeholder="Breve descrição sobre você e sua área de atuação"
              rows={4}
              disabled={desabilitado}
            />
            <p className="mt-1.5 text-right text-[10.5px] text-muted-foreground" aria-live="polite">
              {formData.descricao.length} / {DESCRICAO_MAX}
            </p>
          </div>

          <div className="mt-[18px] flex items-start gap-3.5 rounded-[14px] border border-primary bg-primary/10 px-[18px] py-4">
            <div className="min-w-0 flex-1">
              <Label htmlFor="geracao-automatica" className="text-[13.5px] font-bold">Geração automática de personalização</Label>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {formData.geracaoAutomatica
                  ? "Ligado: ao criar ou editar um tópico, a IA já gera o material dos 7 perfis. É o padrão recomendado."
                  : "Desligado: criar ou editar tópicos não dispara geração nenhuma. Você aciona manualmente na aba Personalizações, pelo botão “Gerar”."}
              </p>
            </div>
            <Switch id="geracao-automatica" checked={formData.geracaoAutomatica} onCheckedChange={(v) => alterar({ geracaoAutomatica: v })} disabled={desabilitado} />
          </div>

          <div className="mt-5 flex justify-end">
            <Button onClick={handleSave} disabled={desabilitado} className="rounded-full px-[22px] font-bold">
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              {salvando ? "Salvando…" : "Salvar alterações"}
            </Button>
          </div>
        </section>

        <div className="flex flex-col gap-5">
          <AlterarSenhaCard />

          {numeros && (
            <section className="rounded-[20px] border bg-card p-[22px]">
              <h3 className="text-base font-bold">Sua conta em números</h3>
              <dl className="mt-4 flex flex-wrap gap-6">
                {[
                  ["Turmas", numeros.turmas],
                  ["Alunos", numeros.alunos],
                  ["Tópicos", numeros.topicos],
                ].map(([nome, valor]) => (
                  <div key={nome}>
                    <dt className={rotulo}>{nome}</dt>
                    <dd className="mt-1 text-[22px] font-extrabold">{valor}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3.5 text-[11.5px] text-muted-foreground">É o que seria removido com a conta.</p>
            </section>
          )}
        </div>
      </div>

      <hr className="!my-9 border-border" />

      <section className="rounded-[20px] border border-l-4 border-l-destructive bg-card p-6">
        <div className="flex flex-wrap items-start gap-5">
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2.5 text-lg font-bold text-destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Zona de perigo
            </h3>
            <p className="mt-2 max-w-[600px] text-[13px] leading-relaxed text-muted-foreground">
              Excluir a conta é permanente.{" "}
              {numeros
                ? `Suas ${plural(numeros.turmas, "turma", "turmas")}, ${plural(numeros.topicos, "tópico", "tópicos")}, todo o material gerado pela IA e o histórico de ${plural(numeros.alunos, "aluno", "alunos")} são removidos`
                : "Suas turmas, tópicos, todo o material gerado pela IA e o histórico dos alunos são removidos"}{" "}
              e não podem ser recuperados. Se quiser apenas pausar o uso, basta não acessar — nada é apagado por inatividade.
            </p>
          </div>
          <Button variant="outline" disabled={desabilitado} onClick={() => setExcluindo(true)} className="rounded-full border-destructive/50 font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive">
            Excluir minha conta…
          </Button>
        </div>
      </section>

      <ExcluirContaDialog
        aberto={excluindo}
        numeros={numeros}
        onFechar={() => setExcluindo(false)}
        onConfirmar={() => {
          toast.info("A exclusão de conta ainda não está disponível. Fale com o suporte.");
          setExcluindo(false);
        }}
      />
    </div>
  );
}
