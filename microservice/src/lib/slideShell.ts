import { BRAIN_HEX_CONFIG, type BrainHexProfile } from "../constants/brainHex";

function escapeForSrcdocAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Envolve o fragmento de HTML livre gerado pela IA num mini-documento
 * autocontido com CSP restritiva própria (bloqueia rede/armazenamento na
 * prática, não só por instrução de prompt) — é isto que vira o `srcdoc` do
 * iframe sandboxed daquele slide.
 */
function wrapSlideFragment(fragmentHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" />`
    + `<meta name="viewport" content="width=device-width, initial-scale=1" />`
    + `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; `
    + `style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:" />`
    + `</head><body style="margin:0">${fragmentHtml}</body></html>`;
}

/**
 * Monta o deck imersivo final: um documento externo (shell nosso, confiável,
 * não sandboxed) que navega por tap/swipe entre N iframes sandboxados — um
 * por slide, cada um com sua própria CSP restritiva. O conteúdo de cada
 * slide (HTML/CSS/JS livre gerado pela IA) nunca roda no contexto do
 * documento externo.
 */
export function buildImmersiveDeckHtml(
  slidesHtml: string[],
  profile: BrainHexProfile,
): string {
  if (slidesHtml.length === 0) {
    throw new Error("buildImmersiveDeckHtml requer pelo menos 1 slide");
  }
  const accent = BRAIN_HEX_CONFIG[profile].color;

  const frames = slidesHtml
    .map((fragment, index) => {
      const srcdoc = escapeForSrcdocAttribute(wrapSlideFragment(fragment));
      const activeClass = index === 0 ? " active" : "";
      return `<iframe class="slide-frame${activeClass}" data-index="${index}" `
        + `sandbox="allow-scripts" srcdoc="${srcdoc}"></iframe>`;
    })
    .join("\n");

  const dots = slidesHtml
    .map((_, index) => `<span class="dot${index === 0 ? " active" : ""}"></span>`)
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<style>
  :root { --accent: ${accent}; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; background: #05030a; overflow: hidden; }
  .deck { position: relative; width: 100%; height: 100%; }
  .slide-frame {
    position: absolute; inset: 0; width: 100%; height: 100%; border: 0;
    opacity: 0; pointer-events: none; transition: opacity .35s ease;
  }
  .slide-frame.active { opacity: 1; pointer-events: auto; }
  .nav-zone { position: absolute; top: 0; bottom: 0; width: 18%; z-index: 5; }
  .nav-zone.prev { left: 0; }
  .nav-zone.next { right: 0; }
  .dots {
    position: absolute; left: 0; right: 0; bottom: 10px; display: flex;
    justify-content: center; gap: 6px; z-index: 6; pointer-events: none;
  }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.25); }
  .dot.active { background: var(--accent); width: 18px; border-radius: 4px; }
</style>
</head>
<body>
  <div class="deck" id="deck">
${frames}
    <div class="nav-zone prev" data-dir="-1"></div>
    <div class="nav-zone next" data-dir="1"></div>
    <div class="dots">${dots}</div>
  </div>
  <script>
    (function () {
      var frames = Array.prototype.slice.call(document.querySelectorAll(".slide-frame"));
      var dots = Array.prototype.slice.call(document.querySelectorAll(".dot"));
      var current = 0;
      function show(index) {
        if (index < 0 || index >= frames.length) return;
        frames[current].classList.remove("active");
        dots[current].classList.remove("active");
        current = index;
        frames[current].classList.add("active");
        dots[current].classList.add("active");
      }
      Array.prototype.slice.call(document.querySelectorAll(".nav-zone")).forEach(function (zone) {
        zone.addEventListener("click", function () {
          show(current + Number(zone.getAttribute("data-dir")));
        });
      });
      var touchStartX = null;
      var deckEl = document.getElementById("deck");
      deckEl.addEventListener("touchstart", function (e) {
        touchStartX = e.changedTouches[0].clientX;
      }, { passive: true });
      deckEl.addEventListener("touchend", function (e) {
        if (touchStartX === null) return;
        var delta = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(delta) > 40) show(current + (delta < 0 ? 1 : -1));
        touchStartX = null;
      }, { passive: true });
    })();
  </script>
</body>
</html>`;
}
