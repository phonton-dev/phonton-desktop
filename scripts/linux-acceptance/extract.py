"""Extract a hash-verified candidate into one fresh cloud-runner directory."""
from pathlib import Path, PurePosixPath
import os
import stat
import sys
import zipfile

assert sys.platform == 'linux'
assert os.environ.get('GITHUB_ACTIONS') == 'true'
assert os.environ.get('RUNNER_ENVIRONMENT') == 'github-hosted'
temporary = Path(os.environ['RUNNER_TEMP']).resolve(strict=True)
archive = Path(sys.argv[1]).resolve(strict=True)
destination = Path(sys.argv[2]).resolve()
assert archive.is_relative_to(temporary) and destination.is_relative_to(temporary)
assert destination != temporary and not destination.exists()
with zipfile.ZipFile(archive) as bundle:
    members = bundle.infolist()
    assert len(members) <= 2000
    assert all(member.file_size <= 512 * 1024**2 for member in members)
    assert sum(member.file_size for member in members) <= 4 * 1024**3
    seen = set()
    for member in members:
        path = PurePosixPath(member.filename)
        assert not path.is_absolute() and '..' not in path.parts
        assert '\\' not in member.filename and ':' not in member.filename
        target = destination.joinpath(*path.parts).resolve()
        assert target != destination and target.is_relative_to(destination)
        assert target not in seen, 'Duplicate archive path'
        seen.add(target)
        assert not stat.S_ISLNK(member.external_attr >> 16), 'Do not follow archive links'
    assert bundle.testzip() is None, 'Corrupt candidate ZIP'
    destination.mkdir()
    for member in members:
        target = destination / member.filename
        if member.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as output:
                output.write(bundle.read(member))
print(f'Extracted {len(members)} checked archive entries.')
