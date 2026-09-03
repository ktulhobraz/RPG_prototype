// @ts-check
/** Minimal DOM helpers. The UI builds elements directly; there is no framework and no template. */

/**
 * @param {string} tag       Tag name, optionally with .classes (e.g. "button.primary").
 * @param {object} [props]   Properties and attributes. `class`, `text`, `onClick` are special.
 * @param {(Node | string | null | false | undefined)[]} [children]
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, children = []) {
  const [name, ...classes] = tag.split('.');
  const node = document.createElement(name);
  if (classes.length) node.classList.add(...classes);

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.classList.add(...String(value).split(' ').filter(Boolean));
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'onClick') node.addEventListener('click', /** @type {any} */ (value));
    else if (key === 'disabled') node.toggleAttribute('disabled', Boolean(value));
    else if (key in node) /** @type {any} */ (node)[key] = value;
    else node.setAttribute(key, String(value));
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/** @param {HTMLElement} node @param {(Node | null | false | undefined)[]} children */
export function replace(node, children) {
  node.replaceChildren(...children.filter(Boolean).map((c) => /** @type {Node} */ (c)));
  return node;
}

/**
 * Wound state as a class name, shared by the board bars and the party cards so a hero looks
 * equally urgent in both places.
 * @param {number} current @param {number} max
 */
export function woundClass(current, max) {
  const ratio = max > 0 ? current / max : 0;
  if (ratio <= 0.34) return 'critical';
  if (ratio <= 0.67) return 'hurt';
  return '';
}
