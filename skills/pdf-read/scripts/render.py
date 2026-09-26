#!/usr/bin/env python3
"""Render existing PDF pages locally with Poppler; preserve page provenance."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def select_pages(spec, total):
    selected = set()
    for part in spec.split(','):
        if not re.fullmatch(r'\d+(?:-\d+)?', part.strip()):
            raise ValueError('Use comma-separated physical pages/ranges, e.g. 1,3-5')
        bounds = list(map(int, part.strip().split('-')))
        first, last = bounds[0], bounds[-1]
        if not 1 <= first <= last <= total:
            raise ValueError(f'Invalid range {part!r}; PDF has {total} pages')
        selected.update(range(first, last + 1))
    return sorted(selected)


def run(args, timeout):
    # The resolved Poppler executable needs no caller credentials or provider tokens.
    # Use an explicit environment rather than forwarding the agent's entire environment.
    return subprocess.run(args, capture_output=True, text=True, encoding='utf-8',
                          errors='replace', timeout=timeout,
                          env={'LC_ALL': 'C', 'PATH': os.defpath})


def save(out, manifest):
    temp = out / 'manifest.json.tmp'
    temp.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    temp.replace(out / 'manifest.json')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--pages', required=True, help='Physical 1-based pages, e.g. 1,4-6')
    parser.add_argument('--size', type=int, default=2000, help='Longest image dimension in pixels (default 2000)')
    parser.add_argument('--max-pages', type=int, default=20)
    parser.add_argument('--timeout', type=int, default=60, help='Seconds per Poppler subprocess')
    args = parser.parse_args()
    if not 256 <= args.size <= 6000:
        parser.error('size must be between 256 and 6000 pixels')
    if args.max_pages < 1 or args.timeout < 1:
        parser.error('max-pages and timeout must be positive')
    source = args.pdf.expanduser().resolve()
    out = args.out.expanduser().resolve()
    if not source.is_file():
        parser.error('Input must be an existing PDF file')
    tools = {name: shutil.which(name) for name in ('pdfinfo', 'pdftoppm')}
    for tool, executable in tools.items():
        if not executable:
            parser.error(f'Missing dependency: {tool}; no automatic installation performed')
    if out.exists():
        parser.error('Output directory already exists; choose a new directory')
    try:
        original_hash = digest(source)
        info = run([tools['pdfinfo'], str(source)], args.timeout)
        if info.returncode:
            raise ValueError(info.stderr.strip() or 'pdfinfo failed')
        match = re.search(r'^Pages:\s+(\d+)\s*$', info.stdout, re.MULTILINE)
        if not match:
            raise ValueError('Cannot determine PDF page count')
        total = int(match.group(1))
        pages = select_pages(args.pages, total)
        if len(pages) > args.max_pages:
            raise ValueError(f'Selected {len(pages)} pages exceeds --max-pages {args.max_pages}')
        version = run([tools['pdftoppm'], '-v'], args.timeout)
        out.mkdir(parents=True, exist_ok=False)
    except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
        parser.error(str(exc))
    manifest = {
        'schema_version': 1, 'status': 'partial',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'source': str(source), 'source_sha256': original_hash,
        'total_pages': total, 'selected_pages': pages,
        'page_numbering': '1-based physical PDF page index, not printed labels',
        'backend': 'pdftoppm', 'backend_version': (version.stdout + version.stderr).strip(),
        'format': 'png', 'longest_dimension_requested': args.size,
        'ocr_performed': False, 'visually_verified': False,
        'warnings': [info.stderr.strip()] if info.stderr.strip() else [],
        'pages': [], 'errors': [], 'source_unchanged': None,
    }
    (out / 'pdfinfo.txt').write_text(info.stdout, encoding='utf-8')
    save(out, manifest)
    try:
        for page in pages:
            prefix = out / f'page-{page:04d}'
            image = prefix.with_suffix('.png')
            command = [tools['pdftoppm'], '-f', str(page), '-l', str(page), '-singlefile',
                       '-scale-to', str(args.size), '-png', str(source), str(prefix)]
            try:
                result = run(command, args.timeout)
                if result.returncode:
                    raise ValueError(result.stderr.strip() or 'pdftoppm failed')
                with image.open('rb') as f:
                    header = f.read(24)
                if len(header) != 24 or header[:8] != b'\x89PNG\r\n\x1a\n' or header[12:16] != b'IHDR':
                    raise ValueError('Missing or invalid PNG header')
                width, height = struct.unpack('>II', header[16:24])
                manifest['pages'].append({
                    'pdf_page': page, 'path': image.name, 'sha256': digest(image),
                    'width': width, 'height': height, 'command': command,
                    'visually_verified': False,
                    'warnings': [result.stderr.strip()] if result.stderr.strip() else [],
                })
            except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
                manifest['errors'].append({'pdf_page': page, 'error': str(exc)})
                # Partial files, if any, are retained but not listed as successful images.
            save(out, manifest)
    except KeyboardInterrupt:
        manifest['errors'].append({'error': 'Interrupted by user'})
    finally:
        try:
            manifest['source_unchanged'] = digest(source) == original_hash
            if not manifest['source_unchanged']:
                manifest['errors'].append({'error': 'Source changed during rendering; outputs may be inconsistent'})
        except OSError as exc:
            manifest['errors'].append({'error': f'Cannot recheck source: {exc}'})
        if not manifest['errors'] and len(manifest['pages']) == len(pages):
            manifest['status'] = 'complete'
        save(out, manifest)
    print(json.dumps({'status': manifest['status'], 'rendered_pages': len(manifest['pages']),
                      'manifest': str(out / 'manifest.json')}))
    return 0 if manifest['status'] == 'complete' else 1


if __name__ == '__main__':
    sys.exit(main())
