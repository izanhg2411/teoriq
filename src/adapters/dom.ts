// Utilidades de DOM compartidas por los adaptadores.

/**
 * ¿Es realmente visible el elemento? Encontrarlo en el HTML no basta (AngularJS usa `ng-hide`).
 * Recorre el elemento y todos sus ancestros: clase ng-hide/hidden, atributo hidden y estilos calculados.
 */
export function isReallyVisible(el: Element): boolean {
  const win = el.ownerDocument.defaultView;
  if (!win) return false;
  if (!el.isConnected) return false;
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (n.classList.contains('ng-hide') || n.classList.contains('hidden')) return false;
    if (n.hasAttribute('hidden')) return false;
    const cs = win.getComputedStyle(n);
    if (cs.display === 'none') return false;
    if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
    if (cs.opacity !== '' && parseFloat(cs.opacity) === 0) return false;
  }
  return true;
}
