import assert from 'node:assert/strict';

// Runs against the installed WebView in a fresh disposable Actions profile.
// Reads configuration but does not save it, invoke providers or open external links.
export async function interfaceJourney({ command, execute, click, screenshot, record, until }) {
  async function button(text, scope = '//') {
    const xpath = `${scope}button[normalize-space(.)=${JSON.stringify(text)}]`;
    const found = await command('POST', '/element', { using: 'xpath', value: xpath });
    const id = found['element-6066-11e4-a52e-4f735466cecf'];
    assert.equal(await command('GET', `/element/${id}/displayed`), true, `${text} must be visible`);
    assert.equal(await command('GET', `/element/${id}/enabled`), true, `${text} must be enabled`);
    await command('POST', `/element/${id}/click`, {});
  }
  const settingsButton = text => button(text, '//div[contains(concat(" ",normalize-space(@class)," ")," settings-page ")]//');
  const section = text => button(text, '//nav[@aria-label="Settings sections"]//');
  // Machine metadata arrives after the plan and can refresh on focus changes.
  // Read readiness and the complete draft atomically at every comparison; never
  // retry a changed draft until it happens to match the expected state.
  const draftState = () => until(() => execute(`
    if (!document.querySelector('.lw-plan-flow code')?.textContent.trim()) return false;
    return {
    goal: document.querySelector('#local-goal').value,
    files: document.querySelector('#local-files').value,
    check: document.querySelector('#local-check').value,
    plan: document.querySelector('[aria-label=Plan]').textContent,
    approved: document.querySelector('.lw-approval input').checked,
    repository: localStorage.getItem('phonton.projects.active')
  }`), 'machine evidence directory in the plan');
  const original = await draftState();
  assert.ok(original.goal && original.plan, 'A real plan must already be present');
  assert.equal(original.approved, false);

  await click('nav[aria-label=Workspace] button[aria-label="Settings"]');
  await until(() => execute('return !!document.querySelector(".settings-page")'), 'settings page');
  const scrollAreas = await execute(`return [...document.querySelectorAll('.settings-page [data-slot="scroll-area-viewport"]')].map(e => ({
    width:getComputedStyle(e).scrollbarWidth, nativeDisplay:getComputedStyle(e,'::-webkit-scrollbar').display,
    overflowX:getComputedStyle(e).overflowX, overflowY:getComputedStyle(e).overflowY
  }))`);
  assert.equal(scrollAreas.length, 2, 'Settings navigation and content must both use the scroll-area viewport');
  for (const area of scrollAreas) {
    assert.equal(area.width, 'none', 'Bundled styles must hide duplicate native tracks');
    assert.equal(area.nativeDisplay, 'none', 'WebKit native scrollbar hiding must be bundled');
    assert.equal(area.overflowX, 'scroll'); assert.equal(area.overflowY, 'scroll', 'Native scrolling must remain enabled');
  }
  assert.equal(await execute('return document.querySelector("#local-goal").getBoundingClientRect().height'), 0, 'Workbench must be hidden behind Settings');
  const sections = [
    ['Account', 'Account'], ['Appearance', 'Appearance'], ['Provider', 'Provider'],
    ['Budget', 'Budget'], ['Index', 'Index'], ['Permissions', 'Permissions'],
    ['General', 'General'], ['Steering', 'Steering'], ['MCP', 'MCP servers'],
    ['Doctor', 'Doctor'], ['Updates', 'App updates'],
  ];
  const settingsFields = {
    Provider: ['Provider', 'Model', 'API key', 'Base URL', 'Account ID (Cloudflare)'],
    Budget: ['Max tokens per session', 'Max USD cents per session'],
    Index: ['Backend', 'Qdrant URL', 'Qdrant collection'],
    Permissions: ['Default mode'],
  };
  const fieldLabels = {};
  for (const [label, heading] of sections) {
    await section(label);
    await until(() => execute(`return [...document.querySelectorAll('.settings-page h2')].some(h => h.textContent.trim() === arguments[0])`, heading), `${label} content`);
    const selected = await execute('return document.querySelector(".settings-nav [aria-current=page]")?.textContent.trim()');
    assert.equal(selected, label, 'Navigation must indicate the rendered settings section');
    assert.equal(await execute('return document.documentElement.scrollWidth > innerWidth + 1'), false, `${label} must not overflow the window horizontally`);
    if (settingsFields[label]) {
      fieldLabels[label] = await execute(`return [...document.querySelectorAll('.settings-page input:not([aria-hidden="true"]):not([type="hidden"]), .settings-page [role=combobox]')].map(e => ({
        id:e.id, labels:[...e.labels ?? []].map(l => l.textContent.trim().replace(/\\s+/g, ' ')).join(' ')
      }))`);
      assert.equal(fieldLabels[label].length, settingsFields[label].length, `${label} field inventory`);
      for (const [index, name] of settingsFields[label].entries()) {
        assert.ok(fieldLabels[label][index].id, `${name} needs a stable label target`);
        assert.equal(fieldLabels[label][index].labels.replace(/ \(saved\)$/, ''), name, `${name} must have its real associated label`);
      }
    }
    if (label === 'Steering' || label === 'MCP') {
      assert.deepEqual(await execute(`return [...document.querySelectorAll('.settings-page button[aria-pressed]')].map(e => ({name:e.textContent.trim(),pressed:e.getAttribute('aria-pressed')}))`),
        [{name:'Global',pressed:'true'},{name:'This project',pressed:'false'}], 'Default extension scope must expose its selected state');
    }
  }
  record('all eleven installed settings sections render with selected navigation', {fieldLabels,scrollAreas});

  const accentChecks = [];
  const movePointer = origin => command('POST', '/actions', { actions: [{ type: 'pointer', id: 'contrast-pointer',
    parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', duration: 150, origin, x: 0, y: 0 }] }] });
  const sampleAccent = async hovered => {
    const sample = await until(() => execute(`
      const matches = [...document.querySelectorAll('.settings-page button')].filter(e => e.textContent.trim() === 'Save general');
      if (matches.length !== 1) throw Error('Expected one Save general control');
      const button = matches[0];
      if (!button.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) || button.disabled || button.matches(':hover') !== arguments[0]) return false;
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d', {willReadFrequently:true});
      const rgba = color => { ctx.clearRect(0,0,1,1); ctx.fillStyle = color; ctx.fillRect(0,0,1,1); return [...ctx.getImageData(0,0,1,1).data].map(v => v/255); };
      const layers = []; let element = button;
      while (element) {
        const style = getComputedStyle(element);
        if (style.opacity !== '1' || style.backgroundImage !== 'none' || style.filter !== 'none' || style.mixBlendMode !== 'normal') throw Error('Unsupported paint effect in contrast measurement');
        layers.push({color:rgba(style.backgroundColor),background:style.backgroundColor}); element=element.parentElement;
      }
      return {theme:document.documentElement.dataset.theme,hovered:button.matches(':hover'),foreground:rgba(getComputedStyle(button).color),layers};
    `, hovered), 'enabled Settings action paint and pointer state');
    // Wait for the real CSS transition to reach its stable endpoint, not a sampled midpoint.
    const endpoint = hovered ? 0.9 : 1;
    if (Math.abs(sample.layers[0].color[3] - endpoint) > 1 / 255 + 0.001) return false;
    let painted = [0, 0, 0, 0];
    for (const { color } of [...sample.layers].reverse()) {
      const alpha = color[3] + painted[3] * (1 - color[3]);
      painted = [...color.slice(0, 3).map((value, index) => alpha ? (value * color[3] + painted[index] * painted[3] * (1 - color[3])) / alpha : 0), alpha];
    }
    assert.equal(painted[3], 1, 'Actual ancestor paint must resolve to an opaque backdrop');
    assert.equal(sample.foreground[3], 1, 'Enabled action label must be opaque');
    const luminance = values => values.slice(0, 3).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const foreground = luminance(sample.foreground), background = luminance(painted);
    const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    assert.ok(ratio >= 4.5, `${sample.theme} enabled action contrast ${ratio.toFixed(2)}:1`);
    return { ...sample, painted, ratio };
  };
  for (const [label, theme] of [['Graphite', 'nebula'], ['Cursor Dark', 'cursor-dark'], ['Light', 'light'], ['High contrast', 'high-contrast']]) {
    await section('Appearance'); await settingsButton(label);
    await until(() => execute('return document.documentElement.dataset.theme === arguments[0]', theme), `${label} theme`);
    const pressedThemes = await execute(`return [...document.querySelectorAll('.settings-page button[aria-pressed]')].filter(e => e.getAttribute('aria-pressed') === 'true').map(e => e.textContent.trim())`);
    assert.deepEqual(pressedThemes, [label], 'Exactly the active theme must expose its pressed state');
    await section('General');
    await until(() => execute(`
      const heading = [...document.querySelectorAll('.settings-page h2')].some(e => e.textContent.trim() === 'General');
      const buttons = [...document.querySelectorAll('.settings-page button')].filter(e => e.textContent.trim() === 'Save general');
      return heading && buttons.length === 1 && !buttons[0].disabled && buttons[0].checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
    `), 'General action ready');
    const found = await command('POST', '/element', {using:'xpath',value:'//div[contains(@class,"settings-page")]//button[normalize-space(.)="Save general"]'});
    const id = found['element-6066-11e4-a52e-4f735466cecf'];
    assert.equal(await command('GET', `/element/${id}/enabled`), true);
    await movePointer('viewport');
    const normal = await until(() => sampleAccent(false), `${label} normal contrast`);
    await screenshot(`ui-accent-${theme}-normal`);
    await movePointer({'element-6066-11e4-a52e-4f735466cecf':id});
    const hover = await until(() => sampleAccent(true), `${label} hover contrast`);
    await screenshot(`ui-accent-${theme}-hover`);
    assert.equal(normal.theme, theme); assert.equal(hover.theme, theme);
    accentChecks.push({theme,normal,hover});
  }
  await command('DELETE', '/actions');
  record('enabled Settings action labels meet contrast in all four native themes and hover states', accentChecks);

  await section('Appearance');
  await settingsButton('Light');
  await until(() => execute('return document.documentElement.dataset.theme === "light"'), 'Light appearance');
  // A visible element can still be unreadable. Check the inherited labels that
  // previously kept the dark theme's near-white foreground in installed WebView.
  const lightSettings = await until(async () => {
    const appearance = await execute(`return {
    bodyColor: getComputedStyle(document.body).color,
    background: getComputedStyle(document.querySelector('.settings-page')).backgroundColor,
    labels: [...document.querySelectorAll('.settings-page h1, .settings-page h2, .settings-page > header button, .settings-nav button, .settings-page section button span.text-sm')]
      .map(element => ({ text: element.textContent.trim(), color: getComputedStyle(element).color }))
    }`);
    return appearance.background === 'rgb(246, 247, 251)' && appearance.labels.length === 18 &&
      appearance.labels.every(label => label.color === 'rgb(20, 24, 40)') ? appearance : false;
  }, 'readable Light Settings labels');
  assert.equal(lightSettings.background, 'rgb(246, 247, 251)');
  assert.equal(lightSettings.labels.length, 18, 'Inspect both titles, Back, eleven sections and four theme labels');
  for (const label of lightSettings.labels) {
    assert.equal(label.color, 'rgb(20, 24, 40)', `Light Settings label must have a readable foreground: ${label.text}`);
  }
  await screenshot('ui-01-light-settings');
  await settingsButton('Back');
  assert.deepEqual(await draftState(), original, 'Appearance navigation must preserve goal, scope, checks, plan and unapproved consent');
  const light = await execute('return { theme: document.documentElement.dataset.theme, color: getComputedStyle(document.querySelector(".local-workbench")).color, background: getComputedStyle(document.querySelector(".local-workbench")).backgroundColor }');
  assert.equal(light.theme, 'light');
  assert.equal(light.background, 'rgb(246, 247, 251)', 'Light theme must reach the actual workbench surface');
  await screenshot('ui-02-light-workbench');
  await click('nav[aria-label=Workspace] button[aria-label="Settings"]');
  await section('Appearance');
  await settingsButton('Graphite');
  await until(() => execute('return document.documentElement.dataset.theme === "nebula"'), 'Graphite appearance');
  await section('Account');
  await settingsButton('Open online workspace');
  await until(() => execute('return !!document.querySelector(".online-return") && !document.querySelector(".online-return").closest("[hidden]")'), 'optional online setup');
  await screenshot('ui-03-optional-online-setup');
  await button('← Return to local workspace', '//div[@class="online-return"]//');
  assert.deepEqual(await draftState(), original, 'Optional setup must preserve the complete local draft and unapproved plan');
  assert.equal(await execute('return document.documentElement.dataset.theme'), 'nebula');
  assert.ok(await execute('return document.querySelector("#local-goal").getBoundingClientRect().height > 0'), 'Returning must reveal the workbench');
  await screenshot('ui-04-restored-local-plan');
  record('Light and Graphite themes plus settings and online round trips preserve the unapproved local plan', { light, lightSettings, fields: ['goal', 'files', 'check', 'plan', 'approved', 'repository'] });
}
