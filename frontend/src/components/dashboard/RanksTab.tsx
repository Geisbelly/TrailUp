import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Rank {
  id: number;
  nome: string;
  descricao: string;
  criterio: string;
  periodo: string;
}

export default function RanksTab() {
  const [ranks, setRanks] = useState<Rank[]>([
    { id: 1, nome: "Top Pontuadores", descricao: "Ranking por pontuação total", criterio: "pontuacao", periodo: "mensal" },
    { id: 2, nome: "Mais Dedicados", descricao: "Ranking por tempo de estudo", criterio: "tempo", periodo: "semanal" },
  ]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRank, setEditingRank] = useState<Rank | null>(null);
  const [formData, setFormData] = useState({ nome: "", descricao: "", criterio: "pontuacao", periodo: "mensal" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRank) {
      setRanks(ranks.map(r => 
        r.id === editingRank.id ? { ...r, ...formData } : r
      ));
      toast.success("Ranking atualizado com sucesso!");
    } else {
      const newRank: Rank = {
        id: Math.max(...ranks.map(r => r.id), 0) + 1,
        ...formData,
      };
      setRanks([...ranks, newRank]);
      toast.success("Ranking criado com sucesso!");
    }
    handleDialogClose();
  };

  const handleEdit = (rank: Rank) => {
    setEditingRank(rank);
    setFormData(rank);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    setRanks(ranks.filter(r => r.id !== id));
    toast.success("Ranking excluído com sucesso!");
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingRank(null);
    setFormData({ nome: "", descricao: "", criterio: "pontuacao", periodo: "mensal" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Gerenciar Rankings</h2>
          <p className="text-muted-foreground mt-1">Configure rankings e métricas de desempenho</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleDialogClose()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Ranking
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editingRank ? "Editar Ranking" : "Novo Ranking"}</DialogTitle>
                <DialogDescription>
                  {editingRank ? "Atualize os dados do ranking" : "Preencha os dados do novo ranking"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome do Ranking</Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="descricao">Descrição</Label>
                  <Textarea
                    id="descricao"
                    value={formData.descricao}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="criterio">Critério</Label>
                    <Input
                      id="criterio"
                      value={formData.criterio}
                      onChange={(e) => setFormData({ ...formData, criterio: e.target.value })}
                      placeholder="Ex: pontuacao, tempo, acertos"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="periodo">Período</Label>
                    <Input
                      id="periodo"
                      value={formData.periodo}
                      onChange={(e) => setFormData({ ...formData, periodo: e.target.value })}
                      placeholder="Ex: semanal, mensal"
                      required
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleDialogClose}>
                  Cancelar
                </Button>
                <Button type="submit">{editingRank ? "Atualizar" : "Criar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ranks.map((rank) => (
          <Card key={rank.id}>
            <CardHeader>
              <CardTitle>{rank.nome}</CardTitle>
              <CardDescription>{rank.descricao}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm mb-4">
                <p><span className="text-muted-foreground">Critério:</span> {rank.criterio}</p>
                <p><span className="text-muted-foreground">Período:</span> {rank.periodo}</p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(rank)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(rank.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
