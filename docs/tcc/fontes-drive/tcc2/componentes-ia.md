---
fonte: Google Drive — TCC 2 / Planilha sem título (componentes de IA)
link: https://docs.google.com/spreadsheets/d/1fVqm74SkPOuuU16bNfoJpmbrXzTvktwKAg5jRTEQoDY/edit
exportado: 2026-10-18
---

> Cópia em texto do documento do Drive (conversão automática docx → Markdown). Imagens, prints e diagramas foram omitidos; o original no Drive é a fonte de verdade.

## Página1

| **Componente** | Função principal | **Papel da LLM** |
|----|----|----|
| 1\. Validador de respostas | Classificar respostas como correta, parcial, incorreta etc. | Apenas casos ambíguos |
| 2\. Modelo de estado do estudante | Estimar estado atual a partir do histórico | Não necessária |
| 3\. Modelo de engajamento | Classificar padrões de interação/engajamento | Não necessária |
| 4\. Modelo de dificuldade | Estimar dificuldade/conhecimento demonstrado | Não necessária |
| 5\. Detector de mudança | Identificar alterações relevantes no comportamento | Não necessária |
| 6\. Modelo de estratégia/presentação | Classificar quais estratégias/formas de apresentação tendem a ser adequadas | Não necessária |
| 7\. Modelo de perfil/preferências | Utilizar BrainHex + comportamento como sinais iniciais | Não necessária |
| 8\. Motor de decisão TrailUp | Combinar os sinais dos modelos + regras + contexto | Orquestra quando chamar |
| 9\. RAG de evidências | Recuperar evidências pedagógicas para fundamentar estratégias | Não gera decisões |
| 10\. LLM generativa | Explicações, feedback, notificações, intervenções, transformação de conteúdo etc. | Principal função generativa |
| 11\. Avaliação das intervenções | Verificar se a intervenção produziu melhora | Pode utilizar modelos, não precisa de LLM |
| **Modelo** | **Entrada principal** | **Saída** |
| Validador de respostas | questão + gabarito + resposta | correta / parcial / incorreta |
| Classificador de desempenho | histórico de acertos, erros, tentativas etc. | baixo / médio / alto |
| Classificador de engajamento | tempo, sessões, conclusão, interação etc. | baixo / médio / alto |
| Classificador de dificuldade | desempenho + características da atividade | baixa / média / alta |
