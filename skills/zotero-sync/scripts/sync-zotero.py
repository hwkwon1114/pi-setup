#!/usr/bin/env python3
"""Synchronize a project's curated manifest with a personal Zotero collection.

The account, collection, corpus files, PDF root, and workflow tag prefix all come
from a per-project JSON config passed with --config. Paths inside that config are
resolved relative to the config file itself, so the same installed backend serves
any project without editing this script.
"""
import argparse
import contextlib
import hashlib
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

API = 'https://api.zotero.org'
KEYS = ('user_id', 'collection', 'manifest', 'metadata', 'state', 'pdf_root', 'tag_prefix', 'key_file')

try:
    import fcntl
except ImportError:  # pragma: no cover - non-POSIX platforms have no flock
    fcntl = None


def load(path):
    return json.loads(path.read_text())


def save(path, data):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
    temporary.replace(path)


class Config:
    """Validated project configuration; every path is absolute."""

    def __init__(self, path):
        self.path = Path(path).expanduser().resolve()
        try:
            raw = json.loads(self.path.read_text())
        except FileNotFoundError:
            raise RuntimeError('Config file not found: ' + str(self.path)) from None
        except json.JSONDecodeError as error:
            raise RuntimeError(f'Config file is not valid JSON ({error.lineno}:{error.colno}): {self.path}') from None
        if not isinstance(raw, dict):
            raise RuntimeError('Config file must contain a JSON object: ' + str(self.path))
        missing = [key for key in KEYS if key not in raw]
        unknown = sorted(set(raw) - set(KEYS))
        if missing:
            raise RuntimeError('Config missing required keys: ' + ', '.join(missing))
        if unknown:
            raise RuntimeError('Config has unknown keys: ' + ', '.join(unknown))
        text = {}
        for key in KEYS:
            value = raw[key]
            if not isinstance(value, str) or not value.strip():
                raise RuntimeError(f'Config key {key} must be a non-empty string')
            text[key] = value.strip()

        self.user_id = text['user_id']
        if not re.fullmatch(r'\d+', self.user_id):
            raise RuntimeError('Config key user_id must be a numeric Zotero user ID')
        self.collection = text['collection']
        if not re.fullmatch(r'[A-Za-z0-9]+', self.collection):
            raise RuntimeError('Config key collection must be a Zotero collection key')
        self.tag_prefix = text['tag_prefix']
        if re.search(r'\s', self.tag_prefix) or self.tag_prefix.endswith(':'):
            raise RuntimeError('Config key tag_prefix must contain no whitespace and no trailing colon')

        self.manifest = self.resolve(text['manifest'])
        self.metadata = self.resolve(text['metadata'])
        self.state = self.resolve(text['state'])
        self.pdf_root = self.resolve(text['pdf_root'])
        self.key_file = self.resolve(text['key_file'])
        for key, path in (('manifest', self.manifest), ('metadata', self.metadata), ('key_file', self.key_file)):
            if not path.is_file():
                raise RuntimeError(f'Config key {key} does not point at a file: {path}')
        if not self.pdf_root.is_dir():
            raise RuntimeError('Config key pdf_root does not point at a directory: ' + str(self.pdf_root))
        if not self.state.parent.is_dir():
            raise RuntimeError('Config key state has no existing parent directory: ' + str(self.state.parent))
        if self.state.exists() and not self.state.is_file():
            raise RuntimeError('Config key state exists and is not a file: ' + str(self.state))
        for suffix in ('.tmp', '.lock'):
            if self.state.with_name(self.state.name + suffix).is_symlink():
                raise RuntimeError('State temporary and lock files must not be symlinks')
        protected = {self.path, self.manifest, self.metadata, self.key_file}
        outputs = {self.state, self.state.with_name(self.state.name + '.tmp').resolve(),
                   self.state.with_name(self.state.name + '.lock').resolve()}
        if protected.intersection(outputs) or len(outputs) != 3:
            raise RuntimeError('State, temporary, or lock path collides with a protected input')
        if len(protected) != 4:
            raise RuntimeError('Config, manifest, metadata and credential paths must be distinct')

    def resolve(self, value):
        path = Path(value).expanduser()
        return path.resolve() if path.is_absolute() else (self.path.parent / path).resolve()

    def read_key(self):
        key = self.key_file.read_text().strip()
        if not key:
            raise RuntimeError('Empty API key file: ' + str(self.key_file))
        return key


class Lock:
    """Advisory lock guarding one state file against concurrent sync processes."""

    def __init__(self, state_path, exclusive):
        self.path = state_path.with_name(state_path.name + '.lock')
        self.exclusive = exclusive
        self.handle = None

    def __enter__(self):
        if fcntl is None:
            raise RuntimeError('Synchronization requires POSIX file locking; use macOS, Linux, or WSL')
        self.handle = open(self.path, 'a+')
        mode = (fcntl.LOCK_EX if self.exclusive else fcntl.LOCK_SH) | fcntl.LOCK_NB
        try:
            fcntl.flock(self.handle.fileno(), mode)
        except OSError:
            self.handle.close()
            self.handle = None
            raise RuntimeError('Another sync process holds the lock for this state file: ' + str(self.path)) from None
        return self

    def __exit__(self, *_):
        if self.handle is not None:
            fcntl.flock(self.handle.fileno(), fcntl.LOCK_UN)
            self.handle.close()
            self.handle = None
        return False


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError('Redirect refused; credentials and uploads remain origin-bound')


class Client:
    def __init__(self, key):
        self.key = key
        self.pause_until = 0

    def request(self, route, method='GET', data=None, headers=None, binary=False):
        url = API + route
        h = {'Zotero-API-Key': self.key, 'Zotero-API-Version': '3'}
        h.update(headers or {})
        if isinstance(data, (list, dict)):
            data = json.dumps(data).encode()
            h['Content-Type'] = 'application/json'
        if method == 'POST' and route.endswith('/items'):
            h['Zotero-Write-Token'] = uuid.uuid4().hex
        for attempt in range(5):
            time.sleep(max(0, self.pause_until - time.monotonic()))
            try:
                with urllib.request.build_opener(NoRedirect()).open(urllib.request.Request(url, data, h, method=method), timeout=120) as response:
                    self.pause_until = time.monotonic() + float(response.headers.get('Backoff', 0))
                    body = response.read()
                    return body if binary else json.loads(body) if body else None
            except urllib.error.HTTPError as error:
                if error.code not in (429, 503) or attempt == 4:
                    raise RuntimeError(f'Zotero HTTP {error.code}: {method} {route}') from None
                self.pause_until = time.monotonic() + float(error.headers.get('Retry-After', 2 ** (attempt + 1)))
        raise RuntimeError('Request retries exhausted')

    def all(self, route):
        result = []
        start = 0
        while True:
            rows = self.request(f'{route}?limit=100&start={start}')
            result.extend(rows)
            if len(rows) < 100:
                return result
            start += len(rows)

    def create(self, prefix, data):
        result = self.request(prefix + '/items', 'POST', [data])
        if result.get('failed'):
            raise RuntimeError('Zotero rejected item: ' + json.dumps(result['failed']))
        return result['successful']['0']


def title_key(title):
    return re.sub(r'\W+', '', title.casefold())


def identifiers(values):
    result = set()
    for value in values:
        value = urllib.parse.unquote(str(value)).lower()
        for doi in re.findall(r'10\.\d{4,9}/[^\s<>]+', value):
            result.add(doi.rstrip('.,;)'))
        for arxiv in re.findall(r'(?:arxiv[:./ ]+|arxiv\.org/(?:abs|pdf)/)(\d{4}\.\d{4,5})(?:v\d+)?', value):
            result.add('arxiv:' + arxiv)
    return result


def prepare_inputs(config):
    """Validate the complete local scope before any network call or mutation."""
    def records_at(path):
        document = load(path)
        if not isinstance(document, dict) or not isinstance(document.get('records'), list):
            raise RuntimeError('Input requires a records array: ' + str(path))
        rows = document['records']
        ids = []
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get('id'), str) or not row['id'].strip():
                raise RuntimeError('Each record needs a non-empty string id')
            ids.append(row['id'])
        if len(ids) != len(set(ids)):
            raise RuntimeError('Duplicate record id: ' + str(path))
        return rows
    rows = records_at(config.manifest)
    by_id = {r['id']: r for r in rows}
    for row in rows:
        canonical = row.get('canonical_id')
        if not isinstance(canonical, str) or canonical not in by_id or by_id[canonical].get('canonical_id') != canonical:
            raise RuntimeError('Invalid canonical identity: ' + row['id'])
        if not isinstance(row.get('reference_urls', []), list) or not all(isinstance(v, str) for v in row.get('reference_urls', [])):
            raise RuntimeError('reference_urls must be a string array')
    records = [r for r in rows if r['id'] == r['canonical_id']]
    metadata = {}
    for row in records_at(config.metadata):
        data = row.get('data')
        if not isinstance(data, dict) or not isinstance(data.get('title'), str) or not data['title'].strip():
            raise RuntimeError('Metadata requires a non-empty title: ' + row['id'])
        if not isinstance(data.get('itemType'), str) or data['itemType'] in ('attachment', 'note', 'annotation'):
            raise RuntimeError('Metadata must describe a bibliographic parent item')
        if any(k in data for k in ('key', 'version', 'parentItem', 'collections')):
            raise RuntimeError('Metadata contains server identity or collection fields')
        for field in ('DOI', 'url', 'extra', 'date'):
            if field in data and not isinstance(data[field], str):
                raise RuntimeError('Metadata field must be text: ' + field)
        if not isinstance(data.get('creators', []), list) or not all(isinstance(c, dict) for c in data.get('creators', [])):
            raise RuntimeError('Metadata creators must be an array of objects')
        if not isinstance(data.get('tags', []), list) or not all(isinstance(t, dict) and isinstance(t.get('tag'), str) for t in data.get('tags', [])):
            raise RuntimeError('Metadata tags must be Zotero tag objects')
        metadata[row['id']] = data
    if set(metadata) != {r['id'] for r in records}:
        raise RuntimeError('Metadata and canonical manifest coverage differ')
    state = load(config.state) if config.state.exists() else {'user_id': config.user_id, 'collection': config.collection, 'records': {}}
    if not isinstance(state, dict) or str(state.get('user_id')) != config.user_id or state.get('collection') != config.collection:
        raise RuntimeError('Sync state belongs to another account or collection')
    if not isinstance(state.get('records'), dict) or not all(isinstance(e, dict) for e in state['records'].values()):
        raise RuntimeError('Invalid state record mapping')
    mapped = [e['item_key'] for e in state['records'].values() if e.get('item_key')]
    if not all(isinstance(k, str) for k in mapped) or len(mapped) != len(set(mapped)):
        raise RuntimeError('Duplicate or invalid mapped item keys; reconcile identities')
    pdfs = {}
    protected = {config.path, config.manifest, config.metadata, config.key_file, config.state,
                 config.state.with_name(config.state.name + '.tmp').resolve(),
                 config.state.with_name(config.state.name + '.lock').resolve()}
    for row in records:
        local = row.get('local_path')
        if local is None or local == '':
            continue
        if not isinstance(local, str) or Path(local).is_absolute():
            raise RuntimeError('PDF path must be relative to pdf_root: ' + row['id'])
        path = (config.pdf_root / local).resolve()
        if not path.is_relative_to(config.pdf_root) or path in protected:
            raise RuntimeError('PDF path escapes root or collides with protected state: ' + row['id'])
        data = path.read_bytes()
        sha = row.get('sha256')
        if not isinstance(sha, str) or not re.fullmatch(r'[a-fA-F0-9]{64}', sha):
            raise RuntimeError('Missing or invalid PDF SHA-256: ' + row['id'])
        if b'%PDF-' not in data[:1024] or hashlib.sha256(data).hexdigest() != sha.lower():
            raise RuntimeError('Local PDF differs from verified manifest: ' + row['id'])
        # Upload precisely the validated bytes even if a local file changes later.
        pdfs[row['id']] = {'path': path, 'data': data, 'md5': hashlib.md5(data).hexdigest(),
                          'mtime': int(path.stat().st_mtime * 1000)}
    return records, metadata, state, pdfs


def choose_parent(row, data, entry, parents, by_key, marker):
    expected = identifiers(row.get('reference_urls', []) + [data.get('DOI', ''), data.get('url', '')])
    def compatible(item):
        found = identifiers([item['data'].get('DOI', ''), item['data'].get('url', ''), item['data'].get('extra', '')])
        return not expected or not found or bool(expected.intersection(found))
    if entry.get('item_key'):
        item = by_key.get(entry['item_key'])
        if not item or item not in parents or item['data'].get('deleted'):
            raise RuntimeError('Mapped item missing, trashed, or not a bibliography parent')
        if not compatible(item):
            raise RuntimeError('Mapped item identifier conflicts with manifest')
        return item
    matches = [i for i in parents if marker in {t['tag'] for t in i['data'].get('tags', [])} or expected.intersection(identifiers([i['data'].get('DOI', ''), i['data'].get('url', ''), i['data'].get('extra', '')]))]
    if len(matches) > 1:
        raise RuntimeError('Multiple existing bibliography matches; refusing to guess')
    if matches:
        if not compatible(matches[0]):
            raise RuntimeError('Workflow marker matches conflicting identifiers')
        return matches[0]
    titles = [i for i in parents if title_key(i['data'].get('title', '')) == title_key(data['title'])]
    if titles:
        raise RuntimeError('Title-only match requires manual identity reconciliation; no automatic merge')
    return None


def sync(config, dry_run):
    tag = config.tag_prefix
    records, metadata, state, pdfs = prepare_inputs(config)
    client = Client(config.read_key())
    auth = client.request('/keys/current')
    if str(auth['userID']) != config.user_id or not auth['access']['user'].get('write'):
        raise RuntimeError('API key account or write permission mismatch')
    prefix = '/users/' + config.user_id
    client.request(prefix + '/collections/' + config.collection)
    state_path = config.state
    items = client.all(prefix + '/items')
    by_key = {i['key']: i for i in items}
    parents = [i for i in items if i['data']['itemType'] not in ('attachment', 'note', 'annotation')]
    counts = {'created': 0, 'updated': 0, 'uploaded': 0, 'unchanged': 0, 'errors': 0}
    # Resolve the entire parent scope before remote writes, including cross-record reuse.
    plan = {}
    claimed = set()
    local_identities = set()
    for row in records:
        rid = row['id']
        ids = identifiers(row.get('reference_urls', []) + [metadata[rid].get('DOI', ''), metadata[rid].get('url', '')])
        if ids.intersection(local_identities):
            raise RuntimeError('Canonical records share identifiers; reconcile aliases before sync')
        local_identities.update(ids)
        parent = choose_parent(row, metadata[rid], state['records'].get(rid, {}), parents, by_key, tag + ':' + rid)
        if parent and parent['key'] in claimed:
            raise RuntimeError('Multiple canonical records resolve to one remote item')
        if parent:
            claimed.add(parent['key'])
        plan[rid] = parent
    for row in records:
        rid = row['id']
        marker = tag + ':' + rid
        entry = state['records'].get(rid, {})
        try:
            parent = plan[rid]
            status = tag + (':access:local' if row.get('local_path') else ':access:missing')
            if not parent:
                data = dict(metadata[rid])
                tags = list(data.get('tags', []))
                for value in (marker, status):
                    if value not in {t['tag'] for t in tags}:
                        tags.append({'tag': value})
                data.update(collections=[config.collection], tags=tags)
                counts['created'] += 1
                if dry_run:
                    print(rid + ': would create record' + (' and attach PDF' if row.get('local_path') else ''), flush=True)
                    continue
                parent = client.create(prefix, data)
                parents.append(parent)
                by_key[parent['key']] = parent
            else:
                data = parent['data']
                tags = [t for t in data.get('tags', []) if t['tag'] not in (tag + ':access:local', tag + ':access:missing')]
                for value in (marker, status):
                    if value not in {t['tag'] for t in tags}:
                        tags.append({'tag': value})
                collections = list(dict.fromkeys(data.get('collections', []) + [config.collection]))
                if tags != data.get('tags', []) or collections != data.get('collections', []):
                    counts['updated'] += 1
                    if dry_run:
                        print(rid + ': would update collection membership/access tags on ' + parent['key'], flush=True)
                    if not dry_run:
                        client.request(prefix + '/items/' + parent['key'], 'PATCH', {'tags': tags, 'collections': collections}, {'If-Unmodified-Since-Version': str(parent['version'])})
                else:
                    counts['unchanged'] += 1
            entry['item_key'] = parent['key']
            entry['url'] = f'https://www.zotero.org/users/{config.user_id}/items/{parent["key"]}'
            state['records'][rid] = entry
            if not dry_run:
                save(state_path, state)
            if not row.get('local_path'):
                entry.pop('error', None)
                if not dry_run:
                    save(state_path, state)
                print(rid + ': metadata available; PDF missing', flush=True)
                continue
            path = pdfs[rid]['path']
            md5 = pdfs[rid]['md5']
            children = client.all(prefix + '/items/' + parent['key'] + '/children')
            attachment = next((i for i in children if i['key'] == entry.get('attachment_key')), None)
            if entry.get('attachment_key') and not attachment:
                raise RuntimeError('Mapped attachment missing; manual reconciliation required')
            if not attachment:
                attachment = next((i for i in children if i['data'].get('md5') == md5), None)
            if not attachment:
                attachment = next((i for i in children if i['data'].get('filename') == path.name and not i['data'].get('md5')), None)
            if attachment and attachment['data'].get('md5') not in (None, '', md5):
                raise RuntimeError('Mapped attachment changed remotely; preserving it, manual reconciliation required')
            if dry_run:
                print(rid + (': PDF already uploaded' if attachment and attachment['data'].get('md5') == md5 else ': would upload PDF'), flush=True)
                continue
            if not attachment:
                attachment = client.create(prefix, {'itemType': 'attachment', 'parentItem': parent['key'], 'linkMode': 'imported_file', 'title': row.get('version') or 'Full text', 'contentType': 'application/pdf', 'filename': path.name, 'tags': [], 'relations': {}})
            entry['attachment_key'] = attachment['key']
            save(state_path, state)
            file_route = prefix + '/items/' + attachment['key'] + '/file'
            if attachment['data'].get('md5') != md5:
                form = urllib.parse.urlencode({'md5': md5, 'filename': path.name, 'filesize': len(pdfs[rid]['data']), 'mtime': pdfs[rid]['mtime']}).encode()
                upload_headers = {'Content-Type': 'application/x-www-form-urlencoded', 'If-None-Match': '*'}
                authorization = client.request(file_route, 'POST', form, upload_headers)
                if not authorization.get('exists'):
                    if urllib.parse.urlsplit(authorization['url']).scheme != 'https':
                        raise RuntimeError('Non-HTTPS storage upload URL refused')
                    body = authorization['prefix'].encode() + pdfs[rid]['data'] + authorization['suffix'].encode()
                    # Signed storage URL carries its own authorization; never forward the API key.
                    request = urllib.request.Request(authorization['url'], body, {'Content-Type': authorization['contentType']}, method='POST')
                    with urllib.request.build_opener(NoRedirect()).open(request, timeout=180) as response:
                        if response.status != 201:
                            raise RuntimeError('Storage upload did not return 201')
                    client.request(file_route, 'POST', urllib.parse.urlencode({'upload': authorization['uploadKey']}).encode(), upload_headers)
                counts['uploaded'] += 1
            verified = client.request(prefix + '/items/' + attachment['key'])
            if verified['data'].get('md5') != md5:
                raise RuntimeError('Remote attachment checksum mismatch')
            entry.update(sha256=row['sha256'], md5=md5, attachment_verified=True)
            entry.pop('error', None)
            save(state_path, state)
            print(rid + ': PDF verified', flush=True)
        except Exception as error:
            # Do not log arbitrary request URLs or credentials in exception messages.
            message = str(error) if isinstance(error, RuntimeError) else type(error).__name__
            entry['error'] = message
            state['records'][rid] = entry
            counts['errors'] += 1
            if not dry_run:
                save(state_path, state)
            print(rid + ': ERROR ' + message, flush=True)
    print(json.dumps(counts), flush=True)
    if counts['errors']:
        raise SystemExit(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--config', required=True, help='Project sync config JSON; its paths resolve relative to it')
    parser.add_argument('--dry-run', action='store_true', help='Read remote state; do not write or upload')
    args = parser.parse_args()
    with contextlib.ExitStack() as stack:
        try:
            config = Config(args.config)
            stack.enter_context(Lock(config.state, exclusive=not args.dry_run))
        except RuntimeError as error:
            raise SystemExit('sync-zotero: ' + str(error)) from None
        sync(config, args.dry_run)


if __name__ == '__main__':
    main()
