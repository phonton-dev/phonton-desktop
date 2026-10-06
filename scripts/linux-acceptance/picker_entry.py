"""Read-only settlement of a native chooser's location entry."""
import time


def location_matches(observation, expected):
    return (observation['textBefore'] == observation['textAfter'] == expected
            and type(observation['caretOffset']) is int
            and observation['caretOffset'] == len(expected)
            and observation['focused'] is True)


def settled_location(read, expected, retain, seconds=5, now=time.monotonic, pause=time.sleep):
    """Require two fresh matching observations; never rewrite text or invoke Open."""
    deadline = now() + seconds
    matching = 0
    while now() < deadline:
        observation = read()  # Ownership/focus read failures propagate unchanged.
        retain(observation)
        matching = matching + 1 if location_matches(observation, expected) else 0
        if matching == 2:
            return observation
        pause(0.1)
    raise AssertionError('Native location text, caret and focus did not settle')
