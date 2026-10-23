// Peças falsas do aparelho (mobile-v1): barra de status, indicador de início e teclado.
// Cada tela só precisa de <div class="aparelho"><div class="tela">…</div></div>.
(function () {
  const aparelho = document.querySelector('.aparelho');
  if (!aparelho) return;
  aparelho.insertAdjacentHTML('afterbegin', `<div class="status" aria-hidden="true"><span>9:41</span><span class="ilha"></span>
    <span class="icones"><svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
    <svg viewBox="0 0 16 12"><path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.3-1.4A10.4 10.4 0 0 0 8 .3 10.4 10.4 0 0 0 .7 3.2L2 4.6a8.5 8.5 0 0 1 6-2.4zm0 3.8c1.3 0 2.5.5 3.4 1.3l1.3-1.4A6.7 6.7 0 0 0 8 4.1a6.7 6.7 0 0 0-4.7 1.8l1.3 1.4C5.5 6.5 6.7 6 8 6zm0 3.7c.5 0 1 .2 1.3.5L8 11.6 6.7 10.2c.3-.3.8-.5 1.3-.5z"/></svg>
    <svg viewBox="0 0 27 12"><rect x=".5" y=".5" width="23" height="11" rx="3" fill="none" stroke="#fff" stroke-opacity=".5"/><rect x="2" y="2" width="18" height="8" rx="1.6"/><rect x="24.6" y="4" width="1.6" height="4" rx=".8" fill-opacity=".5"/></svg></span></div>`);
  aparelho.insertAdjacentHTML('beforeend', '<div class="home" aria-hidden="true"></div>');

  const LINHAS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  window.teclado = function (aberto) {
    let el = aparelho.querySelector('.teclado');
    if (!aberto) { el?.remove(); return; }
    if (el) return;
    const tecla = (t) => `<span>${t}</span>`;
    aparelho.insertAdjacentHTML('beforeend', `<div class="teclado" aria-hidden="true">
      <div class="linha">${[...LINHAS[0]].map(tecla).join('')}</div>
      <div class="linha">${[...LINHAS[1]].map(tecla).join('')}</div>
      <div class="linha"><span class="larga">⇧</span>${[...LINHAS[2]].map(tecla).join('')}<span class="larga">⌫</span></div>
      <div class="linha"><span class="larga">123</span><span class="larga">@</span><span class="espaco">espaço</span><span class="larga">.</span><span class="enviar">ir</span></div></div>`);
  };
})();
