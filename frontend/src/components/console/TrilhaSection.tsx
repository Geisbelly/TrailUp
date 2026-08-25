import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ClassesManager from "./trilha/ClassesManager";
import TopicsManager from "./trilha/TopicsManager";
import ContentsManager from "./trilha/ContentsManager";
import ActivitiesManager from "./trilha/ActivitiesManager";
import QuestionsManager from "./trilha/QuestionsManager";

export default function TrilhaSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Gerenciamento de Trilhas</h2>
        <p className="text-muted-foreground">
          Gerencie classes, tópicos, conteúdos, atividades e questões
        </p>
      </div>

      <Tabs defaultValue="classes" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="topics">Tópicos</TabsTrigger>
          <TabsTrigger value="contents">Conteúdos</TabsTrigger>
          <TabsTrigger value="activities">Atividades</TabsTrigger>
          <TabsTrigger value="questions">Questões</TabsTrigger>
        </TabsList>

        <TabsContent value="classes">
          <ClassesManager />
        </TabsContent>

        <TabsContent value="topics">
          <TopicsManager />
        </TabsContent>

        <TabsContent value="contents">
          <ContentsManager />
        </TabsContent>

        <TabsContent value="activities">
          <ActivitiesManager />
        </TabsContent>

        <TabsContent value="questions">
          <QuestionsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
