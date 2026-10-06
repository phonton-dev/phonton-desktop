import unittest
from picker_entry import location_matches, settled_location


class LocationEntryTests(unittest.TestCase):
    fixture = '/home/runner/work/_temp/phonton acceptance fixture'

    def observation(self, **changes):
        expected = self.fixture + '/'
        return dict(textBefore=expected, textAfter=expected, caretOffset=len(expected), focused=True, **changes)

    def run_sequence(self, observations):
        retained, clock = [], [0]

        def read():
            return observations[min(len(retained), len(observations) - 1)]

        def pause(seconds):
            clock[0] += seconds

        result = settled_location(read, self.fixture + '/', retained.append,
                                  seconds=0.6, now=lambda: clock[0], pause=pause)
        return result, retained

    def test_mixed_generation_text_and_caret_cannot_authorize_open(self):
        old = self.observation()
        old.update(textBefore=self.fixture, textAfter=self.fixture, caretOffset=51)
        mixed = self.observation()
        mixed['textBefore'] = self.fixture
        good = self.observation()
        result, retained = self.run_sequence([old, mixed, good, good])
        self.assertEqual(result, good)
        self.assertEqual(len(retained), 4)
        self.assertFalse(location_matches(old, self.fixture + '/'))
        self.assertFalse(location_matches(mixed, self.fixture + '/'))

    def test_nonconsecutive_matching_reads_do_not_settle(self):
        good = self.observation()
        wrong = dict(good, focused=False)
        _, retained = self.run_sequence([good, wrong, good, good])
        self.assertEqual(len(retained), 4)

    def test_wrong_path_caret_or_focus_never_settles(self):
        for changes in [dict(textBefore='/another/', textAfter='/another/'),
                        dict(caretOffset=50), dict(caretOffset=52),
                        dict(textAfter=self.fixture), dict(focused=False)]:
            with self.subTest(changes=changes), self.assertRaisesRegex(AssertionError, 'did not settle'):
                self.run_sequence([dict(self.observation(), **changes)])

    def test_native_ownership_or_read_errors_are_not_retried(self):
        observations = []

        def read():
            raise RuntimeError('Owned chooser changed')

        with self.assertRaisesRegex(RuntimeError, 'Owned chooser changed'):
            settled_location(read, self.fixture + '/', observations.append)
        self.assertEqual(observations, [])


if __name__ == '__main__':
    unittest.main()
