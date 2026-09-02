import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// vitest runs from the project root; import.meta.url is not a file URL here.
const css = readFileSync('src/styles/global.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Selectors that can match a control painted with background-clip: text. */
const CONTROL = /(^|[\s,>])(button|\.btn--|\.title-toggle|\.chrome-btn|\.tab\b|\.pills label|\.day-chips label|\.bucket-toggle)/;

function rules(): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    out.push({ selector: m[1].trim(), body: m[2] });
  }
  return out;
}

describe('button styles', () => {
  // The `background` shorthand resets background-clip to border-box. On the
  // gradient-text buttons that turns the gold ink from letters into a solid
  // fill — and on touch, :hover sticks after a tap, so it stayed that way.
  it('never uses the background shorthand on a control', () => {
    const offenders = rules()
      .filter((r) => CONTROL.test(r.selector) && /(^|[;\s])background:\s/.test(r.body))
      .map((r) => r.selector.replace(/\s+/g, ' '));
    expect(offenders).toEqual([]);
  });

  it('keeps background-clip on every gradient-text control', () => {
    const clipped = rules().filter((r) => /background-clip:\s*text/.test(r.body));
    expect(clipped.length).toBeGreaterThan(0);
    for (const rule of clipped) {
      expect(rule.body).toMatch(/background-image:/);
    }
  });
});
