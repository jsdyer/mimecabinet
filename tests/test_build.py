import json
from html.parser import HTMLParser
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build import ROOT, build, metadata


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        shutil.copytree(ROOT / "web", self.root / "web")
        shutil.copyfile(ROOT / "tool.json", self.root / "tool.json")

    def edit(self, **changes):
        tool = json.loads((self.root / "tool.json").read_text())
        tool.update(changes)
        (self.root / "tool.json").write_text(json.dumps(tool))

    def test_build_is_scoped_to_web_and_escapes_metadata(self):
        (self.root / "private.txt").write_text("must not publish")
        self.edit(title='<img src=x onerror="bad()">')
        build(self.root)
        page = (self.root / "dist/index.html").read_text()
        self.assertIn('&lt;img', page)
        self.assertNotIn('<img', page)
        self.assertNotIn('{{', page)
        self.assertIn('href="./style.css"', page)
        self.assertFalse((self.root / "dist/private.txt").exists())
        self.assertTrue((self.root / "dist/.nojekyll").exists())

    def test_url_matches_tool_id(self):
        self.edit(url="/different/")
        with self.assertRaises(ValueError): metadata(self.root)

    def test_browser_access_is_explicit(self):
        self.edit(access="install")
        with self.assertRaisesRegex(ValueError, "immediately usable"):
            metadata(self.root)

    def test_failed_build_keeps_existing_output(self):
        build(self.root)
        existing = (self.root / "dist/index.html").read_bytes()
        self.edit(source="javascript:bad()")
        with self.assertRaises(ValueError): build(self.root)
        self.assertEqual((self.root / "dist/index.html").read_bytes(), existing)

    def test_reference_metadata_matches_bundled_data_and_licence(self):
        data=json.loads((self.root / "web/data/mime-db.json").read_text())
        provenance=json.loads((self.root / "web/data/provenance.json").read_text())
        self.assertEqual(provenance["records"], len(data))
        self.assertIn("Permission is hereby granted", (self.root / "web/data/mime-db-LICENSE.txt").read_text())
        self.assertIn("image/png", data)

    def test_form_labels_and_unique_ids(self):
        class Parser(HTMLParser):
            def __init__(self): super().__init__(); self.ids=[]; self.labels=[]; self.controls=[]
            def handle_starttag(self,tag,attrs):
                a=dict(attrs)
                if "id" in a:self.ids.append(a["id"])
                if tag=="label":self.labels.append(a.get("for"))
                if tag in {"input","textarea","select"}:self.controls.append(a.get("id"))
        parser=Parser();parser.feed((self.root/"web/index.html").read_text())
        self.assertEqual(len(parser.ids),len(set(parser.ids)))
        self.assertTrue(all(control in parser.labels for control in parser.controls))


if __name__ == "__main__": unittest.main()
