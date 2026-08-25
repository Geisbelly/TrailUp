import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Polygon, Rect, Text as SvgText } from "react-native-svg";
import tinycolor from "tinycolor2";
import { BrainHexProfile, getBrainHexConfig } from "@/constants/profileImages";
import { FontFamily } from "@/styles/GlobalStyle";
import { MetricsThemeResolved, getMetricsThemeOption } from "@/utils/profileMetricThemes";
import { ProfileMetricsViewModel } from "./profileMetricsViewModel";

const CHART_W = 280;

type ThemePalette = {
  heroTop: string;
  heroBottom: string;
  border: string;
  soft: string;
  card: string;
  cardAlt: string;
  muted: string;
  text: string;
};

type DashboardProps = {
  profile: BrainHexProfile;
  theme: MetricsThemeResolved;
  vm: ProfileMetricsViewModel;
  palette: ThemePalette;
  accent: string;
  themeBadge: {
    label: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
  };
};

function formatPercent(value?: number | null) {
  return `${Math.round(Number(value ?? 0))}%`;
}

function formatMinutes(value?: number | null) {
  const minutes = Math.max(0, Math.round(Number(value ?? 0)));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}min` : `${hours}h`;
}

function formatLastEvent(value?: string | null) {
  if (!value) return "sem registros";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function buildPalette(theme: MetricsThemeResolved, baseColor: string): ThemePalette {
  switch (theme) {
    case "arena":
      return {
        heroTop: tinycolor.mix(baseColor, "#071526", 40).toRgbString(),
        heroBottom: tinycolor.mix("#0f1724", "#111936", 50).toRgbString(),
        border: tinycolor(baseColor).setAlpha(0.42).toRgbString(),
        soft: tinycolor(baseColor).setAlpha(0.18).toRgbString(),
        card: "rgba(8, 16, 28, 0.84)",
        cardAlt: "rgba(255,255,255,0.05)",
        muted: "rgba(242,247,250,0.62)",
        text: "#F8FAFC",
      };
    case "goals":
      return {
        heroTop: tinycolor.mix(baseColor, "#4f2300", 28).toRgbString(),
        heroBottom: tinycolor.mix("#1e1a30", "#111936", 65).toRgbString(),
        border: tinycolor(baseColor).setAlpha(0.34).toRgbString(),
        soft: tinycolor(baseColor).setAlpha(0.16).toRgbString(),
        card: "rgba(28, 20, 14, 0.74)",
        cardAlt: "rgba(255,255,255,0.05)",
        muted: "rgba(255,244,231,0.7)",
        text: "#FFF8F0",
      };
    case "mystery":
      return {
        heroTop: tinycolor.mix(baseColor, "#18200b", 28).toRgbString(),
        heroBottom: tinycolor.mix("#101725", "#111936", 60).toRgbString(),
        border: tinycolor(baseColor).setAlpha(0.34).toRgbString(),
        soft: tinycolor(baseColor).setAlpha(0.14).toRgbString(),
        card: "rgba(17, 23, 16, 0.76)",
        cardAlt: "rgba(255,255,255,0.05)",
        muted: "rgba(250,250,227,0.68)",
        text: "#FBF8E8",
      };
    case "squad":
      return {
        heroTop: tinycolor.mix(baseColor, "#231241", 26).toRgbString(),
        heroBottom: tinycolor.mix("#181235", "#111936", 58).toRgbString(),
        border: tinycolor(baseColor).setAlpha(0.34).toRgbString(),
        soft: tinycolor(baseColor).setAlpha(0.16).toRgbString(),
        card: "rgba(28, 18, 45, 0.78)",
        cardAlt: "rgba(255,255,255,0.05)",
        muted: "rgba(246,238,255,0.72)",
        text: "#FBF7FF",
      };
    case "analytics":
    default:
      return {
        heroTop: tinycolor.mix(baseColor, "#162137", 25).toRgbString(),
        heroBottom: tinycolor.mix("#162137", "#111936", 62).toRgbString(),
        border: tinycolor(baseColor).setAlpha(0.3).toRgbString(),
        soft: tinycolor(baseColor).setAlpha(0.16).toRgbString(),
        card: "rgba(255,255,255,0.05)",
        cardAlt: "rgba(255,255,255,0.08)",
        muted: "rgba(242,247,250,0.64)",
        text: "#FFFFFF",
      };
  }
}

function SurfaceCard({ children, palette }: { children: React.ReactNode; palette: ThemePalette }) {
  return <View style={[s.surfaceCard, { backgroundColor: palette.card, borderColor: palette.border }]}>{children}</View>;
}

function SectionTitle({
  title,
  subtitle,
  icon,
  palette,
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  palette: ThemePalette;
}) {
  return (
    <View style={s.sectionTitleWrap}>
      <View style={s.sectionTitleRow}>
        {icon ? (
          <View style={[s.sectionIconWrap, { backgroundColor: palette.soft }]}>
            <MaterialCommunityIcons name={icon} size={16} color={palette.text} />
          </View>
        ) : null}
        <Text style={[s.sectionTitle, { color: palette.text }]}>{title}</Text>
      </View>
      {subtitle ? <Text style={[s.sectionSubtitle, { color: palette.muted }]}>{subtitle}</Text> : null}
    </View>
  );
}

function DashboardThemeBadge({
  palette,
  accent,
  badge,
}: {
  palette: ThemePalette;
  accent: string;
  badge: DashboardProps["themeBadge"];
}) {
  return (
    <View style={[s.modeChipInline, { borderColor: palette.border, backgroundColor: palette.soft }]}>
      <MaterialCommunityIcons name={badge.icon} size={15} color={accent} />
      <Text style={[s.modeChipText, { color: palette.text }]}>{badge.label}</Text>
    </View>
  );
}

function StatTile({
  icon,
  label,
  value,
  helper,
  palette,
  accent,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  helper?: string;
  palette: ThemePalette;
  accent: string;
}) {
  return (
    <View style={[s.statTile, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}>
      <View style={[s.statIconWrap, { backgroundColor: tinycolor(accent).setAlpha(0.18).toRgbString() }]}>
        <MaterialCommunityIcons name={icon} size={18} color={accent} />
      </View>
      <Text style={[s.statLabel, { color: palette.muted }]}>{label}</Text>
      <Text style={[s.statValue, { color: palette.text }]}>{value}</Text>
      {helper ? <Text style={[s.statHelper, { color: palette.muted }]}>{helper}</Text> : null}
    </View>
  );
}

function ProgressLine({
  label,
  current,
  total,
  accent,
  palette,
}: {
  label: string;
  current: number;
  total: number;
  accent: string;
  palette: ThemePalette;
}) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (current / total) * 100)) : 0;
  return (
    <View style={s.progressLine}>
      <View style={s.progressLineHeader}>
        <Text style={[s.progressLineLabel, { color: palette.text }]}>{label}</Text>
        <Text style={[s.progressLineValue, { color: palette.muted }]}>
          {current}/{total}
        </Text>
      </View>
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: accent }]} />
      </View>
    </View>
  );
}

function AnalysisPanel({ vm, palette, accent }: { vm: ProfileMetricsViewModel; palette: ThemePalette; accent: string }) {
  const hasAnalysisDetail =
    vm.analysisSignals.length > 0 ||
    vm.analysisInsights.length > 0 ||
    vm.analysisWarnings.length > 0 ||
    vm.analysisRecommendations.length > 0;

  return (
    <SurfaceCard palette={palette}>
      <SectionTitle
        title="Leitura adaptativa"
        subtitle="Última interpretação da IA durante sua sessão de estudo."
        icon="radar"
        palette={palette}
      />
      <View style={s.chipRow}>
        <View style={[s.chip, { backgroundColor: palette.soft }]}>
          <MaterialCommunityIcons name="emoticon-outline" size={16} color={accent} />
          <Text style={[s.chipText, { color: palette.text }]}>{vm.emotionLabel}</Text>
        </View>
        <View style={[s.chip, { backgroundColor: palette.soft }]}>
          <MaterialCommunityIcons
            name={vm.cameraLabel.includes("ativa") ? "camera-outline" : "camera-off-outline"}
            size={16}
            color={accent}
          />
          <Text style={[s.chipText, { color: palette.text }]}>{vm.cameraLabel}</Text>
        </View>
      </View>
      {vm.cicloId ? (
        <>
          <Text style={[s.sectionSubtitle, { color: palette.muted }]}>Ciclo atual: {vm.cicloId}</Text>
          {vm.analysisSummary ? (
            <Text style={[s.storyBody, { color: palette.text, marginTop: 10 }]}>{vm.analysisSummary}</Text>
          ) : null}
        </>
      ) : (
        <Text style={[s.emptyText, { color: palette.muted }]}>
          Ainda não há leitura recente. Estude um tópico para gerar análise adaptativa.
        </Text>
      )}
      {vm.analysisSignals.length ? (
        <View style={s.actionsWrap}>
          {vm.analysisSignals.map((signal) => (
            <View
              key={signal}
              style={[s.actionPill, { backgroundColor: palette.soft, borderColor: palette.border }]}
            >
              <Text style={[s.actionText, { color: palette.text }]}>{signal}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {vm.actions.length ? (
        <View style={s.actionsWrap}>
          {vm.actions.map((action) => (
            <View key={action} style={[s.actionPill, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}>
              <Text style={[s.actionText, { color: palette.text }]}>{action}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {hasAnalysisDetail ? (
        <View style={s.analysisStack}>
          {vm.analysisInsights.length ? (
            <View style={[s.analysisBox, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}>
              <Text style={[s.analysisBoxTitle, { color: palette.text }]}>Leituras da IA</Text>
              {vm.analysisInsights.map((item) => (
                <Text key={item} style={[s.analysisBoxItem, { color: palette.muted }]}>
                  {"•"} {item}
                </Text>
              ))}
            </View>
          ) : null}
          {vm.analysisRecommendations.length ? (
            <View style={[s.analysisBox, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}>
              <Text style={[s.analysisBoxTitle, { color: palette.text }]}>Ajustes aplicados</Text>
              {vm.analysisRecommendations.map((item) => (
                <Text key={item} style={[s.analysisBoxItem, { color: palette.muted }]}>
                  {"•"} {item}
                </Text>
              ))}
            </View>
          ) : null}
          {vm.analysisWarnings.length ? (
            <View
              style={[
                s.analysisBox,
                {
                  backgroundColor: tinycolor(accent).setAlpha(0.08).toRgbString(),
                  borderColor: tinycolor(accent).setAlpha(0.22).toRgbString(),
                },
              ]}
            >
              <Text style={[s.analysisBoxTitle, { color: palette.text }]}>Pontos de atenção</Text>
              {vm.analysisWarnings.map((item) => (
                <Text key={item} style={[s.analysisBoxItem, { color: palette.muted }]}>
                  {"•"} {item}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </SurfaceCard>
  );
}

function EmptyState({
  palette,
  accent,
  icon,
  title,
  description,
}: {
  palette: ThemePalette;
  accent: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  description: string;
}) {
  return (
    <SurfaceCard palette={palette}>
      <View style={[s.emptyIconWrap, { backgroundColor: tinycolor(accent).setAlpha(0.16).toRgbString() }]}>
        <MaterialCommunityIcons name={icon} size={24} color={accent} />
      </View>
      <Text style={[s.emptyTitle, { color: palette.text }]}>{title}</Text>
      <Text style={[s.emptyText, { color: palette.muted }]}>{description}</Text>
    </SurfaceCard>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function formatSeconds(sec: number) {
  if (sec <= 0) return "0s";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}min ${s}s` : `${m}min`;
}

function formatMinutesTimer(totalMin?: number | null) {
  if (totalMin == null) return "—";
  const totalSec = Math.round(totalMin * 60);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}min ${sec}s`;
}

function KpiPill({ label, value, palette }: { label: string; value: string; palette: ThemePalette }) {
  return (
    <View style={[s.kpiPill, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}>
      <Text style={[s.kpiLabel, { color: palette.muted }]}>{label}</Text>
      <Text style={[s.kpiValue, { color: palette.text }]}>{value}</Text>
    </View>
  );
}

// ─── EngagementBar ────────────────────────────────────────────────────────────

function EngagementBar({
  activeSec,
  idleSec,
  accent,
  palette,
}: {
  activeSec: number;
  idleSec: number;
  accent: string;
  palette: ThemePalette;
}) {
  const total = activeSec + idleSec;
  const activeW = total > 0 ? Math.max(4, (activeSec / total) * CHART_W) : 0;

  return (
    <View style={s.chartWrap}>
      <Svg width={CHART_W} height={38}>
        <Rect x={0} y={0} width={CHART_W} height={14} rx={7} fill={tinycolor(palette.cardAlt).toString()} />
        {activeW > 0 && (
          <Rect x={0} y={0} width={activeW} height={14} rx={7} fill={accent} />
        )}
        <SvgText x={0} y={34} fontSize={11} fill={accent}>
          Ativo {formatSeconds(activeSec)}
        </SvgText>
        <SvgText x={CHART_W} y={34} textAnchor="end" fontSize={11} fill={palette.muted}>
          Ocioso {formatSeconds(idleSec)}
        </SvgText>
      </Svg>
    </View>
  );
}

// ─── TimeDistributionBars ─────────────────────────────────────────────────────

function TimeDistributionBars({
  tempoTopico,
  tempoConteudo,
  tempoAtividade,
  accent,
  palette,
}: {
  tempoTopico: number;
  tempoConteudo: number;
  tempoAtividade: number;
  accent: string;
  palette: ThemePalette;
}) {
  const BAR_H = 16;
  const GAP = 14;
  const LABEL_W = 76;
  const BAR_AREA = CHART_W - LABEL_W;
  const maxVal = Math.max(tempoTopico, tempoConteudo, tempoAtividade, 1);
  const bars = [
    { label: "Tópico", value: tempoTopico, color: accent },
    { label: "Conteúdo", value: tempoConteudo, color: tinycolor(accent).lighten(10).toString() },
    { label: "Atividade", value: tempoAtividade, color: tinycolor(accent).lighten(22).toString() },
  ];
  const svgH = bars.length * (BAR_H + GAP);

  return (
    <Svg width={CHART_W} height={svgH}>
      {bars.map(({ label, value, color }, idx) => {
        const barW = Math.max(0, (value / maxVal) * BAR_AREA);
        const y = idx * (BAR_H + GAP);
        return (
          <React.Fragment key={idx}>
            <SvgText x={0} y={y + BAR_H - 2} fontSize={11} fill={palette.muted}>
              {label}
            </SvgText>
            <Rect x={LABEL_W} y={y} width={BAR_AREA} height={BAR_H} rx={4} fill={tinycolor(palette.cardAlt).toString()} />
            {barW > 0 && (
              <Rect x={LABEL_W} y={y} width={barW} height={BAR_H} rx={4} fill={color} />
            )}
            <SvgText x={LABEL_W + barW + 6} y={y + BAR_H - 2} fontSize={11} fill={palette.text}>
              {formatSeconds(value)}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// ─── Chart helpers ────────────────────────────────────────────────────────────

function radarPoints(axes: { value: number }[], cx: number, cy: number, R: number) {
  const N = axes.length;
  return axes
    .map((a, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / N;
      const r = (Math.max(0, Math.min(100, a.value)) / 100) * R;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    })
    .join(" ");
}

function radarGridPoints(cx: number, cy: number, R: number, N: number, frac: number) {
  return Array.from({ length: N }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / N;
    const r = R * frac;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(" ");
}

function arcPath(cx: number, cy: number, r: number, value: number): string {
  if (value <= 0) return "";
  const startAngle = -Math.PI / 2;
  const x0 = cx + r * Math.cos(startAngle);
  const y0 = cy + r * Math.sin(startAngle);
  if (value >= 100) {
    const mid = startAngle + Math.PI;
    const xMid = cx + r * Math.cos(mid);
    const yMid = cy + r * Math.sin(mid);
    return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${xMid} ${yMid} A ${r} ${r} 0 0 1 ${x0} ${y0}`;
  }
  const endAngle = startAngle + (value / 100) * 2 * Math.PI;
  const x1 = cx + r * Math.cos(endAngle);
  const y1 = cy + r * Math.sin(endAngle);
  const largeArc = value > 50 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1}`;
}

// ─── RadarChart ───────────────────────────────────────────────────────────────

function RadarChart({
  axes,
  accent,
  palette,
  glowStyle = "plain",
}: {
  axes: { label: string; value: number }[];
  accent: string;
  palette: ThemePalette;
  glowStyle?: "neon" | "plain";
}) {
  const N = axes.length;
  if (N < 3) return null;
  const SIZE = 300;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R = 84;
  const allZero = axes.every((a) => a.value === 0);

  return (
    <Svg width={SIZE} height={SIZE}>
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map((frac) => (
        <Polygon
          key={frac}
          points={radarGridPoints(cx, cy, R, N, frac)}
          fill="none"
          stroke={palette.border}
          strokeWidth={1}
        />
      ))}
      {/* Axis lines */}
      {axes.map((_, i) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / N;
        return (
          <Line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + R * Math.cos(angle)}
            y2={cy + R * Math.sin(angle)}
            stroke={palette.muted}
            strokeWidth={1}
            opacity={0.3}
          />
        );
      })}
      {/* Glow halo */}
      {glowStyle === "neon" && !allZero && (
        <Polygon
          points={radarPoints(axes, cx, cy, R)}
          fill="none"
          stroke={accent}
          strokeWidth={6}
          opacity={0.18}
        />
      )}
      {/* Data polygon */}
      {allZero ? (
        <>
          <Polygon
            points={radarGridPoints(cx, cy, R, N, 0.05)}
            fill={tinycolor(accent).setAlpha(0.08).toRgbString()}
            stroke={palette.border}
            strokeWidth={1}
          />
          <SvgText
            x={cx}
            y={cy + 5}
            textAnchor="middle"
            fontSize={11}
            fill={palette.muted}
          >
            Sem dados ainda
          </SvgText>
        </>
      ) : (
        <>
          <Polygon
            points={radarPoints(axes, cx, cy, R)}
            fill={tinycolor(accent).setAlpha(0.22).toRgbString()}
            stroke={accent}
            strokeWidth={2}
          />
          {axes.map((a, i) => {
            const angle = -Math.PI / 2 + (2 * Math.PI * i) / N;
            const r = (Math.max(0, Math.min(100, a.value)) / 100) * R;
            return (
              <Circle
                key={i}
                cx={cx + r * Math.cos(angle)}
                cy={cy + r * Math.sin(angle)}
                r={4}
                fill={accent}
              />
            );
          })}
        </>
      )}
      {/* Axis labels */}
      {axes.map((a, i) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / N;
        const lx = cx + (R + 14) * Math.cos(angle);
        const ly = cy + (R + 14) * Math.sin(angle);
        const cosA = Math.cos(angle);
        const anchor = cosA > 0.2 ? "start" : cosA < -0.2 ? "end" : "middle";
        return (
          <SvgText
            key={i}
            x={lx}
            y={ly + 4}
            textAnchor={anchor}
            fontSize={10}
            fill={palette.muted}
          >
            {a.label}
          </SvgText>
        );
      })}
    </Svg>
  );
}

// ─── WeeklyBars ───────────────────────────────────────────────────────────────

function WeeklyBars({ data, accent, palette }: { data: number[]; accent: string; palette: ThemePalette }) {
  const CHART_H = 120;
  const barW = 24;
  const gap = (CHART_W - 7 * barW) / 8;
  const maxVal = Math.max(...data, 1);
  const labels = ["D-6", "D-5", "D-4", "D-3", "D-2", "D-1", "Hoje"];

  return (
    <Svg width={CHART_W} height={CHART_H + 4}>
      {data.map((val, i) => {
        const barH = Math.max(4, (val / maxVal) * (CHART_H - 22));
        const bx = gap + i * (barW + gap);
        const by = CHART_H - barH - 18;
        return (
          <React.Fragment key={i}>
            <Rect
              x={bx}
              y={by}
              width={barW}
              height={barH}
              rx={4}
              fill={tinycolor(accent).setAlpha(val > 0 ? 0.55 : 0.15).toRgbString()}
            />
            {val > 0 && (
              <Rect
                x={bx}
                y={by}
                width={barW}
                height={3}
                rx={2}
                fill={accent}
                opacity={0.9}
              />
            )}
            <SvgText
              x={bx + barW / 2}
              y={CHART_H - 2}
              textAnchor="middle"
              fontSize={9}
              fill={palette.muted}
            >
              {labels[i]}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// ─── ConcentricRings ──────────────────────────────────────────────────────────

function ConcentricRings({
  outer,
  mid,
  inner,
  accent,
  palette,
}: {
  outer: number;
  mid: number;
  inner: number;
  accent: string;
  palette: ThemePalette;
}) {
  const SIZE = 240;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const rings = [
    { r: 100, value: outer, label: "Exploração", color: accent },
    { r: 78, value: mid, label: "Conteúdo", color: tinycolor(accent).lighten(10).toString() },
    { r: 56, value: inner, label: "Atividades", color: tinycolor(accent).lighten(22).toString() },
  ];

  return (
    <Svg width={SIZE} height={SIZE}>
      {rings.map(({ r, value, label, color }) => (
        <React.Fragment key={r}>
          {/* Track */}
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={tinycolor(palette.border).setAlpha(0.4).toRgbString()}
            strokeWidth={14}
          />
          {/* Arc */}
          {value > 0 && (
            <Path
              d={arcPath(cx, cy, r, value)}
              fill="none"
              stroke={color}
              strokeWidth={14}
              strokeLinecap="round"
            />
          )}
          {/* Percentage label */}
          <SvgText
            x={cx + r * Math.cos(0)}
            y={cy + 4}
            textAnchor="middle"
            fontSize={9}
            fill={palette.muted}
          >
            {Math.round(value)}%
          </SvgText>
        </React.Fragment>
      ))}
      {/* Legend labels at bottom of each ring */}
      {rings.map(({ r, label, color }, idx) => {
        const lx = cx;
        const ly = cy - r - 8;
        return (
          <SvgText key={idx} x={lx} y={ly} textAnchor="middle" fontSize={9} fill={color}>
            {label}
          </SvgText>
        );
      })}
    </Svg>
  );
}

// ─── DiscoveryRadial ──────────────────────────────────────────────────────────

function DiscoveryRadial({
  total,
  discovered,
  accent,
  palette,
}: {
  total: number;
  discovered: number;
  accent: string;
  palette: ThemePalette;
}) {
  const SIZE = 260;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const RO = 110;
  const RI = 42;

  if (total === 0) {
    return (
      <Svg width={SIZE} height={SIZE}>
        <Circle cx={cx} cy={cy} r={RO} fill="none" stroke={palette.border} strokeWidth={2} strokeDasharray="6 4" />
        <Circle cx={cx} cy={cy} r={RI} fill={palette.card} stroke={accent} strokeWidth={1.5} />
        <SvgText x={cx} y={cy + 5} textAnchor="middle" fontSize={22} fill={palette.muted}>
          ?
        </SvgText>
      </Svg>
    );
  }

  const N = Math.min(total, 12);
  const sectorAngle = (2 * Math.PI) / N;
  const gap = N === 1 ? 0 : 0.06;

  function sectorPath(i: number, filled: boolean) {
    const a0 = -Math.PI / 2 + i * sectorAngle + gap / 2;
    const a1 = a0 + sectorAngle - gap;
    const largeArc = a1 - a0 > Math.PI ? 1 : 0;
    const x0i = cx + RI * Math.cos(a0);
    const y0i = cy + RI * Math.sin(a0);
    const x0o = cx + RO * Math.cos(a0);
    const y0o = cy + RO * Math.sin(a0);
    const x1o = cx + RO * Math.cos(a1);
    const y1o = cy + RO * Math.sin(a1);
    const x1i = cx + RI * Math.cos(a1);
    const y1i = cy + RI * Math.sin(a1);
    return `M ${x0i} ${y0i} L ${x0o} ${y0o} A ${RO} ${RO} 0 ${largeArc} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${RI} ${RI} 0 ${largeArc} 0 ${x0i} ${y0i} Z`;
  }

  return (
    <Svg width={SIZE} height={SIZE}>
      {Array.from({ length: N }, (_, i) => {
        const isFilled = i < Math.min(discovered, N);
        return (
          <Path
            key={i}
            d={sectorPath(i, isFilled)}
            fill={isFilled ? tinycolor(accent).setAlpha(0.7).toRgbString() : palette.cardAlt}
            stroke={tinycolor(palette.border).setAlpha(0.5).toRgbString()}
            strokeWidth={1}
          />
        );
      })}
      <Circle cx={cx} cy={cy} r={RI - 2} fill={palette.card} stroke={accent} strokeWidth={1.5} />
      <SvgText x={cx} y={cy - 5} textAnchor="middle" fontSize={13} fill={palette.text}>
        {Math.min(discovered, N)}/{N}
      </SvgText>
      <SvgText x={cx} y={cy + 12} textAnchor="middle" fontSize={9} fill={palette.muted}>
        tópicos
      </SvgText>
    </Svg>
  );
}

// ─── PresenceGrid ─────────────────────────────────────────────────────────────

function PresenceGrid({ data, accent, palette }: { data: number[]; accent: string; palette: ThemePalette }) {
  const dotR = 12;
  const spacing = CHART_W / 7;
  const dotCy = 28;

  const startDay = new Date();
  startDay.setDate(startDay.getDate() - 6);
  const dayLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDay);
    d.setDate(startDay.getDate() + i);
    return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.getDay()];
  });

  return (
    <Svg width={CHART_W} height={72}>
      {data.map((count, i) => {
        const dotCx = spacing / 2 + i * spacing;
        const hasActivity = count > 0;
        const opacity = hasActivity ? 0.5 + 0.5 * Math.min(count / 5, 1) : 1;
        return (
          <React.Fragment key={i}>
            <Circle
              cx={dotCx}
              cy={dotCy}
              r={dotR}
              fill={hasActivity ? tinycolor(accent).setAlpha(opacity).toRgbString() : palette.cardAlt}
              stroke={hasActivity ? accent : palette.border}
              strokeWidth={hasActivity ? 0 : 1}
            />
            {count > 0 && (
              <SvgText x={dotCx} y={dotCy + 4} textAnchor="middle" fontSize={9} fill={palette.text}>
                {count}
              </SvgText>
            )}
            <SvgText x={dotCx} y={dotCy + dotR + 16} textAnchor="middle" fontSize={9} fill={palette.muted}>
              {dayLabels[i]}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// ─── TopicBarChart ────────────────────────────────────────────────────────────

function TopicBarChart({
  concluidos,
  emAndamento,
  pendentes,
  total,
  accent,
  palette,
}: {
  concluidos: number;
  emAndamento: number;
  pendentes: number;
  total: number;
  accent: string;
  palette: ThemePalette;
}) {
  const BAR_H = 18;
  const GAP = 14;
  const LABEL_W = 88;
  const BAR_AREA = CHART_W - LABEL_W;
  const safeTotal = Math.max(total, 1);
  const bars = [
    { label: "Concluídos", value: concluidos, color: accent },
    { label: "Em andamento", value: emAndamento, color: tinycolor(accent).setAlpha(0.65).toRgbString() },
    { label: "Pendentes", value: pendentes, color: tinycolor(accent).setAlpha(0.35).toRgbString() },
  ];
  const svgH = bars.length * (BAR_H + GAP);

  return (
    <Svg width={CHART_W} height={svgH}>
      {bars.map(({ label, value, color }, idx) => {
        const barW = Math.max(0, (value / safeTotal) * BAR_AREA);
        const y = idx * (BAR_H + GAP);
        return (
          <React.Fragment key={idx}>
            <SvgText x={0} y={y + BAR_H - 3} fontSize={11} fill={palette.muted}>
              {label}
            </SvgText>
            <Rect x={LABEL_W} y={y} width={BAR_AREA} height={BAR_H} rx={4} fill={tinycolor(palette.cardAlt).toString()} />
            {barW > 0 && (
              <Rect x={LABEL_W} y={y} width={barW} height={BAR_H} rx={4} fill={color} />
            )}
            <SvgText x={LABEL_W + barW + 6} y={y + BAR_H - 3} fontSize={11} fill={palette.text}>
              {value}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// ─── AffinityBoard ────────────────────────────────────────────────────────────

function AffinityBoard({ vm, palette, accent }: { vm: ProfileMetricsViewModel; palette: ThemePalette; accent: string }) {
  return (
    <SurfaceCard palette={palette}>
      <SectionTitle
        title="Perfil de aprendizagem"
        subtitle="Afinidades BrainHex detectadas para orientar a experiência."
        icon="brain"
        palette={palette}
      />
      {vm.afinidades.length === 0 ? (
        <Text style={[s.emptyText, { color: palette.muted }]}>Ainda não há perfis associados ao usuário.</Text>
      ) : (
        vm.afinidades.map((item) => (
          <ProgressLine
            key={item.id}
            label={item.nome}
            current={Math.round(item.afinidade)}
            total={100}
            accent={accent}
            palette={palette}
          />
        ))
      )}
    </SurfaceCard>
  );
}

function TempoEstudoSection({ vm, palette, accent }: { vm: ProfileMetricsViewModel; palette: ThemePalette; accent: string }) {
  if (!vm.hasSessionMetrics) return null;
  return (
    <SurfaceCard palette={palette}>
      <SectionTitle title="Tempo de estudo" subtitle="Tempo médio ativo por tipo de conteúdo nesta sessão." icon="timer-outline" palette={palette} />
      <View style={s.statRow}>
        <StatTile icon="timer-outline" label="Em tópicos" value={formatSeconds(vm.tempoTopico)} palette={palette} accent={accent} />
        <StatTile icon="book-open-outline" label="Em conteúdos" value={formatSeconds(vm.tempoConteudo)} palette={palette} accent={accent} />
        <StatTile icon="pencil-outline" label="Em atividades" value={formatSeconds(vm.tempoAtividade)} palette={palette} accent={accent} />
      </View>
    </SurfaceCard>
  );
}

function BossSection({ vm, palette, accent }: { vm: ProfileMetricsViewModel; palette: ThemePalette; accent: string }) {
  if (vm.danoTotal === null) return null;
  return (
    <SurfaceCard palette={palette}>
      <SectionTitle title="Boss" icon="sword-cross" palette={palette} />
      <View style={s.statRow}>
        <StatTile icon="sword-cross" label="Dano causado ao boss" value={String(vm.danoTotal)} palette={palette} accent={accent} />
      </View>
    </SurfaceCard>
  );
}

function MelhorTempoSection({ vm, palette, accent }: { vm: ProfileMetricsViewModel; palette: ThemePalette; accent: string }) {
  if (vm.melhorTempoMin === null) return null;
  return (
    <SurfaceCard palette={palette}>
      <SectionTitle title="Melhor tempo" icon="timer-sand" palette={palette} />
      <View style={s.statRow}>
        <StatTile icon="timer-sand" label="Melhor tempo em atividade" value={formatMinutesTimer(vm.melhorTempoMin)} palette={palette} accent={accent} />
      </View>
    </SurfaceCard>
  );
}

function ArenaDashboard({ profile, vm, palette, accent, themeBadge }: DashboardProps) {
  const copy =
    profile === "conqueror"
      ? {
          eyebrow: "CENTRAL DE DOMÍNIO",
          title: "Sua campanha está sob controle",
          subtitle: "Rank, precisão e avanço da classe aparecem como uma operação em andamento.",
          mission: "Status da operação",
        }
      : profile === "daredevil"
      ? {
          eyebrow: "HUD DE RITMO",
          title: "Sua rodada pede velocidade e leitura",
          subtitle: "O painel destaca impulso, acertos e ritmo para manter a pressão do estudo.",
          mission: "Pulso da missão",
        }
      : {
          eyebrow: "MODO RESISTÊNCIA",
          title: "Consistência vence o mapa",
          subtitle: "O foco está em checkpoints, retomada e capacidade de se manter avançando.",
          mission: "Estado da linha de frente",
        };

  return (
    <View style={s.dashboard}>
      <LinearGradient colors={[palette.heroTop, palette.heroBottom]} style={[s.heroCard, { borderColor: palette.border }]}>
        <DashboardThemeBadge palette={palette} accent={accent} badge={themeBadge} />
        <Text style={[s.heroEyebrow, { color: palette.muted }]}>{copy.eyebrow}</Text>
        <Text style={[s.heroTitle, { color: palette.text }]}>{copy.title}</Text>
        <Text style={[s.heroSubtitle, { color: palette.muted }]}>
          {vm.materiaNome ? `Classe atual: ${vm.materiaNome}. ${copy.subtitle}` : copy.subtitle}
        </Text>
        <View style={s.statGrid}>
          <StatTile icon="crosshairs-gps" label="Precisão" value={formatPercent(vm.acertos)} helper="desempenho nas respostas" palette={palette} accent={accent} />
          <StatTile icon="trophy-outline" label="Posição" value={vm.melhorPosicao?.posicao ? `#${vm.melhorPosicao.posicao}` : "Sem rank"} helper="melhor marca na classe" palette={palette} accent={accent} />
          <StatTile
            icon="clock-outline"
            label="Tempo ativo"
            value={formatSeconds(vm.sessionActiveSec)}
            helper={vm.hasSessionMetrics ? "sessão atual" : vm.presencaResumo}
            palette={palette}
            accent={accent}
          />
          <StatTile icon="flag-outline" label="Campanha" value={formatPercent(vm.progresso)} helper={vm.missaoResumo} palette={palette} accent={accent} />
        </View>
      </LinearGradient>

      {!vm.hasAnyData ? (
        <EmptyState
          palette={palette}
          accent={accent}
          icon="shield-outline"
          title="Nenhuma missão em campo"
          description="Entre em uma classe e complete seus primeiros passos para ativar a central tática."
        />
      ) : (
        <>
          <TempoEstudoSection vm={vm} palette={palette} accent={accent} />
          <BossSection vm={vm} palette={palette} accent={accent} />
          <MelhorTempoSection vm={vm} palette={palette} accent={accent} />
          <SurfaceCard palette={palette}>
            <SectionTitle title={copy.mission} subtitle="Visão rápida da campanha atual." icon="sword-cross" palette={palette} />
            <View style={s.tripleRow}>
              <View style={[s.kpiPill, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}>
                <Text style={[s.kpiLabel, { color: palette.muted }]}>Concluídos</Text>
                <Text style={[s.kpiValue, { color: palette.text }]}>{vm.concluidos}</Text>
              </View>
              <View style={[s.kpiPill, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}>
                <Text style={[s.kpiLabel, { color: palette.muted }]}>Em andamento</Text>
                <Text style={[s.kpiValue, { color: palette.text }]}>{vm.emAndamento}</Text>
              </View>
              <View style={[s.kpiPill, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}>
                <Text style={[s.kpiLabel, { color: palette.muted }]}>Conquistas</Text>
                <Text style={[s.kpiValue, { color: palette.text }]}>{vm.totalConquistas}</Text>
              </View>
            </View>
            <ProgressLine label="Tópicos dominados" current={vm.concluidos} total={vm.totalTopicos} accent={accent} palette={palette} />
            <ProgressLine label="Conteúdos explorados" current={vm.conteudosConcluidos} total={vm.totalConteudos} accent={accent} palette={palette} />
            <ProgressLine label="Atividades concluídas" current={vm.atividadesConcluidas} total={vm.totalAtividades} accent={accent} palette={palette} />
          </SurfaceCard>
          <SurfaceCard palette={palette}>
            <SectionTitle title="Próximo movimento" subtitle="O que mais aproxima você da próxima vitória." icon="lightning-bolt" palette={palette} />
            <Text style={[s.storyHeadline, { color: palette.text }]}>{vm.proximoMarco}</Text>
            <Text style={[s.storyBody, { color: palette.muted }]}>
              Último registro em {formatLastEvent(vm.ultimoEvento)}. Continue alimentando a campanha para reforçar sua presença no ranking.
            </Text>
          </SurfaceCard>
          <SurfaceCard palette={palette}>
            <SectionTitle title="Inteligência de combate" subtitle="Visão tática do desempenho nos 5 eixos." icon="radar" palette={palette} />
            <View style={s.chartCenter}>
              <RadarChart
                axes={[
                  { label: "Precisão", value: vm.acertos },
                  { label: "Progresso", value: vm.progresso },
                  { label: "Exploração", value: vm.taxaExploracao },
                  { label: "Atividades", value: vm.taxaAtividade },
                  { label: "Presença", value: Math.min((vm.diasAtivos / 7) * 100, 100) },
                ]}
                accent={accent}
                palette={palette}
                glowStyle="neon"
              />
            </View>
          </SurfaceCard>
          <SurfaceCard palette={palette}>
            <SectionTitle title="Pulso da semana" subtitle="Atividade registrada nos últimos 7 dias." icon="chart-bar" palette={palette} />
            <View style={s.chartCenter}>
              <WeeklyBars data={vm.semanaDiaria} accent={accent} palette={palette} />
            </View>
          </SurfaceCard>
          {vm.hasSessionMetrics && (
            <SurfaceCard palette={palette}>
              <SectionTitle title="Operação em tempo real" subtitle="Eficiência e intensidade da última sessão de estudo." icon="timer-outline" palette={palette} />
              <EngagementBar activeSec={vm.sessionActiveSec} idleSec={vm.sessionIdleSec} accent={accent} palette={palette} />
              <View style={s.tripleRow}>
                <KpiPill label="Eficiência" value={`${Math.round(vm.sessionEngajamento)}%`} palette={palette} />
                <KpiPill label="Ações" value={String(vm.touchTotal)} palette={palette} />
                <KpiPill label="Tópicos" value={String(vm.topicosVisitados)} palette={palette} />
              </View>
            </SurfaceCard>
          )}
          <AnalysisPanel vm={vm} palette={palette} accent={accent} />
        </>
      )}
    </View>
  );
}

function GoalsDashboard({ vm, palette, accent, themeBadge }: DashboardProps) {
  const checkpoints = [
    { label: "Meta da trilha", done: vm.progresso >= 100, helper: `${formatPercent(vm.progresso)} concluído` },
    { label: "Meta de conteúdo", done: vm.totalConteudos > 0 && vm.conteudosConcluidos >= vm.totalConteudos, helper: `${vm.conteudosConcluidos}/${vm.totalConteudos} concluídos` },
    { label: "Meta de atividades", done: vm.totalAtividades > 0 && vm.atividadesConcluidas >= vm.totalAtividades, helper: `${vm.atividadesConcluidas}/${vm.totalAtividades} finalizadas` },
    { label: "Meta de presença", done: vm.diasAtivos >= 5, helper: `${vm.diasAtivos} dias ativos` },
  ];

  return (
    <View style={s.dashboard}>
      <LinearGradient colors={[palette.heroTop, palette.heroBottom]} style={[s.heroCard, { borderColor: palette.border }]}>
        <DashboardThemeBadge palette={palette} accent={accent} badge={themeBadge} />
        <Text style={[s.heroEyebrow, { color: palette.muted }]}>CENTRO DE METAS</Text>
        <Text style={[s.heroTitle, { color: palette.text }]}>Seu avanço em marcos visíveis</Text>
        <Text style={[s.heroSubtitle, { color: palette.muted }]}>
          {vm.materiaNome ? `Classe atual: ${vm.materiaNome}. O foco aqui é transformar estudo em metas claras.` : "O foco aqui é transformar estudo em metas claras, mensuráveis e motivadoras."}
        </Text>
        <View style={s.statGrid}>
          <StatTile icon="target" label="Meta principal" value={formatPercent(vm.progresso)} helper="progresso da trilha" palette={palette} accent={accent} />
          <StatTile icon="check-decagram-outline" label="Conquistas" value={String(vm.totalConquistas)} helper="recompensas desbloqueadas" palette={palette} accent={accent} />
          <StatTile icon="clock-outline" label="Tempo investido" value={formatMinutes(vm.tempo)} helper={`${formatMinutes(vm.tempoMedio)} por atividade`} palette={palette} accent={accent} />
          <StatTile icon="chart-donut" label="Taxa de acerto" value={formatPercent(vm.acertos)} helper="qualidade das respostas" palette={palette} accent={accent} />
        </View>
      </LinearGradient>

      {!vm.hasAnyData ? (
        <EmptyState
          palette={palette}
          accent={accent}
          icon="target"
          title="Sem metas em andamento"
          description="Quando você entrar em uma trilha, este painel vai traduzir seu estudo em objetivos e marcos."
        />
      ) : (
        <>
          <TempoEstudoSection vm={vm} palette={palette} accent={accent} />
          <BossSection vm={vm} palette={palette} accent={accent} />
          <MelhorTempoSection vm={vm} palette={palette} accent={accent} />
          <SurfaceCard palette={palette}>
            <SectionTitle title="Checklist da jornada" subtitle="Metas que ajudam a visualizar o que já foi entregue." icon="clipboard-check-outline" palette={palette} />
            {checkpoints.map((item) => (
              <View key={item.label} style={[s.checkRow, { borderColor: palette.border }]}>
                <View style={[s.checkIconWrap, { backgroundColor: item.done ? palette.soft : palette.cardAlt }]}>
                  <MaterialCommunityIcons name={item.done ? "check-circle-outline" : "circle-outline"} size={18} color={item.done ? accent : palette.muted} />
                </View>
                <View style={s.checkTextWrap}>
                  <Text style={[s.checkTitle, { color: palette.text }]}>{item.label}</Text>
                  <Text style={[s.checkHelper, { color: palette.muted }]}>{item.helper}</Text>
                </View>
              </View>
            ))}
          </SurfaceCard>
          <SurfaceCard palette={palette}>
            <SectionTitle title="Anéis de metas" subtitle="Progresso em exploração, conteúdo e atividades." icon="chart-donut" palette={palette} />
            <View style={s.chartCenter}>
              <ConcentricRings
                outer={vm.taxaExploracao}
                mid={vm.taxaConteudo}
                inner={vm.taxaAtividade}
                accent={accent}
                palette={palette}
              />
            </View>
          </SurfaceCard>
          {vm.hasSessionMetrics && (
            <SurfaceCard palette={palette}>
              <SectionTitle title="Tempo investido por tipo" subtitle="Distribuição do tempo ativo nesta sessão." icon="clock-check-outline" palette={palette} />
              <View style={s.chartWrap}>
                <TimeDistributionBars tempoTopico={vm.tempoTopico} tempoConteudo={vm.tempoConteudo} tempoAtividade={vm.tempoAtividade} accent={accent} palette={palette} />
              </View>
              {vm.materialFocadoTipo ? (
                <Text style={[s.storyBody, { color: palette.muted }]}>
                  Material mais acessado nesta sessão: {vm.materialFocadoTipo}.
                </Text>
              ) : null}
            </SurfaceCard>
          )}
          <SurfaceCard palette={palette}>
            <SectionTitle title="Próximo marco" subtitle="Uma meta por vez, com clareza do que falta." icon="flag-outline" palette={palette} />
            <Text style={[s.storyHeadline, { color: palette.text }]}>{vm.proximoMarco}</Text>
            <View style={s.tripleRow}>
              <View style={[s.kpiPill, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}>
                <Text style={[s.kpiLabel, { color: palette.muted }]}>Exploração</Text>
                <Text style={[s.kpiValue, { color: palette.text }]}>{formatPercent(vm.taxaExploracao)}</Text>
              </View>
              <View style={[s.kpiPill, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}>
                <Text style={[s.kpiLabel, { color: palette.muted }]}>Conteúdo</Text>
                <Text style={[s.kpiValue, { color: palette.text }]}>{formatPercent(vm.taxaConteudo)}</Text>
              </View>
              <View style={[s.kpiPill, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}>
                <Text style={[s.kpiLabel, { color: palette.muted }]}>Atividades</Text>
                <Text style={[s.kpiValue, { color: palette.text }]}>{formatPercent(vm.taxaAtividade)}</Text>
              </View>
            </View>
          </SurfaceCard>
          <AffinityBoard vm={vm} palette={palette} accent={accent} />
        </>
      )}
    </View>
  );
}

function MysteryDashboard({ vm, palette, accent, themeBadge }: DashboardProps) {
  return (
    <View style={s.dashboard}>
      <LinearGradient colors={[palette.heroTop, palette.heroBottom]} style={[s.heroCard, { borderColor: palette.border }]}>
        <DashboardThemeBadge palette={palette} accent={accent} badge={themeBadge} />
        <Text style={[s.heroEyebrow, { color: palette.muted }]}>DOSSIÊ DE EXPLORAÇÃO</Text>
        <Text style={[s.heroTitle, { color: palette.text }]}>Cada métrica vira uma pista da jornada</Text>
        <Text style={[s.heroSubtitle, { color: palette.muted }]}>
          {vm.materiaNome
            ? `Classe atual: ${vm.materiaNome}. O painel mostra o quanto do território acadêmico você já descobriu.`
            : "O painel mostra o quanto do território acadêmico você já descobriu e o que ainda está oculto."}
        </Text>
        <View style={s.statGrid}>
          <StatTile icon="compass-outline" label="Mapa revelado" value={formatPercent(vm.taxaExploracao)} helper={`${vm.topicosDescobertos}/${vm.totalTopicos} tópicos vistos`} palette={palette} accent={accent} />
          <StatTile icon="book-open-page-variant-outline" label="Arquivos lidos" value={String(vm.conteudosConcluidos)} helper={`${vm.totalConteudos} no total`} palette={palette} accent={accent} />
          <StatTile icon="help-circle-outline" label="Desafios resolvidos" value={String(vm.atividadesConcluidas)} helper={`${vm.totalAtividades} registrados`} palette={palette} accent={accent} />
          <StatTile icon="star-circle-outline" label="Relíquias" value={String(vm.totalConquistas)} helper="marcos colecionados" palette={palette} accent={accent} />
        </View>
      </LinearGradient>

      {!vm.hasAnyData ? (
        <EmptyState
          palette={palette}
          accent={accent}
          icon="map-search-outline"
          title="Nenhuma pista encontrada"
          description="Quando você começar a navegar pela trilha, este painel vira um mapa do que já foi descoberto."
        />
      ) : (
        <>
          <TempoEstudoSection vm={vm} palette={palette} accent={accent} />
          <BossSection vm={vm} palette={palette} accent={accent} />
          <MelhorTempoSection vm={vm} palette={palette} accent={accent} />
          <SurfaceCard palette={palette}>
            <SectionTitle title="Mapa da trilha" subtitle="O quanto do percurso já foi desvendado." icon="map" palette={palette} />
            <ProgressLine label="Tópicos descobertos" current={vm.topicosDescobertos} total={vm.totalTopicos} accent={accent} palette={palette} />
            <ProgressLine label="Conteúdos revelados" current={vm.conteudosConcluidos} total={vm.totalConteudos} accent={accent} palette={palette} />
            <ProgressLine label="Desafios superados" current={vm.atividadesConcluidas} total={vm.totalAtividades} accent={accent} palette={palette} />
          </SurfaceCard>
          <SurfaceCard palette={palette}>
            <SectionTitle title="Mapa de descoberta" subtitle="Setores do território acadêmico revelados." icon="compass-outline" palette={palette} />
            <View style={s.chartCenter}>
              <DiscoveryRadial
                total={vm.totalTopicos}
                discovered={vm.topicosDescobertos}
                accent={accent}
                palette={palette}
              />
            </View>
          </SurfaceCard>
          {vm.hasSessionMetrics && (
            <SurfaceCard palette={palette}>
              <SectionTitle title="Rastros da exploração" subtitle="Intensidade e profundidade da última sessão." icon="foot-print" palette={palette} />
              <View style={s.tripleRow}>
                <KpiPill label="Tópicos visitados" value={String(vm.topicosVisitados)} palette={palette} />
                <KpiPill label="Profundidade" value={`${Math.round(vm.scrollTotal / 100)}m`} palette={palette} />
                <KpiPill label="Ativo" value={formatSeconds(vm.sessionActiveSec)} palette={palette} />
              </View>
              {vm.materialFocadoTipo ? (
                <Text style={[s.storyBody, { color: palette.muted }]}>
                  Artefato dominante: {vm.materialFocadoTipo}.
                </Text>
              ) : null}
            </SurfaceCard>
          )}
          <SurfaceCard palette={palette}>
            <SectionTitle title="Próxima pista" subtitle="Sugestão de exploração para manter a curiosidade ativa." icon="telescope" palette={palette} />
            <Text style={[s.storyHeadline, { color: palette.text }]}>{vm.proximoMarco}</Text>
            <Text style={[s.storyBody, { color: palette.muted }]}>
              Seu último rastro apareceu em {formatLastEvent(vm.ultimoEvento)}. Há {vm.pendentes} tópicos ainda esperando descoberta.
            </Text>
          </SurfaceCard>
          <AnalysisPanel vm={vm} palette={palette} accent={accent} />
        </>
      )}
    </View>
  );
}

function AnalyticsDashboard({ vm, palette, accent, themeBadge }: DashboardProps) {
  return (
    <View style={s.dashboard}>
      <LinearGradient colors={[palette.heroTop, palette.heroBottom]} style={[s.heroCard, { borderColor: palette.border }]}>
        <DashboardThemeBadge palette={palette} accent={accent} badge={themeBadge} />
        <Text style={[s.heroEyebrow, { color: palette.muted }]}>PAINEL ANALÍTICO</Text>
        <Text style={[s.heroTitle, { color: palette.text }]}>Sua evolução em leitura operacional</Text>
        <Text style={[s.heroSubtitle, { color: palette.muted }]}>
          {vm.materiaNome
            ? `Classe atual: ${vm.materiaNome}. Este modo organiza tudo com foco em clareza e comparação.`
            : "Este modo organiza tudo com foco em clareza, leitura rápida e acompanhamento consistente."}
        </Text>
        <View style={s.statGrid}>
          <StatTile icon="chart-donut" label="Progresso" value={formatPercent(vm.progresso)} helper={`${vm.concluidos}/${vm.totalTopicos} tópicos`} palette={palette} accent={accent} />
          <StatTile icon="target" label="Acertos" value={formatPercent(vm.acertos)} helper="média da turma atual" palette={palette} accent={accent} />
          <StatTile icon="clock-outline" label="Tempo de estudo" value={formatMinutes(vm.tempo)} helper={`${formatMinutes(vm.tempoMedio)} por atividade`} palette={palette} accent={accent} />
          <StatTile icon="trophy-outline" label="Conquistas" value={String(vm.totalConquistas)} helper={vm.melhorPosicao?.posicao != null ? `melhor posição #${vm.melhorPosicao.posicao}` : "sem posição em ranking"} palette={palette} accent={accent} />
        </View>
      </LinearGradient>

      {!vm.hasAnyData ? (
        <EmptyState
          palette={palette}
          accent={accent}
          icon="chart-box-outline"
          title="Sem dados suficientes"
          description="As métricas aparecerão aqui conforme você avançar nos conteúdos, atividades e leituras adaptativas."
        />
      ) : (
        <>
          <TempoEstudoSection vm={vm} palette={palette} accent={accent} />
          <BossSection vm={vm} palette={palette} accent={accent} />
          <MelhorTempoSection vm={vm} palette={palette} accent={accent} />
          <SurfaceCard palette={palette}>
            <SectionTitle title="Jornada da classe" subtitle="Distribuição atual do seu avanço na trilha." icon="chart-box-outline" palette={palette} />
            <View style={s.chartWrap}>
              <TopicBarChart
                concluidos={vm.concluidos}
                emAndamento={vm.emAndamento}
                pendentes={vm.pendentes}
                total={vm.totalTopicos}
                accent={accent}
                palette={palette}
              />
            </View>
            <ProgressLine label="Conteúdos" current={vm.conteudosConcluidos} total={vm.totalConteudos} accent={accent} palette={palette} />
            <ProgressLine label="Atividades" current={vm.atividadesConcluidas} total={vm.totalAtividades} accent={accent} palette={palette} />
          </SurfaceCard>
          <SurfaceCard palette={palette}>
            <SectionTitle title="Radar de afinidades" subtitle="Perfil BrainHex em visão de teia comparativa." icon="spider-web" palette={palette} />
            {vm.afinidades.length >= 3 ? (
              <View style={s.chartCenter}>
                <RadarChart
                  axes={vm.afinidades.map((a) => ({ label: a.nome, value: a.afinidade }))}
                  accent={accent}
                  palette={palette}
                  glowStyle="plain"
                />
              </View>
            ) : vm.afinidades.length === 0 ? (
              <Text style={[s.emptyText, { color: palette.muted }]}>Ainda não há perfis associados ao usuário.</Text>
            ) : (
              vm.afinidades.map((item) => (
                <ProgressLine
                  key={item.id}
                  label={item.nome}
                  current={Math.round(item.afinidade)}
                  total={100}
                  accent={accent}
                  palette={palette}
                />
              ))
            )}
          </SurfaceCard>
          <SurfaceCard palette={palette}>
            <SectionTitle title="Engajamento recente" subtitle="Recorte dos últimos registros do aluno." icon="pulse" palette={palette} />
            <View style={s.doubleRow}>
              <View style={[s.metricPanel, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}>
                <Text style={[s.kpiLabel, { color: palette.muted }]}>Dias ativos</Text>
                <Text style={[s.kpiValue, { color: palette.text }]}>{vm.diasAtivos}</Text>
              </View>
              <View style={[s.metricPanel, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}>
                <Text style={[s.kpiLabel, { color: palette.muted }]}>Últimos 7 dias</Text>
                <Text style={[s.kpiValue, { color: palette.text }]}>{vm.eventosRecentes}</Text>
              </View>
            </View>
            <Text style={[s.sectionSubtitle, { color: palette.muted }]}>Último registro: {formatLastEvent(vm.ultimoEvento)}</Text>
          </SurfaceCard>
          {vm.hasSessionMetrics && (
            <SurfaceCard palette={palette}>
              <SectionTitle title="Análise da sessão" subtitle="Distribuição de tempo ativo por entidade de estudo." icon="chart-timeline-variant" palette={palette} />
              <EngagementBar activeSec={vm.sessionActiveSec} idleSec={vm.sessionIdleSec} accent={accent} palette={palette} />
              <View style={[s.chartWrap, { marginTop: 14 }]}>
                <TimeDistributionBars tempoTopico={vm.tempoTopico} tempoConteudo={vm.tempoConteudo} tempoAtividade={vm.tempoAtividade} accent={accent} palette={palette} />
              </View>
              <View style={s.doubleRow}>
                <View style={[s.metricPanel, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}>
                  <Text style={[s.kpiLabel, { color: palette.muted }]}>Interações</Text>
                  <Text style={[s.kpiValue, { color: palette.text }]}>{vm.touchTotal}</Text>
                </View>
                <View style={[s.metricPanel, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}>
                  <Text style={[s.kpiLabel, { color: palette.muted }]}>Engajamento</Text>
                  <Text style={[s.kpiValue, { color: palette.text }]}>{Math.round(vm.sessionEngajamento)}%</Text>
                </View>
              </View>
            </SurfaceCard>
          )}
          <AnalysisPanel vm={vm} palette={palette} accent={accent} />
        </>
      )}
    </View>
  );
}

function SquadDashboard({ vm, palette, accent, themeBadge }: DashboardProps) {
  return (
    <View style={s.dashboard}>
      <LinearGradient colors={[palette.heroTop, palette.heroBottom]} style={[s.heroCard, { borderColor: palette.border }]}>
        <DashboardThemeBadge palette={palette} accent={accent} badge={themeBadge} />
        <Text style={[s.heroEyebrow, { color: palette.muted }]}>SALA DO SQUAD</Text>
        <Text style={[s.heroTitle, { color: palette.text }]}>Seu ritmo visto como presença e energia</Text>
        <Text style={[s.heroSubtitle, { color: palette.muted }]}>
          {vm.materiaNome
            ? `Classe atual: ${vm.materiaNome}. O foco é mostrar como você aparece, participa e cresce ao longo da trilha.`
            : "O foco é mostrar como você aparece, participa e cresce ao longo da trilha."}
        </Text>
        <View style={s.statGrid}>
          <StatTile icon="account-group-outline" label="Presença" value={`${vm.diasAtivos} dias`} helper={vm.presencaResumo} palette={palette} accent={accent} />
          <StatTile icon="podium" label="Ranking" value={vm.melhorPosicao?.posicao ? `#${vm.melhorPosicao.posicao}` : "Sem posição"} helper="melhor colocação" palette={palette} accent={accent} />
          <StatTile icon="trophy-outline" label="Conquistas" value={String(vm.totalConquistas)} helper="emblemas e marcos" palette={palette} accent={accent} />
          <StatTile icon="pulse" label="Movimento" value={String(vm.eventosRecentes)} helper="ações recentes" palette={palette} accent={accent} />
        </View>
      </LinearGradient>

      {!vm.hasAnyData ? (
        <EmptyState
          palette={palette}
          accent={accent}
          icon="account-group-outline"
          title="Squad ainda silencioso"
          description="Assim que você começar a estudar, este painel mostra presença, ritmo e sinais de evolução."
        />
      ) : (
        <>
          <TempoEstudoSection vm={vm} palette={palette} accent={accent} />
          <BossSection vm={vm} palette={palette} accent={accent} />
          <MelhorTempoSection vm={vm} palette={palette} accent={accent} />
          <SurfaceCard palette={palette}>
            <SectionTitle title="Energia do grupo" subtitle="Indicadores que valorizam presença e constância." icon="star-circle-outline" palette={palette} />
            <View style={s.tripleRow}>
              <View style={[s.kpiPill, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}><Text style={[s.kpiLabel, { color: palette.muted }]}>Progresso</Text><Text style={[s.kpiValue, { color: palette.text }]}>{formatPercent(vm.progresso)}</Text></View>
              <View style={[s.kpiPill, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}><Text style={[s.kpiLabel, { color: palette.muted }]}>Acertos</Text><Text style={[s.kpiValue, { color: palette.text }]}>{formatPercent(vm.acertos)}</Text></View>
              <View style={[s.kpiPill, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}><Text style={[s.kpiLabel, { color: palette.muted }]}>Tempo</Text><Text style={[s.kpiValue, { color: palette.text }]}>{formatMinutes(vm.tempo)}</Text></View>
            </View>
            <Text style={[s.storyBody, { color: palette.muted }]}>
              Último pulso registrado em {formatLastEvent(vm.ultimoEvento)}. O painel valoriza continuidade e visibilidade dentro da turma.
            </Text>
          </SurfaceCard>
          <SurfaceCard palette={palette}>
            <SectionTitle title="Presença na semana" subtitle="Dias com atividade nos últimos 7 dias." icon="calendar-week" palette={palette} />
            <View style={s.chartCenter}>
              <PresenceGrid data={vm.semanaDiaria} accent={accent} palette={palette} />
            </View>
          </SurfaceCard>
          {vm.hasSessionMetrics && (
            <SurfaceCard palette={palette}>
              <SectionTitle title="Energia da sessão" subtitle="Qualidade do tempo de presença mais recente." icon="lightning-bolt-circle" palette={palette} />
              <EngagementBar activeSec={vm.sessionActiveSec} idleSec={vm.sessionIdleSec} accent={accent} palette={palette} />
              <View style={s.tripleRow}>
                <KpiPill label="Tempo ativo" value={formatSeconds(vm.sessionActiveSec)} palette={palette} />
                <KpiPill label="Interações" value={String(vm.touchTotal)} palette={palette} />
                <KpiPill label="Engajamento" value={`${Math.round(vm.sessionEngajamento)}%`} palette={palette} />
              </View>
            </SurfaceCard>
          )}
          <SurfaceCard palette={palette}>
            <SectionTitle title="Seu lugar no momento" subtitle="Resumo social e competitivo da jornada." icon="podium" palette={palette} />
            <Text style={[s.storyHeadline, { color: palette.text }]}>
              {vm.melhorPosicao?.posicao ? `Você já alcançou a posição #${vm.melhorPosicao.posicao} no ranking.` : "Ainda não há posição registrada no ranking da classe."}
            </Text>
            <Text style={[s.storyBody, { color: palette.muted }]}>
              {vm.totalConquistas > 0 ? `Com ${vm.totalConquistas} conquistas, sua presença já aparece no histórico da turma.` : "Assim que os primeiros marcos forem desbloqueados, eles aparecerão como sinais do seu impacto."}
            </Text>
          </SurfaceCard>
          <AnalysisPanel vm={vm} palette={palette} accent={accent} />
        </>
      )}
    </View>
  );
}

export function ProfileMetricsViews({
  profile,
  theme,
  vm,
}: {
  profile: BrainHexProfile;
  theme: MetricsThemeResolved;
  vm: ProfileMetricsViewModel;
}) {
  const hexConfig = getBrainHexConfig(profile);
  const accent = tinycolor(hexConfig.color).lighten(theme === "analytics" ? 6 : 2).toString();
  const palette = useMemo(() => buildPalette(theme, hexConfig.color), [theme, hexConfig.color]);
  const themeOption = getMetricsThemeOption(theme);

  return (
    <View style={s.wrapper}>
      {theme === "arena" ? (
        <ArenaDashboard
          profile={profile}
          theme={theme}
          vm={vm}
          palette={palette}
          accent={accent}
          themeBadge={{ label: themeOption.label, icon: themeOption.icon }}
        />
      ) : theme === "goals" ? (
        <GoalsDashboard
          profile={profile}
          theme={theme}
          vm={vm}
          palette={palette}
          accent={accent}
          themeBadge={{ label: themeOption.label, icon: themeOption.icon }}
        />
      ) : theme === "mystery" ? (
        <MysteryDashboard
          profile={profile}
          theme={theme}
          vm={vm}
          palette={palette}
          accent={accent}
          themeBadge={{ label: themeOption.label, icon: themeOption.icon }}
        />
      ) : theme === "squad" ? (
        <SquadDashboard
          profile={profile}
          theme={theme}
          vm={vm}
          palette={palette}
          accent={accent}
          themeBadge={{ label: themeOption.label, icon: themeOption.icon }}
        />
      ) : (
        <AnalyticsDashboard
          profile={profile}
          theme={theme}
          vm={vm}
          palette={palette}
          accent={accent}
          themeBadge={{ label: themeOption.label, icon: themeOption.icon }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: { gap: 12 },
  dashboard: { gap: 14 },
  modeChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modeChipText: { fontFamily: FontFamily.interMedium, fontSize: 12 },
  modeChipInline: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  heroCard: { borderRadius: 24, padding: 18, borderWidth: 1, overflow: "hidden" },
  heroEyebrow: { fontFamily: FontFamily.interMedium, fontSize: 11, letterSpacing: 1.1, marginBottom: 8 },
  heroTitle: { fontFamily: FontFamily.inikaBold, fontSize: 22, marginBottom: 6 },
  heroSubtitle: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 20, marginBottom: 14 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  statTile: { width: "48.3%", borderRadius: 18, padding: 14, marginBottom: 10, borderWidth: 1 },
  statIconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  statLabel: { fontFamily: FontFamily.interMedium, fontSize: 12, marginBottom: 4 },
  statValue: { fontFamily: FontFamily.inikaBold, fontSize: 20, marginBottom: 4 },
  statHelper: { fontFamily: FontFamily.interMedium, fontSize: 11, lineHeight: 16 },
  surfaceCard: { borderRadius: 22, padding: 18, borderWidth: 1 },
  sectionTitleWrap: { marginBottom: 14 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  sectionIconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 10 },
  sectionTitle: { fontFamily: FontFamily.inikaBold, fontSize: 16 },
  sectionSubtitle: { fontFamily: FontFamily.interMedium, fontSize: 12, lineHeight: 18 },
  tripleRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  doubleRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  kpiPill: { flex: 1, borderRadius: 16, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 10 },
  metricPanel: { flex: 1, borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 14 },
  kpiLabel: { fontFamily: FontFamily.interMedium, fontSize: 11, marginBottom: 4 },
  kpiValue: { fontFamily: FontFamily.inikaBold, fontSize: 18 },
  progressLine: { marginBottom: 14 },
  progressLineHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  progressLineLabel: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  progressLineValue: { fontFamily: FontFamily.interMedium, fontSize: 12 },
  progressTrack: { height: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10 },
  chip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginRight: 8, marginBottom: 8 },
  chipText: { marginLeft: 8, fontFamily: FontFamily.interMedium, fontSize: 12 },
  actionsWrap: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },
  actionPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, marginRight: 8, marginBottom: 8 },
  actionText: { fontFamily: FontFamily.interMedium, fontSize: 11 },
  analysisStack: { gap: 10, marginTop: 6 },
  analysisBox: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12 },
  analysisBoxTitle: { fontFamily: FontFamily.inikaBold, fontSize: 13, marginBottom: 6 },
  analysisBoxItem: { fontFamily: FontFamily.interMedium, fontSize: 12, lineHeight: 18, marginBottom: 4 },
  emptyIconWrap: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emptyTitle: { fontFamily: FontFamily.inikaBold, fontSize: 17, marginBottom: 8 },
  emptyText: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 20 },
  chartCenter: { alignItems: "center", paddingVertical: 8 },
  chartWrap: { marginTop: 4, marginBottom: 12 },
  storyHeadline: { fontFamily: FontFamily.inikaBold, fontSize: 17, lineHeight: 24, marginBottom: 8 },
  storyBody: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 20 },
  checkRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, paddingVertical: 10 },
  checkIconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", marginRight: 12 },
  checkTextWrap: { flex: 1 },
  checkTitle: { fontFamily: FontFamily.inikaBold, fontSize: 14, marginBottom: 2 },
  checkHelper: { fontFamily: FontFamily.interMedium, fontSize: 12 },
  statRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
});
