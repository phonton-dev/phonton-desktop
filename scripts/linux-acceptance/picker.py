"""Operate one real GTK chooser belonging to the independently identified app."""
from pathlib import Path
import json
import os
import subprocess
import sys
import time
import gi

assert sys.platform == 'linux' and os.environ.get('GITHUB_ACTIONS') == 'true'
assert os.environ.get('RUNNER_ENVIRONMENT') == 'github-hosted'
gi.require_version('Atspi', '2.0')
from gi.repository import Atspi

pid = int(sys.argv[1])
action = sys.argv[2]
fixture = Path(sys.argv[3]).resolve(strict=True)
report_path = Path(sys.argv[4])
assert pid > 0 and action in ('cancel', 'select')
assert fixture.is_relative_to(Path(os.environ['RUNNER_TEMP']).resolve(strict=True))
assert not report_path.exists()
report = {'schema': 1, 'status': 'running', 'appPid': pid, 'action': action, 'fixture': str(fixture)}


def save():
    report_path.write_text(json.dumps(report, indent=2) + '\n')


def walk(root):
    queue = [(root, 0)]
    count = 0
    while queue:
        node, depth = queue.pop(0)
        if node is None:
            continue
        count += 1
        assert count <= 2500 and depth <= 24, 'Unexpected accessibility tree size'
        yield node
        queue.extend((node.get_child_at_index(index), depth + 1) for index in range(node.get_child_count()))


def showing(node):
    states = node.get_state_set()
    return states.contains(Atspi.StateType.SHOWING) and states.contains(Atspi.StateType.ENABLED)


def dialogs():
    desktop = Atspi.get_desktop(0)
    applications = [desktop.get_child_at_index(i) for i in range(desktop.get_child_count())]
    owned = [app for app in applications if app.get_process_id() == pid]
    return [node for app in owned for node in walk(app)
            if node.get_name() == 'Open repository' and
            node.get_role() in (Atspi.Role.DIALOG, Atspi.Role.FILE_CHOOSER) and showing(node)]


def wait(check, label, seconds=40):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        result = check()
        if result:
            return result
        time.sleep(0.2)
    raise AssertionError('Timed out: ' + label)


def click_button(dialog, label):
    buttons = [node for node in walk(dialog) if node.get_role() == Atspi.Role.PUSH_BUTTON
               and node.get_name().replace('_', '').lower() == label and showing(node)]
    assert len(buttons) == 1, f'Expected one enabled {label} button'
    button = buttons[0]
    assert button.get_process_id() == pid
    interface = button.get_action_iface()
    actions = [i for i in range(interface.get_n_actions()) if interface.get_action_name(i) in ('click', 'press', 'activate')]
    assert len(actions) == 1, 'Expected one native button action'
    report['invokedButton'] = {'name': button.get_name(), 'pid': button.get_process_id(), 'action': interface.get_action_name(actions[0])}
    save()
    assert interface.do_action(actions[0])


try:
    assert not dialogs(), 'A chooser was already open before the test'
    save()
    report_path.with_suffix('.ready.json').write_text(json.dumps({'appPid': pid, 'ready': True}))
    matches = wait(dialogs, 'owned GTK repository chooser')
    assert len(matches) == 1, 'Ambiguous repository chooser'
    dialog = matches[0]
    assert dialog.get_process_id() == pid
    report['dialog'] = {'name': dialog.get_name(), 'role': dialog.get_role_name(), 'pid': pid}
    # xdotool only opens the real GTK location-entry UI. The path itself is set
    # through that visible entry's accessibility interface, never app storage.
    if action == 'select':
        windows = subprocess.check_output(['xdotool', 'search', '--onlyvisible', '--pid', str(pid), '--name', '^Open repository$'], text=True, timeout=10).split()
        assert len(windows) == 1
        subprocess.run(['xdotool', 'windowactivate', '--sync', windows[0]], check=True, timeout=10)
        subprocess.run(['xdotool', 'key', '--clearmodifiers', 'ctrl+l'], check=True, timeout=10)
        def entries():
            return [node for node in walk(dialog) if showing(node) and node.is_editable_text()]
        editors = wait(entries, 'GTK location entry')
        assert len(editors) == 1, 'Ambiguous editable location entry'
        assert editors[0].get_process_id() == pid
        assert editors[0].get_editable_text_iface().set_text_contents(str(fixture))
        report['enteredDirectory'] = editors[0].get_text_iface().get_text(0, -1)
        assert report['enteredDirectory'] == str(fixture)
    report['controls'] = [{'name': node.get_name(), 'role': node.get_role_name()}
                          for node in walk(dialog) if showing(node) and node.get_role() in (Atspi.Role.PUSH_BUTTON, Atspi.Role.ENTRY, Atspi.Role.TEXT)]
    save()
    subprocess.run(['import', '-window', 'root', str(report_path.with_suffix('.png'))], check=True, timeout=15)
    click_button(dialog, 'cancel' if action == 'cancel' else 'open')
    wait(lambda: not dialogs(), 'chooser closes after native action')
    report.update(status='passed', closed=True)
    save()
except Exception as error:
    report.update(status='failed', error=str(error))
    save()
    raise
