// Native accessibility only: this script never evaluates JavaScript in the app.
function run(args) {
  var pid = Number(args[0]), mode = args[1];
  if (!(pid > 0) || ['inspect', 'quit', 'press', 'type'].indexOf(mode) < 0) throw Error('Invalid probe arguments');
  var system = Application('System Events');
  // Actual owned-process/window queries establish accessibility capability.
  // Permission errors propagate; no permission database or setting is changed.
  var owned = system.processes.whose({ unixId: pid })();
  if (owned.length !== 1) throw Error('Expected one owned native application');
  var app = owned[0];
  app.frontmost = true;
  if (!app.frontmost() || app.unixId() !== pid) throw Error('App did not retain native focus/ownership');
  if (mode === 'quit') {
    system.keystroke('q', { using: ['command down'] });
    return JSON.stringify({ action: 'Command-Q', pid: pid, native: true });
  }
  var rows = [], elements = [], queue = app.windows().map(function (item, index) { return { item: item, depth: 0, parent: null, path: [index] }; });
  if (!queue.length) throw Error('No native window');
  function attr(item, name) {
    try { return item.attributes.byName(name).value(); } catch (error) { return null; }
  }
  while (queue.length) {
    var current = queue.shift();
    if (rows.length >= 2500 || current.depth > 24) throw Error('Accessibility tree exceeded bound');
    var item = current.item, row = { index: rows.length, parent: current.parent, path: current.path, depth: current.depth };
    ['AXRole', 'AXSubrole', 'AXTitle', 'AXDescription', 'AXValue', 'AXEnabled', 'AXPosition', 'AXSize', 'AXFocused', 'AXSelected', 'AXCurrent'].forEach(function (name) {
      var value = attr(item, name);
      if (typeof value === 'string') value = value.slice(0, 1000);
      if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' || Array.isArray(value)) row[name] = value;
    });
    row.actions = item.actions().map(function (action) { return action.name(); });
    row.settable = {};
    ['AXValue', 'AXFocused'].forEach(function (name) {
      try { row.settable[name] = item.attributes.byName(name).settable(); }
      catch (error) { row.settable[name] = null; }
    });
    rows.push(row); elements.push(item);
    item.uiElements().forEach(function (child, index) { queue.push({ item: child, depth: current.depth + 1, parent: row.index, path: current.path.concat([index]) }); });
  }
  var result = { schema: 2, pid: pid, application: app.name(), frontmost: app.frontmost(), rows: rows };
  if (mode !== 'inspect') {
    var request = JSON.parse(args[2]);
    var selected = axSelect(rows, request.selector, mode);
    var target = elements[selected.index];
    if (!app.frontmost() || app.unixId() !== pid) throw Error('Lost owned application focus before native action');
    if (mode === 'press') target.actions.byName('AXPress').perform();
    else {
      if (typeof request.text !== 'string' || request.text.length > 1000 || /[^\x20-\x7e]/.test(request.text)) throw Error('Expected bounded printable ASCII text');
      target.attributes.byName('AXFocused').value = true;
      if (target.attributes.byName('AXFocused').value() !== true) throw Error('Native text field did not gain focus');
      system.keystroke('a', { using: ['command down'] });
      system.keystroke(request.text);
    }
    result.action = { mode: mode, selector: request.selector, selected: selected, native: true };
  }
  return JSON.stringify(result);
}


// Pure selection contract, also exercised by portable tests. No fallback clicks.
function axMatch(row, selector) {
  return Object.keys(selector).every(function (key) { return row[key] === selector[key]; });
}
function axAncestors(rows, row) {
  var ancestors = [], seen = {};
  while (row.parent !== null) {
    if (!Number.isInteger(row.parent) || row.parent < 0 || row.parent >= row.index || seen[row.parent]) throw Error('Invalid accessibility ancestry');
    seen[row.parent] = true; row = rows[row.parent]; ancestors.push(row);
  }
  return ancestors;
}
function axVisible(rows, row) {
  function rectangle(value) {
    if (!Array.isArray(value.AXPosition) || !Array.isArray(value.AXSize) || value.AXPosition.length !== 2 || value.AXSize.length !== 2 ||
      !value.AXPosition.concat(value.AXSize).every(Number.isFinite) || value.AXSize[0] <= 0 || value.AXSize[1] <= 0) return null;
    return [value.AXPosition[0], value.AXPosition[1], value.AXPosition[0] + value.AXSize[0], value.AXPosition[1] + value.AXSize[1]];
  }
  var rect = rectangle(row), ancestors = axAncestors(rows, row);
  if (!rect || !ancestors.some(function (parent) { return parent.AXRole === 'AXWindow'; })) return false;
  return ancestors.filter(function (parent) { return ['AXWindow', 'AXScrollArea'].indexOf(parent.AXRole) >= 0; }).every(function (parent) {
    var clip = rectangle(parent);
    if (!clip) return false;
    rect = [Math.max(rect[0], clip[0]), Math.max(rect[1], clip[1]), Math.min(rect[2], clip[2]), Math.min(rect[3], clip[3])];
    return rect[2] - rect[0] >= 4 && rect[3] - rect[1] >= 4;
  });
}
function axSelect(rows, selector, mode) {
  if (!selector || ['AXButton', 'AXDisclosureTriangle', 'AXTextArea', 'AXTextField'].indexOf(selector.AXRole) < 0 ||
    typeof selector.AXTitle !== 'string' || !selector.AXTitle || Object.keys(selector).some(function (key) { return ['AXRole', 'AXTitle', 'ancestor'].indexOf(key) < 0; })) throw Error('Invalid native selector');
  var matching = rows.filter(function (row) {
    if (row.AXRole !== selector.AXRole || row.AXTitle !== selector.AXTitle) return false;
    if (selector.ancestor && !axAncestors(rows, row).some(function (parent) { return axMatch(parent, selector.ancestor); })) return false;
    return axVisible(rows, row);
  });
  if (matching.length !== 1) throw Error('Expected one visible native match, got ' + matching.length);
  var row = matching[0];
  if (row.AXEnabled !== true) throw Error('Native control is disabled or unknown');
  if (mode === 'press' && (!Array.isArray(row.actions) || row.actions.indexOf('AXPress') < 0)) throw Error('Native AXPress is unavailable');
  if (mode === 'type' && (['AXTextArea', 'AXTextField'].indexOf(row.AXRole) < 0 || !row.settable || row.settable.AXFocused !== true)) throw Error('Native text focus is not settable');
  if (['press', 'type'].indexOf(mode) < 0) throw Error('Invalid native action');
  return row;
}
