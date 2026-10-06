"""Operate one real GTK chooser belonging to the independently identified app."""
from pathlib import Path
import json
import os
import subprocess
import sys
import time
import gi
from picker_entry import location_matches, settled_location

assert sys.platform == 'linux' and os.environ.get('GITHUB_ACTIONS') == 'true'
assert os.environ.get('RUNNER_ENVIRONMENT') == 'github-hosted'
gi.require_version('Atspi', '2.0')
from gi.repository import Atspi, GLib

pid = int(sys.argv[1])
action = sys.argv[2]
fixture = Path(sys.argv[3]).resolve(strict=True)
report_path = Path(sys.argv[4])
assert pid > 0 and action in ('cancel', 'select')
assert fixture.is_relative_to(Path(os.environ['RUNNER_TEMP']).resolve(strict=True))
assert not report_path.exists()
report = {'schema': 1, 'status': 'running', 'appPid': pid, 'action': action, 'fixture': str(fixture)}


def app_identity():
    stat = Path(f'/proc/{pid}/stat')
    before = stat.read_text().rsplit(')', 1)[1].split()
    executable = os.readlink(f'/proc/{pid}/exe')
    after = stat.read_text().rsplit(')', 1)[1].split()
    assert before[19] == after[19] and after[0] not in ('Z', 'X'), 'App lifetime changed'
    return {'pid': pid, 'startTime': after[19], 'exe': executable}


original_app = app_identity()
report['originalApp'] = original_app


def save():
    report_path.write_text(json.dumps(report, indent=2) + '\n')


def walk(root, refresh=False):
    if refresh:
        # clear_cache recursively clears descendants as well.
        root.clear_cache()
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


def owned_applications(refresh=False):
    desktop = Atspi.get_desktop(0)
    if refresh:
        desktop.clear_cache()
    applications = [desktop.get_child_at_index(i) for i in range(desktop.get_child_count())]
    return [app for app in applications if app is not None and app.get_process_id() == pid]


def dialogs(owned=None, refresh=False):
    if owned is None:
        owned = owned_applications(refresh)
    return [node for app in owned for node in walk(app, refresh)
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


def enabled_button(dialog, label):
    buttons = [node for node in walk(dialog) if node.get_role() == Atspi.Role.PUSH_BUTTON
               and node.get_name().replace('_', '').lower() == label and showing(node)]
    assert len(buttons) <= 1, f'Ambiguous enabled {label} button'
    return buttons[0] if buttons else None


def click_button(dialog, label, before_action=None):
    button = wait(lambda: enabled_button(dialog, label), f'enabled native {label} button')
    assert button.get_process_id() == pid
    interface = button.get_action_iface()
    actions = [i for i in range(interface.get_n_actions()) if interface.get_action_name(i) in ('click', 'press', 'activate')]
    assert len(actions) == 1, 'Expected one native button action'
    if before_action:
        before_action()
    report['invokedButton'] = {'name': button.get_name(), 'pid': button.get_process_id(), 'action': interface.get_action_name(actions[0])}
    save()
    assert interface.do_action(actions[0])


def chooser_closed():
    # A destroyed accessible during dialog teardown is not proof of closure.
    # Retry only that observed error, then require fresh AX plus X11 absence
    # while the same native app lifetime remains alive.
    assert app_identity() == original_app, 'App exited or was replaced during chooser action'
    try:
        owned = owned_applications(refresh=True)
        assert len(owned) <= 1, 'Ambiguous owned accessible application'
        if not owned:
            return False
        matches = dialogs(owned, refresh=True)
    except GLib.GError as error:
        if error.domain != 'atspi_error' or error.code != 0 or error.message != 'The application no longer exists':
            raise
        report['staleCloseObservations'] = report.get('staleCloseObservations', 0) + 1
        report['lastStaleCloseError'] = {'domain': error.domain, 'code': error.code, 'message': error.message}
        save()
        return False
    windows = subprocess.run(['xdotool', 'search', '--all', '--onlyvisible', '--pid', str(pid), '--name', '^Open repository$'],
                             capture_output=True, text=True, timeout=10)
    assert windows.returncode in (0, 1) and not windows.stderr, 'Cannot independently observe chooser windows'
    report['closeObservation'] = {'nativeApp': app_identity(), 'ownedApplications': len(owned),
                                  'accessibleDialogs': len(matches), 'nativeWindows': windows.stdout.split()}
    assert report['closeObservation']['nativeApp'] == original_app
    save()
    return not matches and windows.returncode == 1 and not windows.stdout.strip()


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
        # xdotool defaults to OR: require both the owned PID and exact title.
        windows = subprocess.check_output(['xdotool', 'search', '--all', '--onlyvisible', '--pid', str(pid), '--name', '^Open repository$'], text=True, timeout=10).split()
        report['matchingWindows'] = windows
        save()
        assert len(windows) == 1, f'Expected one owned visible chooser, found {windows}'
        window = windows[0]
        window_pid = int(subprocess.check_output(['xdotool', 'getwindowpid', window], text=True, timeout=10).strip())
        window_name = subprocess.check_output(['xdotool', 'getwindowname', window], text=True, timeout=10).strip()
        assert window_pid == pid and window_name == 'Open repository', 'Native window ownership/title changed'
        report['nativeWindow'] = {'id': window, 'pid': window_pid, 'name': window_name}
        save()
        subprocess.run(['xdotool', 'windowactivate', '--sync', window], check=True, timeout=10)
        active = subprocess.check_output(['xdotool', 'getactivewindow'], text=True, timeout=10).strip()
        assert active == window, 'Repository chooser did not retain keyboard focus'
        # A fresh GTK chooser starts in Recent, which has no selected directory.
        # Use its standard Home navigation before opening the location entry.
        subprocess.run(['xdotool', 'key', '--clearmodifiers', 'alt+Home'], check=True, timeout=10)
        home_button = wait(lambda: enabled_button(dialog, 'open'), 'folder navigation enables Open')
        assert home_button.get_process_id() == pid
        report['navigation'] = {'key': 'alt+Home', 'openEnabledBeforeLocation': True, 'pid': pid}
        save()
        assert subprocess.check_output(['xdotool', 'getactivewindow'], text=True, timeout=10).strip() == window
        subprocess.run(['xdotool', 'key', '--clearmodifiers', 'ctrl+l'], check=True, timeout=10)
        def entries():
            return [node for node in walk(dialog) if showing(node) and 'EditableText' in node.get_interfaces()]
        editors = wait(entries, 'GTK location entry')
        assert len(editors) == 1, 'Ambiguous editable location entry'
        assert editors[0].get_process_id() == pid
        report['locationEntry'] = {'name': editors[0].get_name(), 'role': editors[0].get_role_name(), 'interfaces': list(editors[0].get_interfaces()), 'pid': pid}
        save()
        # GTK completes directory names asynchronously, including their slash.
        # Enter that exact directory spelling once, then only observe settlement.
        location = str(fixture) + '/'
        report['requestedLocation'] = location
        assert editors[0].get_editable_text_iface().set_text_contents(location)
        text = editors[0].get_text_iface()
        # EditableText replacement leaves the caret at zero. GTK derives its
        # filename completion state from the text preceding the caret.
        assert text.set_caret_offset(len(location))

        def read_location():
            assert app_identity() == original_app, 'App lifetime changed during location entry'
            assert subprocess.check_output(['xdotool', 'getactivewindow'], text=True, timeout=10).strip() == window
            current = dialogs(refresh=True)
            assert len(current) == 1 and current[0].get_process_id() == pid, 'Owned chooser changed'
            entries_now = [node for node in walk(current[0]) if showing(node) and 'EditableText' in node.get_interfaces()]
            assert len(entries_now) == 1 and entries_now[0].get_process_id() == pid, 'Owned location entry changed'
            entry = entries_now[0]
            interface = entry.get_text_iface()
            before_text = interface.get_text(0, -1)
            caret = interface.get_caret_offset()
            after_text = interface.get_text(0, -1)
            entry.clear_cache()
            observation = {'textBefore': before_text, 'caretOffset': caret, 'textAfter': after_text,
                           'focused': entry.get_state_set().contains(Atspi.StateType.FOCUSED)}
            assert app_identity() == original_app, 'App lifetime changed during location read'
            return observation

        def retain_location(observation):
            report.setdefault('locationObservations', []).append(observation)
            save()

        settled = settled_location(read_location, location, retain_location)
        report['enteredLocation'] = settled['textAfter']
        report['enteredDirectory'] = str(Path(report['enteredLocation']).resolve(strict=True))
        assert report['enteredDirectory'] == str(fixture)
        report['caretOffset'] = settled['caretOffset']

        def location_before_open():
            observation = read_location()
            report['locationBeforeOpen'] = observation
            save()
            assert location_matches(observation, location), 'Location changed before Open'

        wait(lambda: enabled_button(dialog, 'open'), 'Open enabled for entered directory')
    report['controls'] = [{'name': node.get_name(), 'role': node.get_role_name(),
                           'enabled': node.get_state_set().contains(Atspi.StateType.ENABLED)}
                          for node in walk(dialog) if node.get_state_set().contains(Atspi.StateType.SHOWING) and
                          node.get_role() in (Atspi.Role.PUSH_BUTTON, Atspi.Role.ENTRY, Atspi.Role.TEXT)]
    save()
    subprocess.run(['import', '-window', 'root', str(report_path.with_suffix('.png'))], check=True, timeout=15)
    click_button(dialog, 'cancel' if action == 'cancel' else 'open', location_before_open if action == 'select' else None)
    wait(chooser_closed, 'chooser closes while the same app remains alive')
    report.update(status='passed', closed=True)
    save()
except Exception as error:
    report.update(status='failed', error=str(error))
    save()
    raise
