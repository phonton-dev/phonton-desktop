import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, realpathSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import vm from 'node:vm';
import { verifyMacCandidate } from './macos-acceptance/contract.mjs';
import { assertSameProcess, parseProcessIdentity } from './macos-acceptance/process-identity.mjs';
const accessibility = vm.createContext({});
vm.runInContext(readFileSync(new URL('./macos-acceptance/accessibility.js', import.meta.url), 'utf8'), accessibility);
const buttonSelector = { AXRole: 'AXButton', AXTitle: 'Settings', ancestor: { AXRole: 'AXGroup', AXTitle: 'Workspace' } };

test('modal scans omit only the identified native folder sidebar descendants', () => {
  const row = { AXRole: 'AXOutline', AXDescription: 'sidebar' };
  assert.equal(accessibility.axOmitModalSidebar('modal', row), true);
  for (const scope of [undefined, 'application']) assert.equal(accessibility.axOmitModalSidebar(scope, row), false);
  for (const other of [{ ...row, AXDescription: 'files' }, { ...row, AXDescription: null }, { ...row, AXRole: 'AXGroup' }]) {
    assert.equal(accessibility.axOmitModalSidebar('modal', other), false);
  }
});
test('full native scans reduce bridge calls without losing late controls, geometry or duplicate detection', () => {
  let reads = 0, presses = 0;
  function element(role, title, children = []) {
    const values = {AXRole:role,AXTitle:title,AXDescription:'',AXValue:title,AXPosition:[10,40],AXSize:[900,500],AXEnabled:true};
    const actions = () => { reads++; return role === 'AXButton' ? [{name:() => { reads++; return 'AXPress'; }}] : []; };
    actions.byName = name => ({perform:() => { assert.equal(name,'AXPress'); presses++; }});
    return {attributes:{byName:name => ({value:() => { reads++; return values[name] ?? null; },settable:() => { reads++; return false; }})},
      actions,uiElements:() => { reads++; return children; }};
  }
  const children = Array.from({length:100},(_,i) => element('AXStaticText',`File ${i}`));
  children.push(element('AXButton','Cancel'));
  const window = element('AXWindow','Open repository',[element('AXGroup','Files',children)]);
  const app = {unixId:() => 42,name:() => 'Phonton',windows:() => [window]};
  Object.defineProperty(app,'frontmost',{get:() => () => true,set() {}});
  const context = vm.createContext({console:{log() {}},Application:() => ({processes:{whose:() => () => [app]}})});
  vm.runInContext(readFileSync(new URL('./macos-acceptance/accessibility.js',import.meta.url),'utf8'),context);
  const snapshot = JSON.parse(context.run(['42','inspect']));
  assert.equal(snapshot.rows.length,103,'Complete tree, including the final Cancel');
  assert.ok(reads < 800,`Avoid redundant bridge calls on static rows: ${reads}`);
  for (const row of snapshot.rows) {
    assert.equal(row.AXValue,row.AXTitle);
    assert.deepEqual(row.AXPosition,[10,40]); assert.deepEqual(row.AXSize,[900,500]);
  }
  assert.equal(snapshot.rows[2].actionsQueried,false);
  assert.equal(Object.hasOwn(snapshot.rows[2],'AXEnabled'),false,'Unqueried is distinct from null');
  assert.equal(snapshot.rows[0].AXSubrole,null,'Unavailable queried subrole remains explicit');
  const request = JSON.stringify({selector:{AXRole:'AXButton',AXTitle:'Cancel'}});
  context.run(['42','press',request]); assert.equal(presses,1);
  children.push(element('AXButton','Cancel'));
  assert.throws(() => context.run(['42','press',request]),/one visible native match/);
  assert.equal(presses,1,'Ambiguous late control never receives another action');
});
test('native modal discovery preserves ancestors and excludes inactive web content', () => {
  const cancel = { AXRole: 'AXButton', AXTitle: 'Cancel' };
  const sheet = { AXRole: 'AXSheet', children: [cancel] };
  const web = { AXRole: 'AXWebArea' };
  const group = { AXRole: 'AXGroup', children: [web, sheet] };
  const window = { AXRole: 'AXWindow', children: [group] };
  const visited = [];
  const children = node => {
    assert.notEqual(node, web, 'Inactive web tree must never be traversed');
    assert.notEqual(node, sheet, 'Discovery must leave modal contents to the scoped scan');
    visited.push(node); return node.children || [];
  };
  const result = accessibility.axFindModal([window], node => node, children);
  assert.deepEqual(Array.from(result.chain, entry => entry.item), [window, group, sheet]);
  assert.deepEqual(Array.from(result.chain[2].path), [0, 0, 1]);
  assert.deepEqual(visited, [window, group]);
  assert.equal(accessibility.axFindModal([web], node => node, children).chain, null);
  assert.throws(() => accessibility.axFindModal([window, { AXRole: 'AXWindow', AXSubrole: 'AXDialog' }], node => node, children), /one owned native dialog/);
  const cycle = { AXRole: 'AXGroup' }; cycle.children = [cycle];
  assert.throws(() => accessibility.axFindModal([cycle], node => node, node => node.children), /exceeded bound/);
});
test('scoped native scans retain late path and Cancel controls without traversing a growing sidebar', () => {
  let sidebarReads = 0;
  const element = (role, title, children = [], extra = {}) => {
    const values = { AXRole: role, AXTitle: title, AXPosition: [10, 40], AXSize: [900, 500], AXEnabled: true, ...extra };
    const actions = () => role === 'AXButton' ? [{ name: () => 'AXPress' }] : [];
    return { attributes: { byName: name => ({ value: () => values[name] ?? null, settable: () => false }) }, actions, uiElements: () => children };
  };
  const sidebar = element('AXOutline', null, [], { AXDescription: 'sidebar' });
  sidebar.uiElements = () => { sidebarReads++; throw Error('Expanding native sidebar must not be traversed'); };
  const children = [sidebar, element('AXTextField', null, [], { AXValue: '/fixture', AXFocused: true }), element('AXButton', 'Cancel')];
  const sheet = element('AXSheet', 'Open repository', children);
  const app = { unixId: () => 42, name: () => 'Phonton', windows: () => [element('AXWindow', 'Phonton', [sheet])] };
  Object.defineProperty(app, 'frontmost', { get: () => () => true, set() {} });
  const context = vm.createContext({ console: { log() {} }, Application: () => ({ processes: { whose: () => () => [app] } }) });
  vm.runInContext(readFileSync(new URL('./macos-acceptance/accessibility.js', import.meta.url), 'utf8'), context);
  const scan = () => JSON.parse(context.run(['42', 'inspect', JSON.stringify({ scope: 'modal' })]));
  const result = scan();
  assert.equal(sidebarReads, 0);
  assert.equal(result.rows.find(row => row.AXRole === 'AXOutline').childrenOmitted, 'native-folder-sidebar');
  assert.equal(result.rows.find(row => row.AXRole === 'AXTextField').AXValue, '/fixture');
  assert.equal(result.rows.filter(row => row.AXTitle === 'Cancel').length, 1);
  children.push(element('AXButton', 'Cancel'));
  assert.equal(scan().rows.filter(row => row.AXTitle === 'Cancel').length, 2, 'Late duplicate controls stay visible to action admission');
  assert.throws(() => context.run(['42', 'inspect']), /Expanding native sidebar/, 'Application scope still traverses the complete tree');
});
function nativeTree() {
  return [
    { index: 0, parent: null, AXRole: 'AXWindow', AXTitle: 'Phonton', AXPosition: [0, 30], AXSize: [1024, 674] },
    { index: 1, parent: 0, AXRole: 'AXGroup', AXTitle: 'Workspace', AXPosition: [0, 80], AXSize: [200, 500] },
    { index: 2, parent: 1, AXRole: 'AXButton', AXTitle: 'Settings', AXEnabled: true, AXPosition: [18, 354], AXSize: [151, 40], actions: ['AXPress'], settable: { AXFocused: true } },
  ];
}
test('folder shortcuts require modal scope and an identified unique repository chooser', () => {
  const tree=nativeTree(); tree[1].AXRole='AXSheet'; tree[1].AXTitle=null;
  tree.push({index:3,parent:1,AXRole:'AXStaticText',AXValue:'Open repository'});
  for (const shortcut of ['go-to-folder','escape']) assert.equal(accessibility.axFolderShortcut(tree,{scope:'modal',shortcut}),tree[1]);
  for (const request of [{shortcut:'escape'},{scope:'modal',shortcut:'enter'},{scope:'application',shortcut:'go-to-folder'}]) {
    assert.throws(() => accessibility.axFolderShortcut(tree,request),/Invalid folder shortcut/);
  }
  const misplaced=structuredClone(tree); misplaced[3].parent=0;
  assert.throws(() => accessibility.axFolderShortcut(misplaced,{scope:'modal',shortcut:'escape'}),/identified repository dialog/);
  const clipped=structuredClone(tree); clipped[1].AXPosition=[0,900];
  assert.throws(() => accessibility.axFolderShortcut(clipped,{scope:'modal',shortcut:'escape'}),/identified repository dialog/);
  tree.push({...tree[1],index:4,parent:0,AXRole:'AXSheet',AXTitle:'Open repository'});
  assert.throws(() => accessibility.axFolderShortcut(tree,{scope:'modal',shortcut:'escape'}),/identified repository dialog/);
});
test('a dialog disappearing between readiness and action cannot count as native Cancel', () => {
  const context = vm.createContext({ console: { log() {} } });
  const window = { attributes: { byName: name => ({ value: () => name === 'AXRole' ? 'AXWindow' : null }) }, uiElements: () => [] };
  const app = { unixId: () => 42, name: () => 'Phonton', windows: () => [window] };
  Object.defineProperty(app, 'frontmost', { get: () => () => true, set() {} });
  context.Application = () => ({ processes: { whose: () => () => [app] } });
  vm.runInContext(readFileSync(new URL('./macos-acceptance/accessibility.js', import.meta.url), 'utf8'), context);
  assert.equal(JSON.parse(context.run(['42', 'inspect', JSON.stringify({ scope: 'modal' })])).modalScope.found, false);
  for (const mode of ['press', 'type']) {
    assert.throws(() => context.run(['42', mode, JSON.stringify({ scope: 'modal', selector: { AXRole: 'AXButton', AXTitle: 'Cancel' } })]), /disappeared before action/);
  }
});
test('native accessibility resolves unique owned hierarchy and rejects ambiguity, clipping or unsupported actions', () => {
  const tree = nativeTree();
  assert.equal(accessibility.axSelect(tree, buttonSelector, 'press'), tree[2]);
  for (const mutate of [
    rows => { rows.push({ ...rows[2], index: 3 }); },
    rows => { rows[1].AXTitle = 'Another workspace'; },
    rows => { rows[2].AXEnabled = false; },
    rows => { rows[2].AXEnabled = null; },
    rows => { rows[2].AXSize = [0, 40]; },
    rows => { rows[2].AXPosition = [18, 800]; },
    rows => { rows[1].AXRole = 'AXScrollArea'; rows[1].AXSize = [200, 100]; },
    rows => { rows[2].actions = []; },
    rows => { rows[2].parent = 2; },
    rows => { rows[2].AXTitle = 'Another control'; },
  ]) { const value = nativeTree(); mutate(value); assert.throws(() => accessibility.axSelect(value, buttonSelector, 'press')); }
  assert.throws(() => accessibility.axSelect(tree, { AXRole: 'AXButton' }, 'press'));
  assert.throws(() => accessibility.axSelect(tree, buttonSelector, 'unknown'));
});
test('native typing requires a uniquely visible editable control with settable native focus', () => {
  const tree = nativeTree(); Object.assign(tree[2], { AXRole: 'AXTextArea', AXTitle: 'Coding goal' });
  const selector = { AXRole: 'AXTextArea', AXTitle: 'Coding goal' };
  assert.equal(accessibility.axSelect(tree, selector, 'type'), tree[2]);
  tree[2].settable.AXFocused = null;
  assert.throws(() => accessibility.axSelect(tree, selector, 'type'));
  assert.throws(() => accessibility.axSelect(nativeTree(), buttonSelector, 'type'));
});

test('offscreen controls can only be revealed through their actual scroll action before pressing', () => {
  const rows=nativeTree(); rows[2].AXPosition=[18,900]; rows[2].actions=['AXPress','AXScrollToVisible'];
  assert.throws(() => accessibility.axSelect(rows,buttonSelector,'press'),/one visible native match/);
  assert.equal(accessibility.axSelect(rows,buttonSelector,'reveal'),rows[2]);
  for (const mutate of [row => {row.actions=['AXPress'];},row => {row.AXSize=[0,40];},row => {row.AXEnabled=false;}]) {
    const invalid=structuredClone(rows); mutate(invalid[2]);
    assert.throws(() => accessibility.axSelect(invalid,buttonSelector,'reveal'));
  }
  rows.push({...rows[2],index:3});
  assert.throws(() => accessibility.axSelect(rows,buttonSelector,'reveal'),/one visible native match/);
});

test('native context selection requires the exact enabled visible popup with AXPress', () => {
  const rows=nativeTree(); Object.assign(rows[2],{AXRole:'AXPopUpButton',AXTitle:'Calibration context'});
  const selector={AXRole:'AXPopUpButton',AXTitle:'Calibration context'};
  assert.equal(accessibility.axSelect(rows,selector,'select-context'),rows[2]);
  for (const mutate of [row => {row.actions=[];},row => {row.AXEnabled=false;},row => {row.AXPosition=[18,900];},row => {row.AXRole='AXButton';}]) {
    const invalid=structuredClone(rows); mutate(invalid[2]);
    assert.throws(() => accessibility.axSelect(invalid,selector,'select-context'));
  }
  rows[2].AXTitle='Another choice';
  assert.throws(() => accessibility.axSelect(rows,{...selector,AXTitle:'Another choice'},'select-context'),/calibration context/);
});

test('Go to Folder confirmation requires exact read-back in the uniquely focused nested native field', () => {
  const rows = [
    {index:0,parent:null,AXRole:'AXWindow',AXTitle:'Phonton',AXPosition:[0,30],AXSize:[1024,674]},
    {index:1,parent:0,AXRole:'AXSheet',AXTitle:null,AXPosition:[240,144],AXSize:[710,446]},
    {index:2,parent:1,AXRole:'AXStaticText',AXValue:'Open repository'},
    {index:3,parent:1,AXRole:'AXSheet',AXTitle:null,AXPosition:[280,275],AXSize:[460,190]},
    {index:4,parent:3,AXRole:'AXTextField',AXTitle:null,AXDescription:null,AXValue:'/tmp/fixture',AXFocused:true,AXEnabled:true,
      AXPosition:[297,283],AXSize:[344,22],actions:['AXShowMenu','AXConfirm'],settable:{AXFocused:true,AXValue:true}},
  ];
  const request={scope:'modal',path:'/tmp/fixture'};
  assert.equal(accessibility.axFolderPath(rows,request,'folder-path-confirm'),rows[4]);
  for (const mutate of [r => {r[4].AXValue='/tmp/another';},r => {r[4].AXFocused=false;},r => {r[4].parent=1;},
    r => {r[4].AXEnabled=false;},r => {r[4].actions=[];},r => {r[4].AXSize=[0,22];},
    r => {r.push({...r[4],index:5});},r => {r[2].AXValue='Another dialog';}]) {
    const invalid=structuredClone(rows); mutate(invalid);
    assert.throws(() => accessibility.axFolderPath(invalid,request,'folder-path-confirm'));
  }
  for (const fixturePath of ['relative','/tmp/../fixture','/tmp/x\nwrong','/tmp\\fixture']) {
    assert.throws(() => accessibility.axFolderPath(rows,{...request,path:fixturePath},'folder-path-type'),/fixture path/);
  }
  assert.throws(() => accessibility.axFolderPath(rows,{path:'/tmp/fixture'},'folder-path-confirm'));
  rows[4].AXValue='';
  assert.equal(accessibility.axFolderPath(rows,request,'folder-path-type'),rows[4]);
  assert.throws(() => accessibility.axFolderPath(rows,request,'folder-path-confirm'),/match exactly/);
});

test('Go to Folder sends one Return only while exact text, focus and ownership still hold', () => {
  const expectedPath = '/tmp/phonton macos acceptance fixture';
  let focused = true, text = expectedPath, owned = true;
  const events = [];
  const target = {attributes:{byName:name => ({value:() => name === 'AXFocused' ? focused : text})}};
  const system = {keyCode:key => events.push(key)};
  const assertOwned = () => { events.push('ownership'); if (!owned) throw Error('Lost owner'); };
  accessibility.axConfirmFolderPath(target, expectedPath, system, assertOwned);
  assert.deepEqual(events, ['ownership', 36]);
  events.length = 0; focused = false;
  assert.throws(() => accessibility.axConfirmFolderPath(target, expectedPath, system, assertOwned), /lost focus/);
  assert.deepEqual(events, []);
  focused = true; text = '/tmp/another';
  assert.throws(() => accessibility.axConfirmFolderPath(target, expectedPath, system, assertOwned), /changed/);
  assert.deepEqual(events, []);
  text = expectedPath; owned = false;
  assert.throws(() => accessibility.axConfirmFolderPath(target, expectedPath, system, assertOwned), /Lost owner/);
  assert.deepEqual(events, ['ownership']);
});

test('observed pressed theme checkboxes require their exact native role, state and AXPress', () => {
  const rows=nativeTree();
  Object.assign(rows[2], {parent:0,AXRole:'AXCheckBox',AXTitle:'Light',AXValue:0,
    AXPosition:[284,345],AXSize:[331,98],actions:['AXPress','AXShowMenu','AXScrollToVisible']});
  const selector={AXRole:'AXCheckBox',AXTitle:'Light'};
  assert.equal(accessibility.axSelect(rows,selector,'press'),rows[2]);
  rows[2].AXValue=1;
  assert.equal(accessibility.axSelect(rows,selector,'press'),rows[2]);
  assert.throws(() => accessibility.axSelect(rows,{...selector,AXRole:'AXButton'},'press'),/one visible native match/);
  for (const value of [null,2,'1',false]) {
    rows[2].AXValue=value;
    assert.throws(() => accessibility.axSelect(rows,selector,'press'),/checkbox state/);
  }
  rows[2].AXValue=0; rows[2].actions=['AXShowMenu'];
  assert.throws(() => accessibility.axSelect(rows,selector,'press'),/AXPress is unavailable/);
});

test('observed WebKit summaries use guarded native focus without inventing AXPress support', () => {
  // Native records from the retained 6 October Mac draft inspection. Geometry
  // and control capabilities are preserved; the ancestor chain is reduced here.
  const observed = [
    {AXTitle:'Scope · files, new file',AXPosition:[235,503]},
    {AXTitle:'Checks & permissions',AXPosition:[235,538]},
  ];
  for (const value of observed) {
    const rows = nativeTree();
    rows[2] = {...value,index:2,parent:0,AXRole:'AXDisclosureTriangle',AXSubrole:'AXSummary',AXValue:false,
      AXSize:[742,29],AXEnabled:true,AXFocused:false,actions:['AXShowMenu','AXScrollToVisible'],settable:{AXValue:false,AXFocused:true}};
    const selector = {AXRole:rows[2].AXRole,AXTitle:rows[2].AXTitle};
    assert.throws(() => accessibility.axSelect(rows,selector,'press'),/AXPress is unavailable/);
    assert.equal(accessibility.axSelect(rows,selector,'summary-toggle'),rows[2]);
    for (const mutate of [
      row => { row.AXSubrole=null; }, row => { row.AXValue=null; },
      row => { row.settable.AXFocused=false; }, row => { row.AXEnabled=false; },
      row => { row.AXPosition=[235,900]; },
    ]) {
      const invalid=structuredClone(rows); mutate(invalid[2]);
      assert.throws(() => accessibility.axSelect(invalid,selector,'summary-toggle'));
    }
  }
  assert.throws(() => accessibility.axSelect(nativeTree(),buttonSelector,'summary-toggle'),/summary state or focus/);
  const metadata=accessibility.axMetadata('AXDisclosureTriangle');
  for (const name of ['AXSubrole','AXFocused','AXValue']) assert.ok(metadata.attributes.includes(name));
  assert.ok(metadata.settable.includes('AXFocused'));
});

test('summary Space is sent only after native focus read-back and ownership verification', () => {
  function attempt(focusWorks,owned) {
    const events=[]; let focused=false;
    const attribute={};
    Object.defineProperty(attribute,'value',{
      get:() => () => { events.push('focus-read'); return focused; },
      set:value => { assert.equal(value,true); events.push('focus-write'); focused=focusWorks; },
    });
    const target={attributes:{byName:name => { assert.equal(name,'AXFocused'); return attribute; }}};
    const system={keystroke:key => { assert.equal(key,' '); events.push('Space'); }};
    const run=() => accessibility.axToggleSummary(target,system,() => { events.push('ownership'); if (!owned) throw Error('Lost ownership'); });
    return {run,events};
  }
  const valid=attempt(true,true); valid.run();
  assert.deepEqual(valid.events,['focus-write','focus-read','ownership','Space']);
  const noFocus=attempt(false,true); assert.throws(noFocus.run,/did not gain focus/);
  assert.deepEqual(noFocus.events,['focus-write','focus-read']);
  const noOwnership=attempt(true,false); assert.throws(noOwnership.run,/Lost ownership/);
  assert.deepEqual(noOwnership.events,['focus-write','focus-read','ownership']);
});
const pin = JSON.parse(readFileSync(new URL('./macos-acceptance/source.json', import.meta.url), 'utf8'));
function fixture() {
  const run = { id: pin.runId, repository: { full_name: pin.repository }, head_sha: pin.commit,
    path: '.github/workflows/release-desktop.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success' };
  const jobs = [{ id: pin.buildJobId, run_id: pin.runId, name: 'Build (macos-latest)', head_sha: pin.commit, status: 'completed', conclusion: 'success',
    steps: ['Check desktop contracts', 'Build release candidate without publishing', 'Check native Desktop contracts', 'Retain platform candidate bundles'].map(name => ({ name, conclusion: 'success' })) }];
  const artifact = { id: pin.artifact.id, name: pin.artifact.name, expired: false,
    workflow_run: { id: pin.runId, head_sha: pin.commit }, digest: 'sha256:' + pin.artifact.sha256 };
  const log = `Artifact ${pin.artifact.name}.zip successfully finalized. Artifact ID ${pin.artifact.id}\nArtifact download URL: https://github.com/${pin.repository}/actions/runs/${pin.runId}/artifacts/${pin.artifact.id}`;
  return [structuredClone(pin), run, jobs, artifact, log];
}
test('macOS accepted artifact binding accepts matching completed source and producing job', () => verifyMacCandidate(...fixture()));
test('macOS artifact binding rejects substituted source, build or package identity', () => {
  const mutations = [
    values => { values[1].head_sha = '0'.repeat(40); },
    values => { values[1].repository.full_name = 'another/repository'; },
    values => { values[1].conclusion = 'failure'; },
    values => { values[2][0].name = 'Build (ubuntu-22.04)'; },
    values => { values[2][0].steps[2].conclusion = 'skipped'; },
    values => { values[3].expired = true; },
    values => { values[3].workflow_run.id += 1; },
    values => { values[3].digest = 'sha256:' + '0'.repeat(64); },
    values => { values[4] = ''; },
    values => { values[0].dmg.name = 'Phonton_other.dmg'; },
  ];
  for (const mutate of mutations) { const values = fixture(); mutate(values); assert.throws(() => verifyMacCandidate(...values)); }
});

const identity = { status: 'present', pid: 29305, ppid: 29093, startSeconds: 1791243436, startMicroseconds: 74302,
  exe: '/Users/runner/work/_temp/phonton-macos-cli/phonton' };
const helperResult = (value, status = 0) => ({ status, signal: null, stdout: JSON.stringify(value), stderr: '' });

test('macOS process proof requires native absolute identity and rejects PID, parent, path or lifetime changes', () => {
  assert.deepEqual(parseProcessIdentity(helperResult(identity), identity.pid), identity);
  assertSameProcess(identity, { ...identity });
  for (const [key, value] of [['pid', 29306], ['ppid', 1], ['startSeconds', identity.startSeconds + 1],
    ['startMicroseconds', 74303], ['exe', '/another/phonton']]) {
    assert.throws(() => assertSameProcess(identity, { ...identity, [key]: value }));
  }
  for (const mutate of [value => { value.exe = 'phonton'; }, value => { value.pid++; },
    value => { value.startMicroseconds = 1000000; }, value => { delete value.startSeconds; }]) {
    const value = { ...identity }; mutate(value);
    assert.throws(() => parseProcessIdentity(helperResult(value), identity.pid));
  }
});

test('macOS missing or unreadable process evidence stays unavailable and cannot satisfy identity proof', () => {
  for (const errno of [1, 3, 13]) {
    const unavailable = { status: 'unavailable', stage: 'bsd-before', errno };
    assert.deepEqual(parseProcessIdentity(helperResult(unavailable, 1), identity.pid), { ...unavailable, pid: identity.pid });
    assert.throws(() => assertSameProcess(identity, unavailable));
    assert.throws(() => parseProcessIdentity(helperResult(unavailable, 0), identity.pid));
  }
  assert.throws(() => parseProcessIdentity({ ...helperResult(identity), status: 1 }, identity.pid));
  assert.throws(() => parseProcessIdentity({ ...helperResult(identity), stdout: '{' }, identity.pid));
  assert.throws(() => parseProcessIdentity({ ...helperResult(identity), signal: 'SIGTERM' }, identity.pid));
});

test('native helper resolves a short argv0 to the actual executable and preserves exited PID errors', {
  skip: process.env.PHONTON_TEST_MACOS_IDENTITY !== '1',
}, async () => {
  assert.equal(process.platform, 'darwin');
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  const helper = path.join(process.env.RUNNER_TEMP, 'phonton-process-identity');
  const observe = pid => parseProcessIdentity(spawnSync(helper, [String(pid)], { encoding: 'utf8', timeout: 10000 }), pid);
  const child = spawn('/bin/sleep', ['2'], { argv0: 'phonton', stdio: 'ignore' });
  const completed = once(child, 'exit');
  await once(child, 'spawn');
  try {
    const value = observe(child.pid);
    assert.equal(value.status, 'present');
    assert.equal(value.ppid, process.pid);
    assert.equal(realpathSync(value.exe), realpathSync('/bin/sleep'));
    assertSameProcess(value, observe(child.pid));
  } finally { await completed; }
  const exited = observe(child.pid);
  assert.equal(exited.status, 'unavailable');
  assert.equal(exited.errno, 3, 'ESRCH must remain an observed native error');
});
