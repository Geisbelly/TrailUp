import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Save, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { ProfessorUpdateData } from "@/pages/Console";

interface ProfileSectionProps {
  professorData: {
    id: string;
    nome: string;
    email: string | null;
    instituicao: string | null;
    disciplina: string | null;
    descricao: string | null;
  } | null;
  onUpdate: (data: ProfessorUpdateData) => void;
  isLoading?: boolean;
}

export default function ProfileSection({ professorData, onUpdate, isLoading }: ProfileSectionProps) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    nome: professorData?.nome || "",
    instituicao: professorData?.instituicao || "",
    disciplina: professorData?.disciplina || "",
    descricao: professorData?.descricao || "",
  });
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  useEffect(() => {
    setFormData({
      nome: professorData?.nome || "",
      instituicao: professorData?.instituicao || "",
      disciplina: professorData?.disciplina || "",
      descricao: professorData?.descricao || "",
    });
  }, [professorData]);

  const handleSave = () => {
    if (!formData.nome || !formData.instituicao) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    const updatedData = { ...professorData, ...formData };
    onUpdate(updatedData);
  };

  const isDisabled = isLoading || !professorData;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold">Meus Dados</h2>
        <p className="text-muted-foreground">Gerencie suas informações pessoais</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informações Pessoais</CardTitle>
          <CardDescription>Atualize seus dados cadastrais</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="nome">Nome Completo *</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              placeholder="Seu nome completo"
              disabled={isDisabled}
            />
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={professorData?.email || ""} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground mt-1">O email não pode ser alterado</p>
          </div>

          <div>
            <Label htmlFor="instituicao">Instituição *</Label>
            <Input
              id="instituicao"
              value={formData.instituicao}
              onChange={(e) => setFormData({ ...formData, instituicao: e.target.value })}
              placeholder="Ex: ULBRA Palmas"
              disabled={isDisabled}
            />
          </div>

          <div>
            <Label htmlFor="disciplina">Disciplina Principal</Label>
            <Input
              id="disciplina"
              value={formData.disciplina}
              onChange={(e) => setFormData({ ...formData, disciplina: e.target.value })}
              placeholder="Ex: Redes de Computadores"
              disabled={isDisabled}
            />
          </div>

          <div>
            <Label htmlFor="descricao">Descrição / Apresentação</Label>
            <Textarea
              id="descricao"
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              placeholder="Breve descrição sobre você e sua área de atuação"
              rows={4}
              disabled={isDisabled}
            />
          </div>

          <Button onClick={handleSave} className="w-full" disabled={isDisabled}>
            <Save className="h-4 w-4 mr-2" />
            Salvar Alterações
          </Button>
        </CardContent>
      </Card>

      <Separator />

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Zona de Perigo
          </CardTitle>
          <CardDescription>Ações irreversíveis que afetam sua conta</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Excluir sua conta é uma ação permanente. Todos os seus dados, classes, conteúdos e
              atividades serão removidos e não poderão ser recuperados.
            </AlertDescription>
          </Alert>

          <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" disabled={isDisabled}>
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir Minha Conta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-destructive">Excluir Conta</DialogTitle>
                <DialogDescription>
                  Esta ação é irreversível. Todos os seus dados serão permanentemente excluídos.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <p className="text-sm">
                  Para confirmar, digite <strong>EXCLUIR</strong> no campo abaixo:
                </p>
                <Input
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder="Digite EXCLUIR"
                  disabled={isDisabled}
                />
              </div>

              <DialogFooter>
                <Button
                  variant="destructive"
                  disabled={deleteConfirmation !== "EXCLUIR" || isDisabled}
                  onClick={() => {
                    toast.info("Fluxo de exclusão deve ser implementado na API.");
                    setIsDeleteDialogOpen(false);
                  }}
                >
                  Confirmar Exclusão
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
