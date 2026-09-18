#!/usr/bin/env python3
"""Local Poppler extraction with immutable source and page-level provenance."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def select_pages(spec, total):
    if not spec:
        return list(range(1, total + 1))
    selected = set()
    for part in spec.split(','):
        if not re.fullmatch(r'\d+(?:-\d+)?', part.strip()):
            raise ValueError('Pages must be comma-separated numbers or ranges, e.g. 1-5,8')
        bounds = list(map(int, part.strip().split('-')))
        first, last = bounds[0], bounds[-1]
        if not 1 <= first <= last <= total:
            raise ValueError(f'Invalid page range {part!r}; PDF contains {total} pages')
        selected.update(range(first, last + 1))
    return sorted(selected)


def run(args, timeout):
    return subprocess.run(args, capture_output=True, text=True, encoding='utf-8',
                          errors='replace', timeout=timeout,
                          env={**os.environ, 'LC_ALL': 'C'})


def write_manifest(out, data):
    temp = out / 'manifest.json.tmp'
    temp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    temp.replace(out / 'manifest.json')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('pdf', type=Path)
    p.add_argument('--out', required=True, type=Path)
    p.add_argument('--pages')
    p.add_argument('--layout', action='store_true')
    p.add_argument('--max-pages', type=int, default=50)
    p.add_argument('--timeout', type=int, default=60, help='Seconds per subprocess')
    a = p.parse_args()
    if a.timeout < 1 or a.max_pages < 1:
        p.error('timeout and max-pages must be positive')
    source = a.pdf.expanduser().resolve(strict=True)
    if not source.is_file():
        p.error('Input must be a file')
    tools = {name: shutil.which(name) for name in ['pdfinfo', 'pdftotext']}
    if not all(tools.values()):
        p.error('Missing Poppler: pdfinfo and pdftotext are required; nothing installed automatically')
    original_hash = digest(source)
    info = run([tools['pdfinfo'], str(source)], a.timeout)
    if info.returncode:
        raise RuntimeError('pdfinfo failed: ' + info.stderr[:1500])
    match = re.search(r'^Pages:\s+(\d+)', info.stdout, re.M)
    if not match:
        raise RuntimeError('Could not determine PDF page count')
    total = int(match[1])
    pages = select_pages(a.pages, total)
    if len(pages) > a.max_pages:
        p.error(f'{len(pages)} pages exceeds --max-pages {a.max_pages}; choose a range or explicitly raise the ceiling')
    version = run([tools['pdftotext'], '-v'], a.timeout)
    out = a.out.expanduser().resolve()
    # Exclusive creation prevents overwriting existing extraction or source data.
    out.mkdir(parents=True, exist_ok=False)
    (out / 'pages').mkdir()
    (out / 'pdfinfo.txt').write_text(info.stdout, encoding='utf-8')
    manifest = {
        'schema_version': 1, 'status': 'partial',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'source': str(source), 'source_sha256': original_hash,
        'total_pages': total, 'selected_pages': pages,
        'page_numbering': '1-based physical PDF page index; not printed labels',
        'backend': 'pdftotext', 'backend_version': (version.stderr or version.stdout).strip(),
        'layout': a.layout, 'ocr_performed': False, 'visually_verified': False,
        'pages': [], 'errors': [],
    }
    write_manifest(out, manifest)
    for page in pages:
        target = out / 'pages' / f'{page:04d}.txt'
        command = [tools['pdftotext'], '-f', str(page), '-l', str(page), '-enc', 'UTF-8', '-nopgbrk']
        if a.layout:
            command.append('-layout')
        command.extend([str(source), str(target)])
        try:
            result = run(command, a.timeout)
            if result.returncode:
                raise RuntimeError(result.stderr[:1500] or f'Exit {result.returncode}')
            text = target.read_text(encoding='utf-8')
            warnings = []
            if len(text.strip()) < 40:
                warnings.append('Sparse text: inspect page; may be a scan, figure, or genuinely sparse page')
            if '\ufffd' in text:
                warnings.append('Unicode replacement characters: inspect font decoding')
            if result.stderr.strip():
                warnings.append(result.stderr.strip()[:1500])
            manifest['pages'].append({'pdf_page': page, 'path': str(target.relative_to(out)),
                                      'sha256': digest(target), 'characters': len(text), 'warnings': warnings})
        except (OSError, subprocess.TimeoutExpired, RuntimeError, UnicodeError) as exc:
            manifest['errors'].append({'pdf_page': page, 'error': str(exc)[:1500]})
        write_manifest(out, manifest)
    if digest(source) != original_hash:
        manifest['errors'].append({'error': 'Source changed during extraction; do not rely on these outputs'})
    manifest['status'] = 'partial' if manifest['errors'] else 'complete'
    write_manifest(out, manifest)
    print(json.dumps({'status': manifest['status'], 'extracted_pages': len(manifest['pages']),
                      'warning_pages': sum(bool(x['warnings']) for x in manifest['pages']),
                      'manifest': str(out / 'manifest.json')}))
    return 1 if manifest['errors'] else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print(f'pdf-extract: {exc}', file=sys.stderr)
        sys.exit(1)
