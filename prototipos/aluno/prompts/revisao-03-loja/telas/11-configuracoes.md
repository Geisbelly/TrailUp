Tela 11 — **Configurações**, ajuste. Arquivo: `v3/11-configuracoes.html` (edite o atual). A lista de seções da esquerda e os 4 interruptores de "Coleta e acessos" continuam.

## 1. Feedback
Print de "Coleta e acessos" com a metade direita vazia marcada:

> "aproveitar melhor o espaço"

Causa: o painel de detalhe tinha `max-width: 640px`.

## 2. O que muda
- O painel usa a largura toda: grade `minmax(0,1fr) 340px`, gap 24. Título e descrição em cima, nas duas colunas.
- **Esquerda:** os interruptores, como estão.
- **Direita, coluna sticky** com 3 cards (fundo `surface`, raio 14):
  1. **"Sua coleta agora"**: "**3** de 4 sinais ativos"; "A câmera começa desligada para todo mundo e só liga se você ligar. Aceitar o termo não a liga." (#309 na main); "Termo de consentimento v4 · aceito em 07/10/2026" (#306).
  2. **"O que a IA faz com cada sinal"**: uma linha por interruptor, com ponto verde (ligado) ou cinza (desligado): Câmera estima a expressão para ajustar o ritmo (estágio FER+, #305); Uso e navegação mede o tempo ativo que alimenta o Tempo de Estudo do ranking; Desempenho escolhe a ordem do material e onde reforçar; Chat libera o guia, que não entrega respostas.
  3. **"Seus dados"**: atalhos para Gerar relatório dos dados (`10`), Política de privacidade e Solicitar exclusão da conta (`danger`).
- **Sai** a etiqueta "CONFIGURAÇÕES — HUB + PAINEL DE DETALHE" no rodapé (regra 2.1 da revisão 02, que tinha escapado nesta tela).

## 3. Aceite
- [ ] Sem área vazia à direita; resumo da coleta ao lado dos interruptores.
- [ ] Sem etiqueta de estado na tela.
