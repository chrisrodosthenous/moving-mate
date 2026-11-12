'use strict';

const fs = require('fs');
const path = require('path');

function resolvePattern(pattern, options) {
  const cwd = options && options.cwd;
  if (!cwd || cwd === '/' || path.isAbsolute(pattern)) return pattern;
  return path.join(cwd, pattern);
}

function toRegExp(segment) {
  const escaped = segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function expandBraces(pattern) {
  const match = String(pattern).match(/\{([^{}]+)\}/);
  if (!match) return [pattern];
  const expanded = [];
  for (const option of match[1].split(',')) {
    expanded.push(...expandBraces(pattern.replace(match[0], option)));
  }
  return expanded;
}

function listFiles(pattern, options) {
  if (String(pattern).includes('{')) {
    return [...new Set(expandBraces(pattern).flatMap((item) => listFiles(item, options)))];
  }
  const full = resolvePattern(pattern, options);
  if (!/[*?[{]/.test(full.replace(/\\/g, '/'))) {
    try {
      return fs.statSync(full).isFile() ? [toKarmaPath(full)] : [];
    } catch {
      return [];
    }
  }

  if (full.includes('**')) {
    const root = path.dirname(full.split('**')[0]);
    const suffix = full.slice(full.indexOf('**') + 2).replace(/^[/\\]/, '');
    const suffixRe = toRegExp(suffix.split(/[/\\]/).join('/'));
    const found = [];
    walk(root, (file) => {
      const rel = path.relative(root, file).split(path.sep).join('/');
      return suffixRe.test(rel) || toRegExp(suffix).test(path.basename(file));
    }, found);
    return found;
  }

  const dir = path.dirname(full);
  const base = toRegExp(path.basename(full));
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && base.test(entry.name))
    .map((entry) => toKarmaPath(path.join(dir, entry.name)));
}

function walk(dir, matcher, found) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, matcher, found);
    else if (entry.isFile() && matcher(full)) found.push(toKarmaPath(full));
  }
}

function toKarmaPath(file) {
  return path.resolve(file).split(path.sep).join('/');
}

function glob(pattern, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  try {
    const files = listFiles(pattern, options);
    process.nextTick(() => callback(null, files));
  } catch (err) {
    process.nextTick(() => callback(err));
  }
}

glob.hasMagic = function hasMagic(pattern) {
  return /[*?[{]/.test(String(pattern));
};

glob.sync = function sync(pattern, options) {
  return listFiles(pattern, options);
};

glob.Glob = class Glob {
  constructor(pattern, options) {
    this.found = listFiles(pattern, options);
    this.statCache = {};
    for (const file of this.found) {
      try {
        this.statCache[file] = fs.statSync(file);
      } catch {
        this.statCache[file] = { mtime: new Date(0) };
      }
    }
  }
};

module.exports = glob;
