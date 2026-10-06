// Native accessibility only: this script never evaluates JavaScript in the app.
function run(args) {
  var pid = Number(args[0]), mode = args[1];
  if (!(pid > 0) || ['inspect', 'quit', 'press', 'type', 'summary-toggle', 'folder-shortcut', 'folder-path-type', 'folder-path-confirm', 'reveal', 'select-context'].indexOf(mode) < 0) throw Error('Invalid probe arguments');
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
  var windowObservations = [];
  var windows = mode === 'inspect' ? axInspectWindows(function () { return app.windows(); }, function () {
    var current = system.processes.whose({ unixId: pid })();
    if (current.length !== 1 || current[0].unixId() !== pid) throw Error('Lost owned application during window inspection');
    if (!app.frontmost() || app.unixId() !== pid) throw Error('Lost native focus/ownership during window inspection');
  }, function (seconds) { delay(seconds); }, function (detail) {
    windowObservations.push(detail); progress('windows-observation', detail);
  }) : app.windows();
  var rows = [], elements = [], queue = windows.map(function (item, index) { return { item: item, depth: 0, parent: null, path: [index] }; });
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
      return JSON.stringify({ schema: 2, pid: pid, application: app.name(), frontmost: app.frontmost(), rows: [], windowObservations: windowObservations, modalScope: { found: false, visited: modal.visited } });
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
    var omission = axModalChildrenOmission(request.scope, row);
    if (omission) {
      row.childrenOmitted = omission;
      continue;
    }
    progress('children', current.path);
    if (modal && current.chainIndex < modal.chain.length - 1) {
      var next = modal.chain[current.chainIndex + 1];
      queue.push({ item: next.item, depth: current.depth + 1, parent: row.index, path: next.path, chainIndex: current.chainIndex + 1 });
    } else {
      item.uiElements().forEach(function (child, index) { queue.push({ item: child, depth: current.depth + 1, parent: row.index, path: current.path.concat([index]) }); });
    }
  }
  var result = { schema: 2, pid: pid, application: app.name(), frontmost: app.frontmost(), rows: rows };
  if (mode === 'inspect') result.windowObservations = windowObservations;
  if (modal) result.modalScope = { found: true, visited: modal.visited, path: modal.chain[modal.chain.length - 1].path };
  if (mode === 'folder-shortcut') {
    var dialog = axFolderShortcut(rows, request);
    if (!app.frontmost() || app.unixId() !== pid) throw Error('Lost owned application focus before folder shortcut');
    progress('native-folder-shortcut', request.shortcut);
    if (request.shortcut === 'go-to-folder') system.keystroke('g', { using: ['command down', 'shift down'] });
    else system.keyCode(53); // macOS kVK_Escape (0x35).
    result.action = { mode: mode, shortcut: request.shortcut, dialog: dialog, native: true };
    return JSON.stringify(result);
  }
  if (mode === 'folder-path-type' || mode === 'folder-path-confirm') {
    var field = axFolderPath(rows, request, mode);
    var pathField = elements[field.index];
    if (!app.frontmost() || app.unixId() !== pid) throw Error('Lost owned application before path action');
    progress('native-folder-path', mode);
    if (mode === 'folder-path-type') {
      axSetFolderPath(pathField, request.path, function () {
        if (!app.frontmost() || app.unixId() !== pid) throw Error('Lost owned application before folder value');
      });
    } else axConfirmFolderPath(pathField, request.path, system, function () {
      if (!app.frontmost() || app.unixId() !== pid) throw Error('Lost owned application before folder Return');
    });
    result.action = { mode: mode, path: request.path, selected: field, native: true };
    return JSON.stringify(result);
  }
  if (mode !== 'inspect') {
    var selected = axSelect(rows, request.selector, mode);
    var target = elements[selected.index];
    if (!app.frontmost() || app.unixId() !== pid) throw Error('Lost owned application focus before native action');
    progress('native-action', selected.path);
    if (mode === 'reveal') target.actions.byName('AXScrollToVisible').perform();
    else if (mode === 'press') target.actions.byName('AXPress').perform();
    else if (mode === 'select-context') {
      // Native select opens its actual menu. Home + two Down chooses the third
      // source-defined option (4096); a fresh AX read-back is mandatory outside.
      target.actions.byName('AXPress').perform();
      if (!app.frontmost() || app.unixId() !== pid) throw Error('Lost owned application before context selection');
      system.keyCode(115); system.keyCode(125); system.keyCode(125); system.keyCode(36);
    }
    else if (mode === 'summary-toggle') {
      axToggleSummary(target, system, function () {
        if (!app.frontmost() || app.unixId() !== pid) throw Error('Lost owned application focus before summary key');
      });
    }
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

// AppKit can briefly expose no AX windows while attaching a native sheet. Retry
// only that inspection result; never turn unavailable windows into modal absence.
// All native actions and all bridge/permission errors remain non-retryable.
function axInspectWindows(readWindows, assertOwned, wait, observe) {
  var started = Date.now();
  for (var attempt = 1; attempt <= 21; attempt++) {
    assertOwned();
    var windows = readWindows();
    var elapsed = Date.now() - started;
    observe({ attempt: attempt, windowCount: windows.length, elapsedMs: elapsed });
    if (windows.length) return windows;
    if (elapsed >= 5000 || attempt === 21) break;
    wait(0.25);
  }
  throw Error('No native window after bounded inspection');
}

// The observed chooser sidebar and column listing can expand into large native
// file trees. Keep their identity/geometry while omitting only their descendants
// in modal scans. Path, Open, Cancel and application scans remain fully inspected;
// the caller still requires the exact selected repository in the actual workbench.
function axModalChildrenOmission(scope, row) {
  if (scope !== 'modal') return null;
  if (row.AXRole === 'AXOutline' && row.AXDescription === 'sidebar') return 'native-folder-sidebar';
  if (row.AXRole === 'AXBrowser' && row.AXDescription === 'column view') return 'native-folder-columns';
  return null;
}

function axFolderPath(rows, request, mode) {
  if (request.scope !== 'modal' || ['folder-path-type', 'folder-path-confirm'].indexOf(mode) < 0 ||
      typeof request.path !== 'string' || request.path[0] !== '/' || request.path.length > 1000 ||
      /[^\x20-\x7e]/.test(request.path) || request.path.indexOf('\\') >= 0 || request.path.split('/').indexOf('..') >= 0) throw Error('Invalid native fixture path');
  var dialog = axFolderShortcut(rows, { scope: 'modal', shortcut: 'go-to-folder' });
  var matches = rows.filter(function (row) {
    var ancestors = axAncestors(rows, row);
    return row.AXRole === 'AXTextField' && row.AXTitle === null && row.AXDescription === null && row.AXFocused === true &&
      ancestors.some(function (parent) { return parent.index === dialog.index; }) &&
      ancestors.some(function (parent) { return parent.AXRole === 'AXSheet' && parent.index !== dialog.index; }) && axVisible(rows, row);
  });
  if (matches.length !== 1) throw Error('Expected one focused native Go to Folder path field, got ' + matches.length);
  var field = matches[0];
  if (field.AXEnabled !== true || typeof field.AXValue !== 'string' || !field.settable || field.settable.AXFocused !== true) throw Error('Native path field is not editable');
  if (mode === 'folder-path-type' && field.settable.AXValue !== true) throw Error('Native path value is not settable');
  if (mode === 'folder-path-confirm' && (field.AXValue !== request.path || !Array.isArray(field.actions) || field.actions.indexOf('AXConfirm') < 0)) throw Error('Native path must match exactly before confirm');
  return field;
}

// Native path completion can drop the beginning of a batched keystroke. This
// AppKit field advertises settable AXValue; use that native control interface
// once, then retain immediate and separately observed exact-value readbacks.
function axSetFolderPath(target, expectedPath, assertOwned) {
  if (target.attributes.byName('AXFocused').value() !== true) throw Error('Native path lost focus before value');
  assertOwned();
  target.attributes.byName('AXValue').value = expectedPath;
  if (target.attributes.byName('AXValue').value() !== expectedPath) throw Error('Native path value did not match after entry');
  if (target.attributes.byName('AXFocused').value() !== true) throw Error('Native path lost focus after value');
}

// The native Go to Folder text field advertises AXConfirm, but the observed
// panel stayed open after that action. Use its actual Return-key interaction,
// rechecking exact text, focus and app ownership immediately before one key.
// The caller still requires the nested sheet to close and Open to be enabled.
function axConfirmFolderPath(target, expectedPath, system, assertOwned) {
  if (target.attributes.byName('AXFocused').value() !== true) throw Error('Native path lost focus before Return');
  if (target.attributes.byName('AXValue').value() !== expectedPath) throw Error('Native path changed before Return');
  assertOwned();
  system.keyCode(36); // macOS kVK_Return (0x24).
}

// Omitted fields were not queried; null means a queried attribute was unavailable.
// Action selection stays limited to the same supported native control roles.
function axMetadata(role) {
  var attributes = ['AXTitle', 'AXDescription', 'AXValue', 'AXPosition', 'AXSize'];
  var text = ['AXTextArea', 'AXTextField', 'AXComboBox'].indexOf(role) >= 0;
  var control = text || ['AXButton', 'AXDisclosureTriangle', 'AXCheckBox', 'AXRadioButton', 'AXPopUpButton', 'AXMenuButton', 'AXSlider', 'AXLink', 'AXTab', 'AXMenuItem', 'AXRow'].indexOf(role) >= 0;
  if (role === 'AXWindow') attributes.push('AXSubrole');
  if (control) attributes.push('AXEnabled', 'AXSelected', 'AXCurrent');
  if (role === 'AXDisclosureTriangle') attributes.push('AXExpanded', 'AXSubrole', 'AXFocused');
  if (text) attributes.push('AXFocused');
  return { attributes: attributes, actions: control || role === 'AXScrollArea', settable: text ? ['AXValue', 'AXFocused'] : role === 'AXDisclosureTriangle' ? ['AXFocused'] : [] };
}

// WebKit summaries expose settable focus but no AXPress on the observed Mac.
// Deliver one native Space only after read-back focus and owned-app verification.
// The caller must separately observe the expected AXValue transition.
function axToggleSummary(target, system, assertOwned) {
  target.attributes.byName('AXFocused').value = true;
  if (target.attributes.byName('AXFocused').value() !== true) throw Error('Native summary did not gain focus');
  assertOwned();
  system.keystroke(' ');
}

// Shortcuts are permitted only inside the app's observed repository chooser.
// The post-shortcut tree is recorded separately; sending a key never proves that
// a path field appeared or that a folder was selected.
function axFolderShortcut(rows, request) {
  if (request.scope !== 'modal' || ['go-to-folder', 'escape'].indexOf(request.shortcut) < 0) throw Error('Invalid folder shortcut');
  var dialogs = rows.filter(function (row) {
    if (['AXSheet', 'AXDialog'].indexOf(row.AXRole) < 0 && !(row.AXRole === 'AXWindow' && row.AXSubrole === 'AXDialog')) return false;
    if (!axVisible(rows, row)) return false;
    return rows.some(function (child) {
      return [child.AXTitle, child.AXDescription, child.AXValue].indexOf('Open repository') >= 0 &&
        (child.index === row.index || axAncestors(rows, child).some(function (parent) { return parent.index === row.index; }));
    });
  });
  if (dialogs.length !== 1) throw Error('Expected one identified repository dialog before shortcut');
  return dialogs[0];
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
  if (!selector || ['AXButton', 'AXCheckBox', 'AXDisclosureTriangle', 'AXTextArea', 'AXTextField', 'AXPopUpButton'].indexOf(selector.AXRole) < 0 ||
    typeof selector.AXTitle !== 'string' || !selector.AXTitle || Object.keys(selector).some(function (key) { return ['AXRole', 'AXTitle', 'ancestor'].indexOf(key) < 0; })) throw Error('Invalid native selector');
  var matching = rows.filter(function (row) {
    if (row.AXRole !== selector.AXRole || row.AXTitle !== selector.AXTitle) return false;
    if (selector.ancestor && !axAncestors(rows, row).some(function (parent) { return axMatch(parent, selector.ancestor); })) return false;
    if (mode !== 'reveal') return axVisible(rows, row);
    return Array.isArray(row.AXPosition) && row.AXPosition.length === 2 && row.AXPosition.every(Number.isFinite) &&
      Array.isArray(row.AXSize) && row.AXSize.length === 2 && row.AXSize.every(function (value) { return Number.isFinite(value) && value > 0; }) &&
      axAncestors(rows, row).some(function (parent) { return parent.AXRole === 'AXWindow'; });
  });
  if (matching.length !== 1) throw Error('Expected one visible native match, got ' + matching.length);
  var row = matching[0];
  if (row.AXEnabled !== true) throw Error('Native control is disabled or unknown');
  if (mode === 'press' && (!Array.isArray(row.actions) || row.actions.indexOf('AXPress') < 0)) throw Error('Native AXPress is unavailable');
  if (mode === 'press' && row.AXRole === 'AXCheckBox' && [0, 1].indexOf(row.AXValue) < 0) throw Error('Native checkbox state is unavailable');
  if (mode === 'reveal' && (!Array.isArray(row.actions) || row.actions.indexOf('AXScrollToVisible') < 0)) throw Error('Native scroll-to-visible is unavailable');
  if (mode === 'select-context' && (row.AXRole !== 'AXPopUpButton' || row.AXTitle !== 'Calibration context' ||
      !Array.isArray(row.actions) || row.actions.indexOf('AXPress') < 0)) throw Error('Expected actual calibration context menu');
  if (mode === 'type' && (['AXTextArea', 'AXTextField'].indexOf(row.AXRole) < 0 || !row.settable || row.settable.AXFocused !== true)) throw Error('Native text focus is not settable');
  if (mode === 'summary-toggle' && (row.AXRole !== 'AXDisclosureTriangle' || row.AXSubrole !== 'AXSummary' ||
    typeof row.AXValue !== 'boolean' || !row.settable || row.settable.AXFocused !== true)) throw Error('Native summary state or focus is unavailable');
  if (['press', 'type', 'summary-toggle', 'reveal', 'select-context'].indexOf(mode) < 0) throw Error('Invalid native action');
  return row;
}
