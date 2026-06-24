import { HallBackground, OrnamentDivider } from "@/components/HallTheme";
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import tinycolor from "tinycolor2";

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

// Verifique se o caminho da imagem está correto
const appLogoSource = require("@/assets/ImagensReferencia/rosa_dos_ventos_filter.png");

export default function RelatorioDadosScreen() {
  const { usuario } = useUsuario();
  const { classes } = useTrilha();
  const { eventos, conquistas, ranking, posicoesDoAluno } = useConquistaRank();
  
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  const perfilPrincipal = usuario?.perfis?.[0]?.nome || "conqueror";
  const perfilConfig = getBrainHexConfig(perfilPrincipal);
  const palette = useMemo(() => getProfileShellPalette(perfilPrincipal), [perfilPrincipal]);
  const gold = useMemo(() => tinycolor(palette.accent).lighten(10).toHexString(), [palette.accent]);

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
        pontos: posicaoAluno?.pontuacao != null ? Math.trunc(posicaoAluno.pontuacao) : "0",
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
      `<tr><td>${r.nome}</td><td># ${r.posicao}</td><td>${r.pontos} pts</td></tr>`
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
      Alert.alert("Erro", "Não foi possível gerar o PDF.");
      console.error(err);
    }
  };

  const ProgressBar = ({ progress }: { progress: number }) => (
    <View style={[styles.progressTrack, { backgroundColor: palette.progressTrack }]}>
      <View style={[styles.progressBar, { width: `${progress}%`, backgroundColor: palette.accent }]} />
    </View>
  );

  return (
    <View style={[styles.outer, { backgroundColor: palette.background }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} pointerEvents="none">
        <HallBackground palette={palette} />
      </View>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >

      <View style={styles.headerContainer}>
        <View
          style={[
            styles.profileImageContainer,
            {
              backgroundColor: palette.surfaceElevated,
              borderColor: gold,
            },
          ]}
        >
            <Image source={perfilConfig.image} style={styles.profileImage} resizeMode="contain" />
        </View>
        <Text style={[styles.title, { color: gold }]}>Relatório Completo</Text>
        <Text style={[styles.subtitle, { color: palette.textMuted }]}>Visão geral da sua jornada</Text>
        <View style={{ opacity: 0.6, marginTop: 8 }}>
          <OrnamentDivider color={gold} />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
        <View style={[styles.cardHeader, { borderBottomColor: palette.border }]}>
          <MaterialCommunityIcons name="account-details" size={20} color={palette.accent} />
          <Text style={[styles.cardTitle, { color: palette.text }]}>Identificação</Text>
        </View>
        <Text style={[styles.label, { color: palette.textMuted }]}>NOME</Text>
        <Text style={[styles.value, { color: palette.text }]}>{usuario?.nome}</Text>
        <View style={{height: 10}}/>
        <Text style={[styles.label, { color: palette.textMuted }]}>E-MAIL</Text>
        <Text style={[styles.value, { color: palette.text }]}>{usuario?.email}</Text>
        <View style={{height: 10}}/>
        <Text style={[styles.label, { color: palette.textMuted }]}>TOTAL DE EVENTOS REGISTRADOS</Text>
        <Text style={[styles.value, { color: palette.text }]}>
          {resumoEventos.length >= 1000 ? "+1000" : resumoEventos.length}
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
        <View style={[styles.cardHeader, { borderBottomColor: palette.border }]}>
          <MaterialCommunityIcons name="trophy-outline" size={20} color={palette.accent} />
          <Text style={[styles.cardTitle, { color: palette.text }]}>Ranks Atuais</Text>
        </View>
        {resumoRanks.length > 0 ? resumoRanks.map((r, i) => (
          <View key={i} style={[styles.rankItem, { borderBottomColor: palette.border }]}>
             <Text style={[styles.itemTitle, { color: palette.text }]}>{r.nome}</Text>
             <View style={styles.rowBetween}>
                <Text style={[styles.detailText, { color: palette.textMuted }]}>Posição: <Text style={{color: palette.text}}>#{r.posicao}</Text></Text>
                <Text style={[styles.detailText, { color: palette.textMuted }]}>{r.pontos} pts</Text>
             </View>
          </View>
        )) : <Text style={[styles.emptyText, { color: palette.textMuted }]}>Sem participação em ranks.</Text>}
      </View>

      <View style={[styles.card, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
        <View style={[styles.cardHeader, { borderBottomColor: palette.border }]}>
          <MaterialCommunityIcons name="map-marker-path" size={20} color={palette.accent} />
          <Text style={[styles.cardTitle, { color: palette.text }]}>Progresso em Trilhas</Text>
        </View>
        {resumoClasses.map((c, idx) => (
            <View key={idx} style={styles.trilhaItem}>
              <View style={styles.rowBetween}>
                <Text style={[styles.itemTitle, { color: palette.text }]}>{c.nome}</Text>
                <Text style={[styles.percentText, { color: palette.accent }]}>{c.progresso}%</Text>
              </View>
              <ProgressBar progress={c.progresso} />
            </View>
          ))}
      </View>

      <View style={[styles.card, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
        <View style={[styles.cardHeader, { borderBottomColor: palette.border }]}>
          <MaterialCommunityIcons name="medal-outline" size={20} color={palette.accent} />
          <Text style={[styles.cardTitle, { color: palette.text }]}>Conquistas ({resumoConquistas.length})</Text>
        </View>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
            {resumoConquistas.slice(0, 6).map((c, i) => (
                <View key={i} style={[styles.tag, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <Text style={[styles.tagText, { color: palette.text }]}>{c.titulo}</Text>
                </View>
            ))}
            {resumoConquistas.length > 6 && (
                <Text style={[styles.detailText, { color: palette.textMuted }]}>+ {resumoConquistas.length - 6} outras...</Text>
            )}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: palette.accent, borderColor: palette.borderStrong }]}
        onPress={handleDownload}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons name="file-pdf-box" size={24} color={Color.colorWhite} style={{marginRight: 8}}/>
        <Text style={styles.buttonText}>GERAR PDF COMPLETO</Text>
      </TouchableOpacity>

      <View style={{height: 40}} />
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
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
