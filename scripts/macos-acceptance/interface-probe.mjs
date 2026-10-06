import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

/** Native AX actions only; this bounded probe does not claim model/Apply acceptance. */
export async function interfaceProbe({ inspect, action, capture, save, record, until, ready }) {
  let sequence = 0;
  const observe = async (label, scope) => {
    await delay(300);
    const tree = inspect(scope);
    save(`ui-${String(++sequence).padStart(2, '0')}-${label}`, tree);
    capture(`ui-${String(sequence).padStart(2, '0')}-${label}`);
    return tree;
  };
  const press = async (title, ancestor, scope) => {
    const selector = { AXRole: 'AXButton', AXTitle: title, ...(ancestor ? { ancestor } : {}) };
    await until(() => ready(inspect(scope), selector, 'press'), `native ${title} control ready`, 30000);
    return action('press', { selector, ...(scope ? { scope } : {}) }); // Exactly one action after bounded read-only readiness.
  };
  const emptyRepository = tree => {
    assert.equal(tree.rows.filter(row => row.AXRole === 'AXStaticText' && row.AXValue === 'No repository open').length, 1);
    assert.equal(tree.rows.filter(row => row.AXRole === 'AXButton' && row.AXTitle === '⌑ Open repository').length, 1);
  };
  const goal = 'Keep this native Mac draft while exploring settings and choosing a folder.';
  const draft = tree => {
    const rows = tree.rows.filter(row => row.AXRole === 'AXTextArea' && row.AXTitle === 'Coding goal');
    assert.equal(rows.length, 1); return rows[0].AXValue;
  };
  emptyRepository(inspect());
  action('type', { selector: { AXRole: 'AXTextArea', AXTitle: 'Coding goal', ancestor: { AXRole: 'AXGroup', AXTitle: 'New local goal' } }, text: goal });
  assert.equal(draft(await observe('native-draft')), goal);

  await press('Settings', { AXRole: 'AXGroup', AXTitle: 'Workspace' });
  await observe('settings-initial');
  const sections = [['Account', 'Account'], ['Appearance', 'Appearance'], ['Provider', 'Provider'], ['Budget', 'Budget'],
    ['Index', 'Index'], ['Permissions', 'Permissions'], ['General', 'General'], ['Steering', 'Steering'],
    ['MCP', 'MCP servers'], ['Doctor', 'Doctor'], ['Updates', 'App updates']];
  for (const [label, heading] of sections) {
    await press(label, { AXRole: 'AXGroup', AXTitle: 'Settings sections' });
    await until(() => {
      const tree = inspect();
      return tree.rows.some(row => row.AXRole === 'AXHeading' && [row.AXTitle, row.AXValue, row.AXDescription].includes(heading)) ? tree : false;
    }, `native ${label} heading`, 30000);
    await observe('settings-' + label.toLowerCase());
  }
  record('native settings sections expose their actual content headings', { sections, scope: 'AX and original screens; no saved configuration or provider/billing operations' });
  await press('Appearance', { AXRole: 'AXGroup', AXTitle: 'Settings sections' });
  await press('Light'); await observe('light-settings');
  await press('Back'); assert.equal(draft(await observe('light-draft')), goal);
  await press('Settings', { AXRole: 'AXGroup', AXTitle: 'Workspace' });
  await press('Appearance', { AXRole: 'AXGroup', AXTitle: 'Settings sections' });
  await press('Graphite'); await observe('graphite-settings');
  await press('Back'); assert.equal(draft(await observe('graphite-draft')), goal);
  record('native theme controls and Settings round trips preserve the actual draft', { goal, scope: 'Theme appearance requires original screenshot review; no computed-color or retained-profile claim' });

  await press('Change folder ↗');
  const picker = await until(() => {
    const tree = inspect('modal');
    const dialogs = tree.rows.filter(row => ['AXSheet', 'AXDialog'].includes(row.AXRole) || row.AXRole === 'AXWindow' && row.AXSubrole === 'AXDialog');
    if (dialogs.length !== 1) return false;
    const dialog = dialogs[0];
    const belongs = row => {
      while (row.parent !== null) { row = tree.rows[row.parent]; if (row.index === dialog.index) return true; }
      return false;
    };
    const identified = [dialog, ...tree.rows.filter(belongs)].some(row =>
      [row.AXTitle, row.AXDescription, row.AXValue].includes('Open repository'));
    return identified ? { tree, dialog } : false;
  }, 'owned native folder dialog', 30000);
  await observe('native-folder-dialog', 'modal');
  const ancestor = { AXRole: picker.dialog.AXRole };
  if (picker.dialog.AXSubrole) ancestor.AXSubrole = picker.dialog.AXSubrole;
  if (picker.dialog.AXTitle) ancestor.AXTitle = picker.dialog.AXTitle;
  await press('Cancel', ancestor, 'modal');
  await until(() => {
    const tree = inspect('modal');
    return !tree.rows.some(row => ['AXSheet', 'AXDialog'].includes(row.AXRole) || row.AXRole === 'AXWindow' && row.AXSubrole === 'AXDialog') ? tree : false;
  }, 'native Cancel dismisses owned chooser', 30000);
  const cancelled = await observe('picker-cancelled-draft');
  assert.equal(draft(cancelled), goal); emptyRepository(cancelled);
  record('owned native folder-picker Cancel preserves the draft', { dialog: picker.dialog, goal, repository: 'No repository open' });
}
