const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { applyThemeVariables } = require('./themeCss');

const SAMPLE = `
:root,
.dark {
    --background: 0 0% 4%;                /* #090909 */
    --primary: 142 71% 45%;              /* #22C55E brand green */
}
`;

describe('applyThemeVariables', () => {
  it('updates one color and its hex comment, and leaves the rest of the file', () => {
    const { css, updated } = applyThemeVariables(SAMPLE, {
      '--primary': { hsl: '200 80% 50%', hex: '#1988E6' },
    });

    assert.deepEqual(updated, ['--primary']);
    assert.match(css, /--background: 0 0% 4%;\s+\/\* #090909 \*\//);
    assert.match(css, /--primary: 200 80% 50%;\s+\/\* #1988E6 \*\//);
  });

  it('updates a Windows line ending file without rewriting every line', () => {
    const css = SAMPLE.replace(/\n/g, '\r\n');
    const { css: next, updated } = applyThemeVariables(css, {
      '--background': { hsl: '10 20% 30%', hex: '#3D2E26' },
    });

    assert.deepEqual(updated, ['--background']);
    assert.equal(next.includes('\r\n'), true);
    assert.match(next, /--background: 10 20% 30%;\s+\/\* #3D2E26 \*\//);
    assert.match(next, /--primary: 142 71% 45%;/);
  });

  it('writes a customer-only color without changing the shared theme', () => {
    const { css, updated } = applyThemeVariables(SAMPLE, {
      '--background': { hsl: '215 55% 6%', hex: '#070E18' },
    }, 'customer');

    assert.deepEqual(updated, ['--background']);
    assert.match(css, /--background: 0 0% 4%;/);
    assert.match(css, /\[data-design-scope="customer"\] \{\s*--background: 215 55% 6%; \/\* #070E18 \*\//);
  });

  it('updates the shared theme and leaves a side override alone', () => {
    const scoped = `${SAMPLE}\n[data-design-scope="customer"] {\n  --primary: 210 40% 40%; /* #3D6F8F */\n}\n`;
    const { css, updated } = applyThemeVariables(scoped, {
      '--primary': { hsl: '200 80% 50%', hex: '#1988E6' },
    }, 'global');

    assert.deepEqual(updated, ['--primary']);
    assert.match(css, /:root,\s*\.dark \{\s*--background: 0 0% 4%;[\s\S]*--primary: 200 80% 50%;/);
    assert.match(css, /\[data-design-scope="customer"\] \{\s*--primary: 210 40% 40%;/);
  });

  it('accepts a plain HSL string and ignores names that are not theme variables', () => {
    const { css, updated } = applyThemeVariables(SAMPLE, {
      '--background': '10 10% 10%',
      'background': '0 0% 0%',
      '--primary': { hsl: '1; 2%', hex: '#ffffff' },
    });

    assert.deepEqual(updated, ['--background']);
    assert.match(css, /--background: 10 10% 10%;/);
    assert.match(css, /--primary: 142 71% 45%;/);
  });
});
