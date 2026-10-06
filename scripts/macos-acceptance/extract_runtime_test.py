import io
from pathlib import Path
import tarfile
import tempfile
import unittest
import os
from extract_runtime import checked_members, extract_runtime


def archive_bytes(extra=()):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w:gz') as bundle:
        for name in ['ollama', 'llama-server', 'llama-quantize']:
            entry = tarfile.TarInfo(name)
            entry.mode = 0o755
            entry.size = 4
            bundle.addfile(entry, io.BytesIO(b'test'))
        for entry in extra:
            bundle.addfile(entry, io.BytesIO(b'x' * entry.size) if entry.isfile() else None)
    stream.seek(0)
    return stream


class RuntimeArchiveTests(unittest.TestCase):
    def test_preserves_runtime_files_and_refuses_existing_destination(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / 'runtime.tgz'
            archive.write_bytes(archive_bytes().getvalue())
            target = root / 'payload'
            inventory = extract_runtime(archive, target)
            self.assertEqual(len(inventory), 3)
            self.assertEqual((target / 'ollama').read_bytes(), b'test')
            with self.assertRaisesRegex(ValueError, 'Never overwrite'):
                extract_runtime(archive, target)
            self.assertEqual((target / 'ollama').read_bytes(), b'test')

    def test_rejects_path_escape_aliases_and_special_files_before_extraction(self):
        entries = [tarfile.TarInfo(name) for name in ['../outside', '/outside', 'OLLAMA', './ollama', 'dir/../../outside', 'dir\\outside']]
        device = tarfile.TarInfo('device'); device.type = tarfile.CHRTYPE
        entries.append(device)
        for entry in entries:
            with self.subTest(name=entry.name), tarfile.open(fileobj=archive_bytes([entry]), mode='r:gz') as bundle:
                with self.assertRaises(ValueError): checked_members(bundle)

    def test_rejects_escaping_links_but_accepts_internal_library_alias(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE]:
            for target in ['../outside', '/outside', 'dir/../../outside']:
                entry = tarfile.TarInfo('library'); entry.type = kind; entry.linkname = target
                with self.subTest(kind=kind, target=target), tarfile.open(fileobj=archive_bytes([entry]), mode='r:gz') as bundle:
                    with self.assertRaisesRegex(ValueError, 'link escapes'): checked_members(bundle)
        library = tarfile.TarInfo('libnative.dylib')
        alias = tarfile.TarInfo('libnative.1.dylib'); alias.type = tarfile.SYMTYPE; alias.linkname = library.name
        with tarfile.open(fileobj=archive_bytes([library, alias]), mode='r:gz') as bundle:
            self.assertEqual(len(checked_members(bundle)), 5)

    def test_requires_regular_executable_payloads(self):
        for mode in [0o644, 0o000]:
            with tarfile.open(fileobj=archive_bytes(), mode='r:gz') as bundle:
                bundle.getmembers()[0].mode = mode
                with self.assertRaisesRegex(ValueError, 'regular executable'): checked_members(bundle)

    def test_rejects_resolved_alias_and_unicode_collisions(self):
        alias = tarfile.TarInfo('alias'); alias.type = tarfile.SYMTYPE; alias.linkname = '.'
        child = tarfile.TarInfo('alias/ollama')
        cases = [[alias, child], [tarfile.TarInfo('caf\u00e9'), tarfile.TarInfo('cafe\u0301')],
                 [tarfile.TarInfo('library'), tarfile.TarInfo('library/child')]]
        for entries in cases:
            with self.subTest(names=[entry.name for entry in entries]), tarfile.open(fileobj=archive_bytes(entries), mode='r:gz') as bundle:
                with self.assertRaises(ValueError): checked_members(bundle)

    @unittest.skipIf(os.name == 'nt', 'Actual Darwin/POSIX symlink extraction is checked in cloud')
    def test_extracts_internal_library_alias_chain_without_overwrite(self):
        library = tarfile.TarInfo('libnative.1.0.dylib'); library.size = 4
        alias = tarfile.TarInfo('libnative.1.dylib'); alias.type = tarfile.SYMTYPE; alias.linkname = library.name
        second = tarfile.TarInfo('libnative.dylib'); second.type = tarfile.SYMTYPE; second.linkname = alias.name
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); archive = root / 'runtime.tgz'; target = root / 'payload'
            archive.write_bytes(archive_bytes([library, alias, second]).getvalue())
            inventory = extract_runtime(archive, target)
            self.assertEqual((target / second.name).read_bytes(), b'xxxx')
            self.assertTrue((target / alias.name).is_symlink())
            self.assertEqual(len(inventory), 6)
            self.assertEqual((target / 'ollama').read_bytes(), b'test')


if __name__ == '__main__': unittest.main()
