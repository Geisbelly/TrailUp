import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Eye, Search, Link2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

interface Student {
  id: number;
  nome: string;
  email: string;
  classe: string;
  notaMedia: number;
  acertosPercentual: number;
  tempoMedio: number;
  ultimoAcesso: string;
  modoOperacao: string;
  perfil: string;
  classIds: number[];
}

interface Class {
  id: number;
  materia: string;
}

export default function StudentsTab() {
  const [students, setStudents] = useState<Student[]>([
    { 
      id: 1, 
      nome: "João Silva", 
      email: "joao@email.com", 
      classe: "Matemática - 1º Ano",
      notaMedia: 8.5,
      acertosPercentual: 85,
      tempoMedio: 45,
      ultimoAcesso: "2025-11-20",
      modoOperacao: "Ver conteúdo primeiro",
      perfil: "Conquistador (40%), Sobrevivente (30%)",
      classIds: [1]
    },
    { 
      id: 2, 
      nome: "Maria Santos", 
      email: "maria@email.com", 
      classe: "Física - 2º Ano",
      notaMedia: 9.2,
      acertosPercentual: 92,
      tempoMedio: 60,
      ultimoAcesso: "2025-11-25",
      modoOperacao: "Ver questões primeiro",
      perfil: "Competidor (45%), Realizador (35%)",
      classIds: [2]
    },
  ]);

  const [classes] = useState<Class[]>([
    { id: 1, materia: "Matemática - 1º Ano" },
    { id: 2, materia: "Física - 2º Ano" },
  ]);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkingStudent, setLinkingStudent] = useState<Student | null>(null);
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);

  const filteredStudents = students.filter(student => 
    student.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.classe.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleViewDetails = (student: Student) => {
    setSelectedStudent(student);
    setIsDetailsOpen(true);
  };

  const handleOpenLinkDialog = (student: Student) => {
    setLinkingStudent(student);
    setSelectedClassIds(student.classIds);
    setIsLinkDialogOpen(true);
  };

  const handleLinkSubmit = () => {
    if (!linkingStudent) return;

    const updatedStudents = students.map(s => 
      s.id === linkingStudent.id ? { ...s, classIds: selectedClassIds } : s
    );

    setStudents(updatedStudents);
    toast.success("Classes vinculadas com sucesso!");
    setIsLinkDialogOpen(false);
    setLinkingStudent(null);
    setSelectedClassIds([]);
  };

  const toggleClassSelection = (id: number) => {
    setSelectedClassIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Gerenciar Alunos</h2>
        <p className="text-muted-foreground mt-1">Visualize e gerencie alunos das turmas</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email ou classe..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead>Nota Média</TableHead>
                <TableHead>Acertos</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudents.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-medium">{student.nome}</TableCell>
                  <TableCell>{student.email}</TableCell>
                  <TableCell>{student.classe}</TableCell>
                  <TableCell>
                    <Badge variant={student.notaMedia >= 7 ? "default" : "secondary"}>
                      {student.notaMedia.toFixed(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>{student.acertosPercentual}%</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetails(student)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenLinkDialog(student)}
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Aluno</DialogTitle>
            <DialogDescription>
              Informações completas sobre o desempenho e perfil do aluno
            </DialogDescription>
          </DialogHeader>
          
          {selectedStudent && (
            <Tabs defaultValue="overview" className="mt-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Visão Geral</TabsTrigger>
                <TabsTrigger value="performance">Desempenho</TabsTrigger>
                <TabsTrigger value="profile">Perfil</TabsTrigger>
                <TabsTrigger value="history">Histórico</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{selectedStudent.nome}</CardTitle>
                    <CardDescription>{selectedStudent.email}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p><strong>Classe:</strong> {selectedStudent.classe}</p>
                    <p><strong>Nota Média:</strong> {selectedStudent.notaMedia}</p>
                    <p><strong>Último Acesso:</strong> {new Date(selectedStudent.ultimoAcesso).toLocaleDateString()}</p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="performance" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Métricas de Desempenho</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Taxa de Acertos</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-secondary rounded-full h-2">
                          <div 
                            className="bg-primary h-2 rounded-full" 
                            style={{ width: `${selectedStudent.acertosPercentual}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">{selectedStudent.acertosPercentual}%</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Tempo Médio por Atividade</p>
                      <p className="text-2xl font-bold">{selectedStudent.tempoMedio} min</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="profile" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Perfil de Jogador (BrainHex)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Perfis Detectados</p>
                      <p className="text-lg">{selectedStudent.perfil}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Modo de Operação Preferido</p>
                      <p className="text-lg">{selectedStudent.modoOperacao}</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="history" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Histórico de Atividades</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center p-2 border-b">
                        <span>Exercícios de Equações</span>
                        <Badge>8.5</Badge>
                      </div>
                      <div className="flex justify-between items-center p-2 border-b">
                        <span>Prova de Geometria</span>
                        <Badge>9.0</Badge>
                      </div>
                      <div className="flex justify-between items-center p-2 border-b">
                        <span>Lista de Funções</span>
                        <Badge>7.5</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular Classes</DialogTitle>
            <DialogDescription>
              Selecione as classes às quais este aluno pertence
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[400px] overflow-y-auto">
            {classes.map((classItem) => (
              <div key={classItem.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`class-${classItem.id}`}
                  checked={selectedClassIds.includes(classItem.id)}
                  onCheckedChange={() => toggleClassSelection(classItem.id)}
                />
                <label
                  htmlFor={`class-${classItem.id}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {classItem.materia}
                </label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsLinkDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleLinkSubmit}>Salvar Vínculos</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
