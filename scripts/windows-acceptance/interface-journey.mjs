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
  assert.equal(await execute('return document.querySelector("#local-goal").getBoundingClientRect().height'), 0, 'Workbench must be hidden behind Settings');
  const sections = [
    ['Account', 'Account'], ['Appearance', 'Appearance'], ['Provider', 'Provider'],
    ['Budget', 'Budget'], ['Index', 'Index'], ['Permissions', 'Permissions'],
    ['General', 'General'], ['Steering', 'Steering'], ['MCP', 'MCP servers'],
    ['Doctor', 'Doctor'], ['Updates', 'App updates'],
  ];
  for (const [label, heading] of sections) {
    await section(label);
    await until(() => execute(`return [...document.querySelectorAll('.settings-page h2')].some(h => h.textContent.trim() === arguments[0])`, heading), `${label} content`);
    const selected = await execute('return document.querySelector(".settings-nav [aria-current=page]")?.textContent.trim()');
    assert.equal(selected, label, 'Navigation must indicate the rendered settings section');
    assert.equal(await execute('return document.documentElement.scrollWidth > innerWidth + 1'), false, `${label} must not overflow the window horizontally`);
  }
  record('all eleven installed settings sections render with selected navigation');

  await section('Appearance');
  await settingsButton('Light');
  await until(() => execute('return document.documentElement.dataset.theme === "light"'), 'Light appearance');
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
  record('Light and Graphite themes plus settings and online round trips preserve the unapproved local plan', { light, fields: ['goal', 'files', 'check', 'plan', 'approved', 'repository'] });
}
