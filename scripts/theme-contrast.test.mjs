import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const properties = new Map();
const root = { style: { setProperty: (key, value) => properties.set(key, value) }, dataset: {}, classList: { toggle() {} } };
const saved = new Map();
function load(name, dependencies = {}) {
  const source = readFileSync(new URL(`../src/themes/${name}.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: key => {
    assert.ok(Object.hasOwn(dependencies, key), `Unexpected dependency ${key}`); return dependencies[key];
  }, document: { documentElement: root }, localStorage: { setItem: (key, value) => saved.set(key, value), getItem: key => saved.get(key) } });
  return exports;
}
const mapping = load('shadcn-map');
const { themePresets, applyTheme, THEME_STORAGE_KEY } = load('presets', { './shadcn-map': mapping });
const rgb = hex => {
  assert.match(hex, /^#[a-f\d]{6}$/i, 'Contrast checks require concrete opaque sRGB colors');
  return [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255);
};
const luminance = values => values.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

for (const theme of themePresets) {
  test(`${theme.label} enabled accent-button labels retain readable normal and hover contrast`, () => {
    applyTheme(theme.id);
    assert.equal(root.dataset.theme, theme.id);
    assert.equal(saved.get(THEME_STORAGE_KEY), theme.id);
    const button = readFileSync(new URL('../src/components/ui/button.tsx', import.meta.url), 'utf8');
    const opacity = Number(/default: "bg-primary text-primary-foreground hover:bg-primary\/(\d+)"/.exec(button)?.[1]) / 100;
    assert.ok(opacity > 0 && opacity <= 1, 'Read the actual enabled primary hover opacity');
    for (const prefix of ['primary', 'sidebar-primary']) {
      const foreground = rgb(properties.get(`--${prefix}-foreground`));
      const fill = rgb(properties.get(`--${prefix}`));
      for (const surface of ['--background', '--card', '--sidebar']) {
        for (const alpha of [1, opacity]) {
          const backdrop = rgb(properties.get(surface));
          const painted = fill.map((value, index) => value * alpha + backdrop[index] * (1 - alpha));
          const ratio = contrast(foreground, painted);
          assert.ok(ratio >= 4.5, `${theme.label} ${prefix} alpha=${alpha} on ${surface}: ${ratio.toFixed(2)}:1, requires 4.5:1`);
        }
      }
    }
  });
}
