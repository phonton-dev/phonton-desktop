"""Extract an already hash-verified Darwin runtime into a new cloud-only directory."""
from pathlib import Path, PurePosixPath
import json
import posixpath
import sys
import tarfile
import unicodedata


def collision_key(value):
    return unicodedata.normalize('NFC', str(PurePosixPath(value))).casefold()


def checked_members(bundle):
    members = bundle.getmembers()
    if not 0 < len(members) <= 2048 or sum(item.size for item in members) > 3 * 1024**3:
        raise ValueError('Unexpected runtime archive size')
    seen = {}
    for item in members:
        path = PurePosixPath(item.name)
        if (path.is_absolute() or '..' in path.parts or '\\' in item.name
                or any(ord(char) < 32 for char in item.name)
                or not (item.isfile() or item.isdir() or item.issym() or item.islnk())):
            raise ValueError('Unsafe runtime archive entry')
        key = collision_key(path)
        if key in seen or (key == '.' and not item.isdir()):
            raise ValueError('Duplicate or aliased runtime archive entry')
        seen[key] = item
        if item.issym() or item.islnk():
            link = PurePosixPath(item.linkname)
            target = posixpath.normpath(str(path.parent / link) if item.issym() else str(link))
            if (link.is_absolute() or target == '..' or target.startswith('../')
                    or '\\' in item.linkname or any(ord(char) < 32 for char in item.linkname)):
                raise ValueError('Runtime archive link escapes destination')
    # A lexical child of a link can alias an earlier destination even while it
    # remains inside the extraction root. No archive entry may traverse a file
    # or link; library aliases themselves must resolve to validated regular files.
    for item in members:
        for ancestor in PurePosixPath(item.name).parents:
            parent = seen.get(collision_key(ancestor))
            if parent is not None and not parent.isdir():
                raise ValueError('Runtime archive member descends through a non-directory')
        if item.issym() or item.islnk():
            visited = set()
            current = item
            while current.issym() or current.islnk():
                key = collision_key(current.name)
                if key in visited:
                    raise ValueError('Cyclic runtime library alias')
                visited.add(key)
                relative = PurePosixPath(current.name).parent / current.linkname if current.issym() else PurePosixPath(current.linkname)
                target = seen.get(collision_key(posixpath.normpath(str(relative))))
                if target is None:
                    raise ValueError('Missing runtime library alias target')
                current = target
            if not current.isfile():
                raise ValueError('Runtime library alias must resolve to a regular file')
    # These exact root entries are established by the pinned upstream package script.
    for executable in ['ollama', 'llama-server', 'llama-quantize']:
        matches = [item for item in members if str(PurePosixPath(item.name)) == executable]
        if len(matches) != 1 or not matches[0].isfile() or not matches[0].mode & 0o100:
            raise ValueError('Missing regular executable: ' + executable)
    return members


def extract_runtime(archive, destination):
    destination = Path(destination)
    if destination.exists():
        raise ValueError('Never overwrite an existing runtime directory')
    with tarfile.open(archive, 'r:gz') as bundle:
        members = checked_members(bundle)
        # The standard data filter additionally checks resolved link destinations
        # while extracting. Any failure leaves evidence; no payload is executed.
        destination.mkdir()
        bundle.extractall(destination, members=members, filter='data')
    root = destination.resolve()
    inventory = []
    for entry in sorted(root.rglob('*')):
        if not entry.resolve().is_relative_to(root):
            raise ValueError('Extracted runtime escapes destination')
        inventory.append({'path': entry.relative_to(root).as_posix(),
                          'type': 'link' if entry.is_symlink() else 'directory' if entry.is_dir() else 'file'})
    return inventory


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Expected archive and new destination')
    print(json.dumps(extract_runtime(sys.argv[1], sys.argv[2])))
