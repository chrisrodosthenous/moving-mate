/**
 * Replace theme custom properties in global.css.
 * Only the first declaration of each variable is updated, and an existing
 * hex comment on that line is kept in sync.
 */

const VAR_NAME = /^--[a-z0-9-]+$/i;
const HEX = /^#[0-9A-Fa-f]{6}$/;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readUpdate(raw) {
  if (typeof raw === 'string') {
    return { hsl: raw.trim(), hex: '' };
  }
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  return {
    hsl: String(raw.hsl || '').trim(),
    hex: String(raw.hex || '').trim(),
  };
}

const SCOPE_SELECTORS = {
  marketing: '[data-design-scope="marketing"]',
  auth: '[data-design-scope="auth"]',
  customer: '[data-design-scope="customer"]',
  driver: '[data-design-scope="driver"]',
  admin: '[data-design-scope="admin"]',
};

function splitCss(css) {
  const text = String(css || '');
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  return { newline, lines: text.split(/\r?\n/) };
}

function findBraceBlock(lines, isStart) {
  let open = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (!isStart(lines[i])) continue;
    for (let j = i; j < lines.length; j += 1) {
      if (lines[j].includes('{')) {
        open = j;
        break;
      }
    }
    break;
  }
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < lines.length; i += 1) {
    depth += (lines[i].match(/\{/g) || []).length;
    depth -= (lines[i].match(/\}/g) || []).length;
    if (depth === 0) return { start: open, end: i };
  }
  return null;
}

function replaceDeclaration(line, varName, update) {
  const re = new RegExp(`^(\\s*${escapeRegex(varName)}:\\s*)([^;]+)(;.*)$`);
  const match = line.match(re);
  if (!match) return null;
  let tail = match[3];
  if (HEX.test(update.hex) && tail.includes('/*')) {
    tail = tail.replace(/\/\*[\s\S]*?\*\//, `/* ${update.hex} */`);
  }
  return `${match[1]}${update.hsl}${tail}`;
}

function declarationLine(varName, update) {
  const comment = HEX.test(update.hex) ? ` /* ${update.hex} */` : '';
  return `  ${varName}: ${update.hsl};${comment}`;
}

function validUpdates(variables) {
  const updates = [];
  for (const [varName, raw] of Object.entries(variables || {})) {
    if (!VAR_NAME.test(varName)) continue;
    const update = readUpdate(raw);
    if (!update || !update.hsl || /[;{}<>]/.test(update.hsl)) continue;
    updates.push([varName, update]);
  }
  return updates;
}

function applyInRange(lines, updates, range) {
  const updated = [];
  const pending = new Map(updates);
  for (let i = range.start; i <= range.end && pending.size; i += 1) {
    for (const [varName, update] of pending) {
      const next = replaceDeclaration(lines[i], varName, update);
      if (!next) continue;
      lines[i] = next;
      pending.delete(varName);
      updated.push(varName);
      break;
    }
  }
  return { updated, pending };
}

/**
 * @param {string} css
 * @param {Record<string, string | { hsl?: string, hex?: string }>} variables
 * @param {'global' | 'marketing' | 'auth' | 'customer' | 'driver' | 'admin'} [scope]
 */
function applyThemeVariables(css, variables, scope) {
  const { newline, lines } = splitCss(css);
  const updates = validUpdates(variables);
  const selector = SCOPE_SELECTORS[scope];

  if (!selector) {
    const root = findBraceBlock(lines, (line) => /^\s*:root\b/.test(line));
    const range = root || { start: 0, end: lines.length - 1 };
    const { updated } = applyInRange(lines, updates, range);
    return { css: lines.join(newline), updated };
  }

  let block = findBraceBlock(lines, (line) => line.includes(selector));
  if (!block) {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    const start = lines.length;
    lines.push(`${selector} {`);
    updates.forEach(([varName, update]) => lines.push(declarationLine(varName, update)));
    lines.push('}');
    return { css: lines.join(newline), updated: updates.map(([varName]) => varName) };
  }

  const { updated, pending } = applyInRange(lines, updates, block);
  if (pending.size) {
    const extra = [...pending.entries()].map(([varName, update]) => declarationLine(varName, update));
    lines.splice(block.end, 0, ...extra);
    pending.forEach((_update, varName) => updated.push(varName));
  }

  return { css: lines.join(newline), updated };
}

module.exports = {
  applyThemeVariables,
};
