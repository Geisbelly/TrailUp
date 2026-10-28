import { HallBackground } from "@/components/HallTheme";
import {
  SectionGuideButton,
  SectionGuideStep,
} from "@/components/SectionGuideButton";
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// --- IMPORTS DO EXPO ---
import { Asset } from 'expo-asset';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// CORREÇÃO AQUI: Usamos '/legacy' para manter o moveAsync funcionando
import * as FileSystem from 'expo-file-system/legacy';

// Contexts e Utils
import { getBrainHexConfig } from "@/constants/profileImages";
import { useConquistaRank } from "@/context/ConquistaRankContext";
import { useUsuario } from "@/context/SessaoContext";
import { useTrilha } from "@/context/TrilhaContext";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { registrarAlvoTour } from "@/utils/tourTargets";
import { RelatorioDesktop } from "@/components/web/RelatorioDesktop";
import { imprimirHtmlNaWeb } from "@/utils/imprimirHtmlWeb";
import { useAviso } from "@/hooks/useAviso";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { perfilVisualDoAluno } from "@/utils/brainHex";

// Verifique se o caminho da imagem está correto
const appLogoSource = require("@/assets/images/trailup-brand-logo.png");

function formatRankValue(valor: number, criterio: string | null | undefined) {
  // `acertos` também é porcentagem — ver CRITERIOS_EM_PORCENTAGEM em rankingPodium.ts.
  if (criterio === "percentual" || criterio === "acertos") {
    return `${Math.round(valor)}%`;
  }
  if (criterio === "tempo") {
    const minutos = Math.round(valor);
    if (minutos < 60) return `${minutos} min`;
    const horas = Math.floor(minutos / 60);
    const restoMin = minutos % 60;
    return restoMin > 0 ? `${horas}h ${restoMin}min` : `${horas}h`;
  }
  return `${Math.trunc(valor)} pts`;
}

export default function RelatorioDadosScreen() {
  const { usuario } = useUsuario();
  const { classes } = useTrilha();
  const { eventos, conquistas, ranking, posicoesDoAluno } = useConquistaRank();
  const desktop = useDesktopWeb();
  const { avisar } = useAviso();
  
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollOffsetRef = useRef(0);
  const reportHeaderGuideRef = useRef<View | null>(null);
  const reportSummaryGuideRef = useRef<View | null>(null);
  const reportButtonGuideRef = useRef<View | null>(null);

  const perfilPrincipal = perfilVisualDoAluno(usuario);
  const perfilConfig = getBrainHexConfig(perfilPrincipal);
  const palette = useMemo(() => getProfileShellPalette(perfilPrincipal), [perfilPrincipal]);
  const guideSteps = useMemo<SectionGuideStep[]>(
    () => [
      {
        id: "report-intro",
        target: "report_header",
        title: "Relatório dos seus dados",
        description:
          "Esta página prepara uma visão consolidada da sua jornada usando os dados vinculados à sua conta.",
        icon: "file-chart-outline",
      },
      {
        id: "report-content",
        target: "report_summary",
        title: "O que entra no relatório",
        description:
          "O documento inclui identificação, quantidade de eventos registrados, posições nos rankings, progresso nas trilhas e conquistas disponíveis.",
        icon: "text-box-search-outline",
      },
      {
        id: "report-generate",
        target: "report_button",
        title: "Gerar e compartilhar o PDF",
        description:
          "Este botão monta o PDF completo no aparelho e abre as opções de compartilhamento. Gerar o arquivo não altera seus dados.",
        icon: "file-pdf-box",
      },
    ],
    [],
  );
  const guideTargets = useMemo(
    () => ({
      report_header: reportHeaderGuideRef,
      report_summary: reportSummaryGuideRef,
      report_button: reportButtonGuideRef,
    }),
    [],
  );

  useEffect(
    () =>
      registrarAlvoTour("config_relatorio", reportButtonGuideRef, () => {
        scrollRef.current?.scrollToEnd({ animated: false });
      }),
    [],
  );

  // --- CARREGAMENTO DA LOGO ---
  useEffect(() => {
    const loadLogo = async () => {
        try {
            const asset = Asset.fromModule(appLogoSource);
            await asset.downloadAsync();
            const uri = asset.localUri || asset.uri;
            
            // Ler arquivo local e converter para Base64
            const response = await fetch(uri);
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result as string;
                setLogoBase64(base64data);
            };
            reader.readAsDataURL(blob);
        } catch (error) {
            console.warn("Erro ao processar logo:", error);
        }
    };
    loadLogo();
  }, []);

  // --- PREPARAÇÃO DOS DADOS ---
  const resumoClasses = useMemo(() => {
    return classes.map((c) => {
      const totalTopicos = c.topicos?.length ?? 0;
      const concluidos = c.topicos?.filter((t) => {
          const st = String(t.status ?? "").toLowerCase();
          const pct = Number(t.percentual_concluido ?? 0);
          return st.includes("concl") || pct >= 100;
        }).length ?? 0;
      return {
        nome: c.resumo?.materia_nome ?? c.classe_id,
        totalTopicos,
        concluidos,
        progresso: totalTopicos > 0 ? Math.round((concluidos / totalTopicos) * 100) : 0,
      };
    });
  }, [classes]);

  const resumoEventos = useMemo(() => {
    return eventos?.map((e) => {
      const dataBR = e.criado_em
        ? new Date(e.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        : "—";
      const tipo = e.tipo ? e.tipo.replace(/_/g, " ").toUpperCase() : "EVENTO";
      return { 
        tipo, 
        valor: e.valor ?? 0, 
        referencia: e.referencia || "—", 
        data: dataBR 
      };
    }) ?? [];
  }, [eventos]);

  const resumoRanks = useMemo(() => {
    if (!ranking?.ranks) return [];
    return ranking.ranks.map((rank) => {
      const posicaoAluno = posicoesDoAluno?.find((p) => p.rank_id === rank.info.rank_id);
      return {
        nome: rank.info?.nome_rank ?? "Ranking",
        posicao: posicaoAluno?.posicao ?? "—",
        pontos: formatRankValue(posicaoAluno?.pontuacao ?? 0, rank.info?.criterio),
      };
    });
  }, [posicoesDoAluno, ranking]);

  const resumoConquistas = useMemo(() => {
    return conquistas?.map((c) => ({
      titulo: c.nome ?? "Conquista",
      pontos: c.pontos_recompensa ?? 0,
    })) ?? [];
  }, [conquistas]);

  // --- HTML PARA PDF ---
  const htmlRelatorio = useMemo(() => {
    const dataGerada = new Date().toLocaleString("pt-BR");
    const totalEventosReal = resumoEventos.length;
    const LIMITE_TABELA = 200; 
    const eventosParaTabela = resumoEventos.slice(0, LIMITE_TABELA);
    const eventosOcultos = Math.max(0, totalEventosReal - LIMITE_TABELA);
    
    const css = `
      @page { size: A4; margin: 0cm; }
      
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background-color: ${palette.background} !important; 
        color: ${palette.text};
        font-family: 'Helvetica', 'Arial', sans-serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .page-content { 
        padding: 32px 32px 60px 32px; 
        box-sizing: border-box;
        width: 100%;
        min-height: 100vh;
        position: relative;
        z-index: 1;
        background-color: ${palette.background};
      }
      
      .header { 
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 30px; 
        border-bottom: 2px solid ${palette.accent};
        padding-bottom: 20px;
      }
      .header-left { display: flex; align-items: center; gap: 15px; }
      .app-logo { 
        width: 60px; height: 60px; 
        border-radius: 12px; object-fit: contain; 
      }
      .app-info h1 { 
        color: ${palette.accent}; font-size: 24px; margin: 0; 
        letter-spacing: 1px; text-transform: uppercase;
      }
      .app-info h2 { 
        color: ${palette.text}; font-size: 14px; margin: 2px 0 0 0; font-weight: normal;
      }
      .report-meta { text-align: right; font-size: 10px; color: ${palette.textMuted}; }

      h3 { 
        color: ${palette.accent}; 
        font-size: 14px; 
        text-transform: uppercase;
        margin-top: 25px; 
        margin-bottom: 10px;
        border-bottom: 1px solid ${palette.border};
        padding-bottom: 5px;
      }
      
      .id-card { 
        background-color: ${palette.surface}; 
        padding: 15px; 
        border-radius: 8px; 
        border: 1px solid ${palette.border}; 
        display: flex;
        justify-content: space-between;
        margin-bottom: 20px;
      }
      .id-group { display: flex; flex-direction: column; }
      .id-label { color: ${palette.textMuted}; font-size: 9px; text-transform: uppercase; margin-bottom: 2px; }
      .id-value { font-weight: bold; color: ${palette.text}; font-size: 12px; }

      table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 15px; table-layout: fixed; }
      th { text-align: left; background-color: ${palette.surfaceElevated}; color: ${palette.accent}; padding: 6px 8px; font-weight: bold; }
      td { padding: 6px 8px; border-bottom: 1px solid ${palette.border}; color: ${palette.text}; word-wrap: break-word; }
      tr:nth-child(even) { background-color: rgba(255,255,255,0.02); }

      .conquista-grid { display: flex; flex-wrap: wrap; gap: 6px; }
      .conquista-item { 
        background: ${palette.surface}; padding: 5px 8px; 
        border-radius: 4px; border: 1px solid ${palette.border}; 
        font-size: 10px; flex: 1 1 30%; display: flex; justify-content: space-between;
      }
      .conquista-pts { color: ${palette.accent}; font-weight: bold; }

      .footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: 30px;
        background-color: ${palette.surface};
        border-top: 1px solid ${palette.accent};
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 40px;
        font-size: 9px;
        color: ${palette.textMuted};
        z-index: 100;
      }
      
      .limit-note { 
        text-align: center; color: ${palette.textMuted}; font-size: 9px; 
        margin-top: 10px; font-style: italic; 
        background: rgba(0,0,0,0.2); padding: 5px; border-radius: 4px;
      }
    `;

    const rowsTrilhas = resumoClasses.map(c => 
      `<tr><td>${c.nome}</td><td>${c.concluidos}/${c.totalTopicos}</td><td>${c.progresso}%</td></tr>`
    ).join("");

    const rowsEventos = eventosParaTabela.map(e => 
      `<tr><td>${e.tipo}</td><td>${e.referencia}</td><td>${e.valor} XP</td><td>${e.data}</td></tr>`
    ).join("");

    const rowsRanks = resumoRanks.map(r =>
      `<tr><td>${r.nome}</td><td># ${r.posicao}</td><td>${r.pontos}</td></tr>`
    ).join("");

    const listConquistas = resumoConquistas.map(c => 
      `<div class="conquista-item"><span>${c.titulo}</span><span class="conquista-pts">+${c.pontos}</span></div>`
    ).join("");

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>${css}</style>
        </head>
        <body>
          <div class="footer">
            <span>TRAILUP App &bull; Relatório Acadêmico</span>
            <span>ID: #${usuario?.id ?? "0000"} &bull; ${usuario?.email ?? ""}</span>
            <span>${dataGerada.split(',')[0]}</span>
          </div>

          <div class="page-content">
            <div class="header">
              <div class="header-left">
                ${logoBase64 ? `<img src="${logoBase64}" class="app-logo" />` : ''}
                <div class="app-info">
                  <h1>TRAILUP</h1>
                  <h2>Relatório de Desempenho</h2>
                </div>
              </div>
              <div class="report-meta">
                <p>GERADO EM</p>
                <p style="color:${palette.text}; font-weight:bold;">${dataGerada}</p>
              </div>
            </div>

            <div class="id-card">
              <div class="id-group">
                <span class="id-label">Aluno</span>
                <span class="id-value">${usuario?.nome ?? "Não identificado"}</span>
              </div>
              <div class="id-group">
                <span class="id-label">Perfil</span>
                <span class="id-value">${perfilConfig.label}</span>
              </div>
              <div class="id-group">
                <span class="id-label">Eventos</span>
                <span class="id-value">${totalEventosReal}</span>
              </div>
              <div class="id-group">
                <span class="id-label">Nível de Acesso</span>
                <span class="id-value">Estudante</span>
              </div>
            </div>

            <h3>Ranks e Posições</h3>
            ${rowsRanks ? `<table><tr><th>Ranking</th><th>Posição</th><th>Pontuação</th></tr>${rowsRanks}</table>` : '<p style="font-size:10px">Sem dados de rank.</p>'}

            <h3>Progresso nas Trilhas</h3>
            <table>
              <tr><th width="50%">Trilha</th><th>Módulos</th><th>% Concluído</th></tr>
              ${rowsTrilhas || "<tr><td colspan='3'>Nenhuma trilha iniciada</td></tr>"}
            </table>

            <h3>Conquistas (${resumoConquistas.length})</h3>
            <div class="conquista-grid">
              ${listConquistas || "<p style='color:#ADADC1; font-size:10px'>Nenhuma conquista ainda.</p>"}
            </div>

            <h3 style="margin-top: 30px">Histórico de Eventos</h3>
            <table>
              <tr><th>Tipo</th><th>Ref.</th><th>Valor</th><th>Data</th></tr>
              ${rowsEventos || "<tr><td colspan='4'>Sem eventos recentes</td></tr>"}
            </table>
            
            ${eventosOcultos > 0 ? `<div class="limit-note">...e mais ${eventosOcultos} registros antigos não listados neste documento para otimização de leitura.</div>` : ''}
          </div>
        </body>
      </html>
    `;
  }, [
    usuario,
    resumoClasses,
    resumoEventos,
    resumoRanks,
    resumoConquistas,
    perfilConfig,
    logoBase64,
    palette.accent,
    palette.background,
    palette.border,
    palette.surface,
    palette.surfaceElevated,
    palette.text,
    palette.textMuted,
  ]);

  const handleDownload = async () => {
    // Na web não existe `Print.printToFileAsync` nem `FileSystem`, e
    // `Sharing.isAvailableAsync()` é falso: o caminho de baixo falhava calado
    // (#28). O PDF sai pela impressão do navegador ("Salvar como PDF"), o mesmo
    // que a tela larga já faz desde o #346.
    if (Platform.OS === "web") {
      try {
        await imprimirHtmlNaWeb(htmlRelatorio, `Relatório TrailUp — ${usuario?.nome ?? "Aluno"}`);
      } catch (err) {
        console.warn("[Relatorio] Falha ao abrir a impressão na web:", err);
        avisar(
          "Não foi possível gerar o PDF",
          "O navegador não abriu a janela de impressão. Verifique se há bloqueio de pop-up e tente de novo.",
          "error"
        );
      }
      return;
    }

    try {
      // 1. Gerar o arquivo PDF temporário
      const { uri } = await Print.printToFileAsync({
          html: htmlRelatorio,
          margins: { left: 0, top: 0, right: 0, bottom: 0 } 
      });

      // 2. Definir o nome amigável do arquivo
      const nomeSanitizado = usuario?.nome?.replace(/[^a-zA-Z0-9]/g, "_") || "Usuário";
      const novoNome = `Relatorio_TrailUp_${nomeSanitizado}.pdf`;
      const novoPath = `${FileSystem.documentDirectory}${novoNome}`;

      // 3. Renomear (mover) o arquivo usando FileSystem Legacy
      await FileSystem.moveAsync({
        from: uri,
        to: novoPath
      });
      
      // 4. Compartilhar o arquivo com o novo nome
      await Sharing.shareAsync(novoPath, { 
        mimeType: "application/pdf",
        UTI: ".pdf",
        dialogTitle: `Relatório de ${usuario?.nome}`
      });

    } catch (err) {
      avisar("Erro", "Não foi possível gerar o PDF.", "error");
      console.error(err);
    }
  };

  // Web em tela larga (#346, protótipo v4): página própria, PDF pela impressão do navegador e erro visível.
  if (desktop) {
    const posicoes = (posicoesDoAluno ?? []).map((p) => Number(p.posicao)).filter((n) => Number.isFinite(n) && n > 0);
    return (
      <RelatorioDesktop
        html={htmlRelatorio}
        nome={usuario?.nome ?? "Aluno"}
        totalEventos={resumoEventos.length}
        melhorPosicao={posicoes.length ? Math.min(...posicoes) : null}
        palette={palette}
        resumoRef={reportSummaryGuideRef}
        botaoRef={reportButtonGuideRef}
      />
    );
  }

  // Celular (mobile-v1, 10-relatorio-dados.html): o que entra, o botão e a prévia.
  const posicoesValidas = (posicoesDoAluno ?? []).map((p) => Number(p.posicao)).filter((n) => Number.isFinite(n) && n > 0);
  const melhorPosicao = posicoesValidas.length ? Math.min(...posicoesValidas) : null;
  const totalEventos = resumoEventos.length >= 1000 ? "+1000" : String(resumoEventos.length);
  const ITENS_RELATORIO = [
    "Eventos de estudo e pontuação registrados durante suas sessões",
    "Suas posições em rankings da turma",
    "Progresso nas trilhas e conquistas desbloqueadas",
  ];

  return (
    <View style={[styles.outer, { backgroundColor: palette.background }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: 0.35, pointerEvents: "none" }]}>
        <HallBackground palette={palette} />
      </View>
      <SectionGuideButton
        profile={perfilPrincipal}
        sectionTitle="Relatório de dados"
        steps={guideSteps}
        targetRefs={guideTargets}
        scrollRef={scrollRef}
        scrollOffsetRef={scrollOffsetRef}
        style={styles.guideButton}
      />
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.conteudoCelular}
        onScroll={(event) => {
          scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        <View
          ref={reportSummaryGuideRef}
          collapsable={false}
          style={[styles.cartaoCelular, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          <View ref={reportHeaderGuideRef} collapsable={false}>
            <Text style={[styles.cartaoTitulo, { color: palette.text }]}>O que entra no relatório</Text>
          </View>
          {ITENS_RELATORIO.map((texto, i) => (
            <View key={texto} style={[styles.itemRelatorio, i > 0 && { borderTopWidth: 1, borderTopColor: palette.border }]}>
              <MaterialCommunityIcons name="check" size={18} color={palette.accent} style={styles.itemIcone} />
              <Text style={[styles.itemTexto, { color: palette.textMuted }]}>{texto}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.cartaoCelular, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.acaoTexto, { color: palette.textMuted }]}>
            Gere um PDF com tudo isso pra guardar ou compartilhar quando quiser.
          </Text>
          <View ref={reportButtonGuideRef} collapsable={false}>
            <TouchableOpacity
              style={[styles.botaoGerar, { backgroundColor: palette.accent }]}
              onPress={handleDownload}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="file-document-outline" size={18} color={palette.background} />
              <Text style={[styles.botaoGerarTexto, { color: palette.background }]}>Gerar e compartilhar o PDF</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.cartaoCelular, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.previaTitulo, { color: palette.text }]}>Prévia do PDF</Text>
          {/* A folha é de papel (bege) nos dois temas, como no protótipo. */}
          <View style={styles.folha}>
            <Text style={styles.folhaCab}>Relatório TrailUp — {usuario?.nome ?? "Aluno"}</Text>
            <View style={styles.linhaPapel} />
            <View style={styles.linhaPapel} />
            <View style={[styles.linhaPapel, { width: "60%" }]} />
            <View style={styles.folhaEspaco} />
            <View style={styles.linhaPapel} />
            <View style={styles.linhaPapel} />
            <View style={[styles.linhaPapel, { width: "60%" }]} />
            <View style={styles.folhaSelos}>
              <Text style={styles.folhaSelo}>{totalEventos} eventos</Text>
              {melhorPosicao ? <Text style={styles.folhaSelo}>{melhorPosicao}º no rank</Text> : null}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  conteudoCelular: { paddingHorizontal: 14, paddingTop: 56, paddingBottom: 28, gap: 14 },
  cartaoCelular: { borderRadius: 14, borderWidth: 1, padding: 16 },
  cartaoTitulo: { fontFamily: FontFamily.inikaBold, fontSize: 18, marginBottom: 10 },
  itemRelatorio: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 8 },
  itemIcone: { marginTop: 1 },
  itemTexto: { flex: 1, fontFamily: FontFamily.interMedium, fontSize: 14.5, lineHeight: 21 },
  acaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 14.5, lineHeight: 22, marginBottom: 12 },
  botaoGerar: { minHeight: 48, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  botaoGerarTexto: { fontFamily: FontFamily.interMedium, fontSize: 15, fontWeight: "700" },
  previaTitulo: { fontFamily: FontFamily.interMedium, fontSize: 15, fontWeight: "700", marginBottom: 10 },
  folha: { backgroundColor: "#f6f1e6", borderRadius: 6, padding: 16, elevation: 4 },
  folhaCab: { fontFamily: FontFamily.inikaBold, fontSize: 15, color: "#2a2416", marginBottom: 10 },
  linhaPapel: { height: 7, borderRadius: 4, backgroundColor: "#d9cfb9", marginVertical: 7 },
  folhaEspaco: { height: 10 },
  folhaSelos: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  folhaSelo: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", color: "#2a2416", backgroundColor: "#e8dfca", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: "hidden" },
  outer: {
    flex: 1,
  },
  guideButton: {
    position: "absolute",
    top: 14,
    right: 18,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 40,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profileImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    overflow: 'hidden'
  },
  profileImage: { width: '100%', height: '100%' },
  title: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 22,
  },
  subtitle: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    paddingBottom: 8,
  },
  cardTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 16,
    marginLeft: 8,
  },
  label: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  value: {
    fontFamily: FontFamily.interMedium,
    fontSize: 15,
  },
  trilhaItem: { marginBottom: 16 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  itemTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 14,
    color: Color.colorAliceblue,
  },
  percentText: {
    fontFamily: FontFamily.poppinsExtraBold,
    fontSize: 14,
  },
  detailText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    width: '100%',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  rankItem: {
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.05)'
  },
  tag: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 4,
      borderWidth: 1,
  },
  tagText: {
      fontSize: 12,
      fontFamily: FontFamily.interMedium
  },
  emptyText: {
      fontStyle: 'italic',
      fontSize: 12
      ,
      fontFamily: FontFamily.interMedium
  },
  button: {
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 10,
  },
  buttonText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 14,
    color: Color.colorWhite,
  },
});
