import { supabase } from "@/integrations/supabase/client";

// Views do Supabase nao tem tipagem gerada (Views nao entram no schema do
// client) — este builder minimo cobre so os filtros que o console usa contra o
// client generico. O builder do supabase-js e "thenable": pode ser aguardado
// direto ou continuar recebendo filtros.
type Resultado = { data: unknown[] | null; error?: { message: string } | null };

type ViewFiltravel = PromiseLike<Resultado> & {
  eq: (column: string, value: string | number) => ViewFiltravel;
  in: (column: string, values: ReadonlyArray<string | number>) => ViewFiltravel;
  gte: (column: string, value: string | number) => ViewFiltravel;
  order: (column: string, options: { ascending: boolean }) => ViewFiltravel;
};

type ViewClient = {
  from: (relation: string) => {
    select: (columns: string) => ViewFiltravel;
  };
};

export function selectView(viewName: string, columns = "*"): ViewFiltravel {
  return (supabase as unknown as ViewClient).from(viewName).select(columns);
}
