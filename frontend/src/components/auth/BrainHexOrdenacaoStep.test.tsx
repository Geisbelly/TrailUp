import { Children, isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import BrainHexOrdenacaoStep from "./BrainHexOrdenacaoStep";
import { PERFIS_EM_ORDEM } from "@/features/signup/brainhexOrdenacao";

// Exercita os controles e seus handlers sem browser/Auth/Supabase.
type Props = { children?: ReactNode; type?: string; disabled?: boolean; checked?: boolean;
  onClick?: () => void; onChange?: (event: { target: { checked: boolean } }) => void };
function controles(tree: ReactNode): Props[] {
  const found: Props[] = [];
  Children.forEach(tree, child => {
    if (!isValidElement<Props>(child)) return;
    found.push(child.props);
    found.push(...controles(child.props.children));
  });
  return found;
}
function texto(children: ReactNode): string {
  return Children.toArray(children).map(child => typeof child === "string" ? child : "").join("").trim();
}

describe("confirmação de preferência", () => {
  it("não conclui a ordem sorteada sem confirmação explícita", () => {
    const finish = vi.fn();
    const tree = BrainHexOrdenacaoStep({ ordem: PERFIS_EM_ORDEM, onChange: vi.fn(),
      confirmada: false, onConfirmacao: vi.fn(), onFinish: finish });
    const botao = controles(tree).find(p => texto(p.children) === "Concluir")!;
    expect(botao.disabled).toBe(true);
    botao.onClick!(); // mesmo uma chamada direta ao handler não pode contornar a confirmação
    expect(finish).not.toHaveBeenCalled();
  });

  it("aceita confirmação sem obrigar o aluno a mover os itens", () => {
    const change = vi.fn(), finish = vi.fn(), confirmation = vi.fn();
    const props = { ordem: PERFIS_EM_ORDEM, onChange: change, confirmada: false,
      onConfirmacao: confirmation, onFinish: finish };
    const checkbox = controles(BrainHexOrdenacaoStep(props)).find(p => p.type === "checkbox")!;
    checkbox.onChange!({ target: { checked: true } });
    expect(confirmation).toHaveBeenCalledWith(true);
    const botao = controles(BrainHexOrdenacaoStep({ ...props, confirmada: true }))
      .find(p => texto(p.children) === "Concluir")!;
    expect(botao.disabled).toBe(false);
    botao.onClick!();
    expect(finish).toHaveBeenCalledOnce();
    expect(change).not.toHaveBeenCalled();
  });
});
