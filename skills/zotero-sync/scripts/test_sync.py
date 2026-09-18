"""Offline regression tests; fake credentials and mocked remote library only."""
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('sync_backend', Path(__file__).with_name('sync-zotero.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class Tests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root/'pdfs').mkdir()
        (self.root/'key').write_text('FAKE-TEST-KEY')
        self.manifest = {'records': [{'id': 'P1', 'canonical_id': 'P1', 'reference_urls': []}]}
        self.metadata = {'records': [{'id': 'P1', 'data': {'itemType': 'journalArticle', 'title': 'Example', 'DOI': '10.1234/example', 'tags': [{'tag': 'keep'}]}}]}
        self.raw = {'user_id':'123','collection':'ABCDEFGH','manifest':'manifest.json','metadata':'metadata.json','state':'state.json','pdf_root':'pdfs','tag_prefix':'workflow:test','key_file':'key'}
        self.refresh()

    def refresh(self):
        for name, value in [('manifest.json',self.manifest),('metadata.json',self.metadata),('config.json',self.raw)]:
            (self.root/name).write_text(json.dumps(value))
        self.config = m.Config(self.root/'config.json')

    def pdf(self, local='paper.pdf'):
        content=b'%PDF-1.7\nfixture bytes\n'
        (self.root/'pdfs/paper.pdf').write_bytes(content)
        self.manifest['records'][0].update(local_path=local,sha256=hashlib.sha256(content).hexdigest())
        self.refresh()

    def test_valid_and_alias(self):
        self.manifest['records'].append({'id':'alias','canonical_id':'P1'})
        self.refresh()
        self.assertEqual(len(m.prepare_inputs(self.config)[0]),1)

    def test_duplicate_ids(self):
        for target in [self.manifest,self.metadata]:
            target['records'].append(copy.deepcopy(target['records'][0]));self.refresh()
            with self.assertRaisesRegex(RuntimeError,'Duplicate record id'):m.prepare_inputs(self.config)
            target['records'].pop()

    def test_invalid_alias(self):
        self.manifest['records'][0]['canonical_id']='missing';self.refresh()
        with self.assertRaisesRegex(RuntimeError,'Invalid canonical'):m.prepare_inputs(self.config)

    def test_path_escape(self):
        self.pdf('../key')
        with self.assertRaisesRegex(RuntimeError,'escapes root'):m.prepare_inputs(self.config)

    def test_absolute_path(self):
        self.pdf(str(self.root/'pdfs/paper.pdf'))
        with self.assertRaisesRegex(RuntimeError,'must be relative'):m.prepare_inputs(self.config)

    def test_symlink_escape(self):
        (self.root/'pdfs/link.pdf').symlink_to(self.root/'key')
        self.pdf('link.pdf')
        with self.assertRaisesRegex(RuntimeError,'escapes root'):m.prepare_inputs(self.config)

    def test_hash_and_snapshot(self):
        self.pdf();pdfs=m.prepare_inputs(self.config)[3]
        (self.root/'pdfs/paper.pdf').write_bytes(b'changed')
        self.assertTrue(pdfs['P1']['data'].startswith(b'%PDF'))
        with self.assertRaisesRegex(RuntimeError,'differs from verified'):m.prepare_inputs(self.config)

    def test_state_collision(self):
        self.raw['state']='key'
        with self.assertRaisesRegex(RuntimeError,'collides'):self.refresh()

    def test_title_only_and_conflicting_mapping(self):
        item={'key':'ITEM0001','data':{'itemType':'journalArticle','title':'Example','DOI':'10.1234/other','tags':[]}}
        args=(self.manifest['records'][0],self.metadata['records'][0]['data'])
        with self.assertRaisesRegex(RuntimeError,'Title-only'):m.choose_parent(*args,{},[item],{'ITEM0001':item},'workflow:test:P1')
        with self.assertRaisesRegex(RuntimeError,'identifier conflicts'):m.choose_parent(*args,{'item_key':'ITEM0001'},[item],{'ITEM0001':item},'workflow:test:P1')
        item['data']['DOI']='10.1234/example'
        self.assertEqual(m.choose_parent(*args,{},[item],{'ITEM0001':item},'workflow:test:P1'),item)

    def test_lock(self):
        with m.Lock(self.config.state,True):
            with self.assertRaisesRegex(RuntimeError,'Another sync'): 
                with m.Lock(self.config.state,True):pass

    def test_mock_preview_and_repeat_sync(self):
        class Fake:
            items=[]
            writes=[]
            def __init__(self,key):pass
            def request(self,route,method='GET',data=None,headers=None):
                if route=='/keys/current':return {'userID':123,'access':{'user':{'write':True}}}
                if method!='GET':raise AssertionError('Unexpected write')
                return {}
            def all(self,route):return copy.deepcopy(self.items)
            def create(self,prefix,data):
                self.writes.append(copy.deepcopy(data))
                item={'key':'ITEM0001','version':1,'data':copy.deepcopy(data)}
                self.items.append(item)
                return item
        with patch.object(m,'Client',Fake),redirect_stdout(io.StringIO()):
            m.sync(self.config,True)
            self.assertFalse(self.config.state.exists());self.assertFalse(Fake.writes)
            m.sync(self.config,False)
            self.assertEqual(len(Fake.writes),1)
            self.assertIn({'tag':'keep'},Fake.writes[0]['tags'])
            m.sync(self.config,False)
            self.assertEqual(len(Fake.writes),1)

    def test_redirect_denied(self):
        with self.assertRaisesRegex(RuntimeError,'Redirect refused'):
            m.NoRedirect().redirect_request(None,None,302,'',{},'https://other.example')


if __name__ == '__main__':unittest.main()
