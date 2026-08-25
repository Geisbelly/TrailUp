import { Aluno } from "@/models/Aluno";
import { ReactNode } from "react";

export interface TrilhaProviderProps {
  aluno: Aluno;
  children: ReactNode;
}