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
  var request = args[2] ? JSON.parse(args[2]) : {};
  if (request.scope && request.scope !== 'modal') throw Error('Invalid native inspection scope');
  function progress(stage, detail) {
    console.log(JSON.stringify({ time: new Date().toISOString(), pid: pid, mode: mode, scope: request.scope || 'application', stage: stage, detail: detail }));
  }
  progress('windows', null);
  var rows = [], elements = [], queue = app.windows().map(function (item, index) { return { item: item, depth: 0, parent: null, path: [index] }; });
  if (!queue.length) throw Error('No native window');
  function attr(item, name) {
    try { return item.attributes.byName(name).value(); } catch (error) { return null; }
  }
  var modal = null;
  if (request.scope === 'modal') {
    modal = axFindModal(queue.map(function (entry) { return entry.item; }), function (item, path) {
      progress('discover-role', path); var role = attr(item, 'AXRole');
      var subrole = null;
      if (role === 'AXWindow') { progress('discover-subrole', path); subrole = attr(item, 'AXSubrole'); }
      return { AXRole: role, AXSubrole: subrole };
    }, function (item, path) { progress('discover-children', path); return item.uiElements(); });
    if (!modal.chain) {
      if (mode !== 'inspect') throw Error('Owned native dialog disappeared before action');
      return JSON.stringify({ schema: 2, pid: pid, application: app.name(), frontmost: app.frontmost(), rows: [], modalScope: { found: false, visited: modal.visited } });
    }
    // Keep actual ancestors for ownership/clipping while avoiding inactive web content.
    queue = [{ item: modal.chain[0].item, path: modal.chain[0].path, depth: 0, parent: null, chainIndex: 0 }];
  }
  while (queue.length) {
    var current = queue.shift();
    if (rows.length >= 2500 || current.depth > 24) throw Error('Accessibility tree exceeded bound');
    var item = current.item, row = { index: rows.length, parent: current.parent, path: current.path, depth: current.depth };
    // Each bridge query is an AppleEvent. Read only role-relevant metadata while
    // retaining the complete tree and every node's identity/text/geometry.
    row.queriedAttributes = [];
    function readAttribute(name) {
      progress('attribute-' + name, current.path);
      row.queriedAttributes.push(name);
      var value = attr(item, name);
      if (typeof value === 'string') value = value.slice(0, 1000);
      if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' || Array.isArray(value)) row[name] = value;
    }
    readAttribute('AXRole');
    var metadata = axMetadata(row.AXRole);
    metadata.attributes.forEach(readAttribute);
    row.actionsQueried = metadata.actions;
    if (metadata.actions) {
      progress('actions', current.path);
      row.actions = item.actions().map(function (action) { return action.name(); });
    }
    row.settable = {};
    metadata.settable.forEach(function (name) {
      progress('settable-' + name, current.path);
      try { row.settable[name] = item.attributes.byName(name).settable(); }
      catch (error) { row.settable[name] = null; }
    });
    rows.push(row); elements.push(item);
    progress('children', current.path);
    if (modal && current.chainIndex < modal.chain.length - 1) {
      var next = modal.chain[current.chainIndex + 1];
      queue.push({ item: next.item, depth: current.depth + 1, parent: row.index, path: next.path, chainIndex: current.chainIndex + 1 });
    } else {
      item.uiElements().forEach(function (child, index) { queue.push({ item: child, depth: current.depth + 1, parent: row.index, path: current.path.concat([index]) }); });
    }
  }
  var result = { schema: 2, pid: pid, application: app.name(), frontmost: app.frontmost(), rows: rows };
  if (modal) result.modalScope = { found: true, visited: modal.visited, path: modal.chain[modal.chain.length - 1].path };
  if (mode !== 'inspect') {
    var selected = axSelect(rows, request.selector, mode);
    var target = elements[selected.index];
    if (!app.frontmost() || app.unixId() !== pid) throw Error('Lost owned application focus before native action');
    progress('native-action', selected.path);
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

// Omitted fields were not queried; null means a queried attribute was unavailable.
// Action selection stays limited to the same supported native control roles.
function axMetadata(role) {
  var attributes = ['AXTitle', 'AXDescription', 'AXValue', 'AXPosition', 'AXSize'];
  var text = ['AXTextArea', 'AXTextField', 'AXComboBox'].indexOf(role) >= 0;
  var control = text || ['AXButton', 'AXDisclosureTriangle', 'AXCheckBox', 'AXRadioButton', 'AXPopUpButton', 'AXMenuButton', 'AXSlider', 'AXLink', 'AXTab', 'AXMenuItem', 'AXRow'].indexOf(role) >= 0;
  if (role === 'AXWindow') attributes.push('AXSubrole');
  if (control) attributes.push('AXEnabled', 'AXSelected', 'AXCurrent');
  if (text) attributes.push('AXFocused');
  return { attributes: attributes, actions: control, settable: text ? ['AXValue', 'AXFocused'] : [] };
}

// Discover native dialogs without traversing the inactive application's web tree.
// Missing/ambiguous ownership stays explicit; there is no fallback coordinate action.
function axFindModal(roots, describe, children) {
  var queue = roots.map(function (item, index) { return { item: item, path: [index], chain: [] }; });
  var matches = [], visited = 0;
  while (queue.length) {
    var entry = queue.shift();
    if (++visited > 512 || entry.path.length > 12) throw Error('Native modal discovery exceeded bound');
    var row = describe(entry.item, entry.path);
    var chain = entry.chain.concat([{ item: entry.item, path: entry.path }]);
    if (['AXSheet', 'AXDialog'].indexOf(row.AXRole) >= 0 || row.AXRole === 'AXWindow' && row.AXSubrole === 'AXDialog') {
      matches.push(chain); continue;
    }
    if (row.AXRole === 'AXWebArea') continue;
    children(entry.item, entry.path).forEach(function (item, index) {
      queue.push({ item: item, path: entry.path.concat([index]), chain: chain });
    });
  }
  if (matches.length > 1) throw Error('Expected one owned native dialog, got ' + matches.length);
  return { chain: matches[0] || null, visited: visited };
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
