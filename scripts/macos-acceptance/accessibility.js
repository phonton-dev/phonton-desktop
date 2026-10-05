// Native accessibility only: this script never evaluates JavaScript in the app.
function run(args) {
  var pid = Number(args[0]), mode = args[1];
  if (!(pid > 0) || ['inspect', 'quit'].indexOf(mode) < 0) throw Error('Invalid probe arguments');
  var system = Application('System Events');
  if (!system.UIElementsEnabled()) throw Error('Accessibility is unavailable on this cloud runner');
  var owned = system.processes.whose({ unixId: pid })();
  if (owned.length !== 1) throw Error('Expected one owned native application');
  var app = owned[0];
  app.frontmost = true;
  if (!app.frontmost() || app.unixId() !== pid) throw Error('App did not retain native focus/ownership');
  if (mode === 'quit') {
    system.keystroke('q', { using: ['command down'] });
    return JSON.stringify({ action: 'Command-Q', pid: pid, native: true });
  }
  var rows = [], queue = app.windows().map(function (item) { return { item: item, depth: 0 }; });
  if (!queue.length) throw Error('No native window');
  function attr(item, name) {
    try { return item.attributes.byName(name).value(); } catch (error) { return null; }
  }
  while (queue.length) {
    var current = queue.shift();
    if (rows.length >= 2500 || current.depth > 24) throw Error('Accessibility tree exceeded bound');
    var item = current.item, row = { depth: current.depth };
    ['AXRole', 'AXTitle', 'AXDescription', 'AXValue', 'AXEnabled', 'AXPosition', 'AXSize'].forEach(function (name) {
      var value = attr(item, name);
      if (typeof value === 'string') value = value.slice(0, 1000);
      if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' || Array.isArray(value)) row[name] = value;
    });
    rows.push(row);
    item.uiElements().forEach(function (child) { queue.push({ item: child, depth: current.depth + 1 }); });
  }
  return JSON.stringify({ schema: 1, pid: pid, application: app.name(), frontmost: app.frontmost(), rows: rows });
}
