import { Color } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseInline(markdown: string) {
  let html = escapeHtml(markdown);

  html = html.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img alt="$1" src="$2" />'
  );
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");

  return html;
}

function wrapHtmlDocument(body: string, palette?: ProfileShellPalette | null) {
  const effective = palette ?? null;
  const textPrimary = effective?.text ?? Color.colorAliceblue;
  const textMuted = effective?.textMuted ?? Color.colorAliceblue300;
  const accent = effective?.accent ?? "#9cb4ff";
  const accentSoft = effective?.accentMuted ?? "rgba(151, 71, 255, 0.08)";
  const border = effective?.border ?? Color.colorDarkslategray100;
  const borderStrong = effective?.borderStrong ?? Color.colorBlueviolet100;

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1"
    />
    <style>
      :root {
        color-scheme: dark;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
        background: transparent;
        color: ${textMuted};
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        padding: 0;
        line-height: 1.6;
        font-size: 15px;
      }

      h1, h2, h3, h4, h5, h6 {
        color: ${textPrimary};
        margin: 1.2em 0 0.55em;
        line-height: 1.25;
      }

      h1 { font-size: 1.75rem; }
      h2 { font-size: 1.5rem; }
      h3 { font-size: 1.25rem; }
      h4 { font-size: 1.1rem; }
      h5, h6 { font-size: 1rem; }

      p, li, blockquote {
        font-size: 0.98rem;
      }

      p {
        margin: 0 0 0.9rem;
      }

      ul, ol {
        margin: 0 0 1rem;
        padding-left: 1.4rem;
      }

      blockquote {
        margin: 0 0 1rem;
        padding: 0.1rem 0 0.1rem 0.9rem;
        border-left: 3px solid ${borderStrong};
        color: ${textPrimary};
        background: transparent;
        border-radius: 0;
      }

      pre {
        margin: 0 0 1rem;
        padding: 12px;
        border-radius: 10px;
        overflow-x: auto;
        background: ${accentSoft};
        border: 1px solid ${border};
      }

      code {
        font-family: "Fira Code", Consolas, monospace;
      }

      p code, li code {
        padding: 0.15rem 0.35rem;
        border-radius: 6px;
        background: ${accentSoft};
        color: ${textPrimary};
      }

      a {
        color: ${accent};
      }

      img {
        display: block;
        width: 100%;
        max-width: 100%;
        height: auto;
        margin: 1rem 0;
        border-radius: 14px;
      }

      hr {
        border: 0;
        border-top: 1px solid ${border};
        margin: 1.2rem 0;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 1rem;
      }

      th, td {
        border: 1px solid ${border};
        padding: 0.65rem 0.75rem;
        text-align: left;
      }

      th {
        color: ${textPrimary};
        background: ${accentSoft};
      }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

export function markdownToHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  const html: string[] = [];
  let paragraph: string[] = [];
  let codeLines: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let inCode = false;
  let inTable = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${parseInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };

  const flushCode = () => {
    if (!codeLines.length) return;
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    codeLines = [];
  };

  const flushTable = () => {
    if (!inTable) return;
    html.push("</table>");
    inTable = false;
  };

  for (const rawLine of lines) {
    const line = rawLine ?? "";
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      flushTable();

      if (inCode) {
        flushCode();
      }

      inCode = !inCode;
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      flushTable();
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      flushList();
      flushTable();
      html.push("<hr />");
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushTable();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${parseInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      flushTable();
      html.push(`<blockquote>${parseInline(quoteMatch[1])}</blockquote>`);
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      flushTable();
      if (listType !== "ol") {
        flushList();
        listType = "ol";
        html.push("<ol>");
      }
      html.push(`<li>${parseInline(orderedMatch[2])}</li>`);
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      flushTable();
      if (listType !== "ul") {
        flushList();
        listType = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${parseInline(unorderedMatch[1])}</li>`);
      continue;
    }

    const tableMatch = trimmed.startsWith("|") && trimmed.endsWith("|");
    if (tableMatch) {
      flushParagraph();
      flushList();
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim());
      const isSeparator = cells.every((cell) => /^:?-{3,}:?$/.test(cell));

      if (!isSeparator) {
        const tag = inTable ? "td" : "th";
        if (!inTable) {
          html.push("<table>");
          inTable = true;
        }
        html.push(
          `<tr>${cells
            .map((cell) => `<${tag}>${parseInline(cell)}</${tag}>`)
            .join("")}</tr>`
        );
      }
      continue;
    }

    if (listType) {
      flushList();
    }

    flushTable();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushCode();
  flushTable();

  return html.join("");
}

export function buildMarkdownDocument(
  markdown: string,
  palette?: ProfileShellPalette | null
) {
  return wrapHtmlDocument(markdownToHtml(markdown), palette);
}

export function estimateMarkdownHeight(markdown: string) {
  const lines = markdown.split(/\r?\n/).length;
  return Math.min(760, Math.max(220, 160 + lines * 18));
}
