"""Exercise real local reference, header parsing and bounded file inspection."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import shutil
import tempfile
import threading
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

def main():
    screenshots = ROOT / 'browser-checks'
    screenshots.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        shutil.copytree(ROOT / 'dist', Path(temporary) / 'mimecabinet')
        fixture=Path(temporary)/'misleading.jpg'
        fixture.write_bytes(bytes([137,80,78,71,13,10,26,10])+bytes(100000))
        server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=temporary))
        threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch()
                page=browser.new_page(viewport={'width':1280,'height':1000})
                errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
                page.goto(f'http://127.0.0.1:{server.server_port}/mimecabinet/')
                expect(page.locator('#database-status')).to_contain_text('mime-db 1.54.0')
                expect(page.locator('#record')).to_contain_text('image/jpeg')
                page.locator('#query').fill('proposal.docx');page.get_by_role('button',name='Look up',exact=True).click()
                expect(page.locator('#record')).to_contain_text('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
                page.locator('#query').fill('font/');page.get_by_role('button',name='Look up',exact=True).click()
                assert page.locator('#results button').count()>1
                page.locator('#header-value').fill('multipart/form-data; boundary="A;B"')
                page.get_by_role('button',name='Interpret header',exact=True).click()
                expect(page.locator('#header-result')).to_contain_text('A;B')
                page.locator('#header-value').fill('text/plain; x="<img src=x onerror=alert(1)>"')
                page.get_by_role('button',name='Interpret header',exact=True).click()
                expect(page.locator('#header-result')).to_contain_text('<img src=x onerror=alert(1)>')
                assert page.locator('#header-result img').count()==0
                page.locator('#declared').fill('image/png')
                page.locator('#file').set_input_files(str(fixture));page.locator('#inspect').click()
                expect(page.locator('#file-status')).to_contain_text('65,536 bytes inspected locally')
                expect(page.locator('#evidence')).to_contain_text('PNG')
                expect(page.locator('#evidence')).to_contain_text('Different indicators')
                with page.expect_download() as download:page.locator('#save').click()
                receipt=json.loads(Path(download.value.path()).read_text())
                assert receipt['schema']=='coolcode.mimecabinet.v1' and receipt['bytesRead']==65536
                assert receipt['signature']['type']=='image/png' and receipt['file']['size']==100008
                assert len(receipt['hexPreview'].split())==64
                page.screenshot(path=str(screenshots/'desktop.png'),full_page=True)
                page.set_viewport_size({'width':390,'height':844})
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
                page.screenshot(path=str(screenshots/'mobile.png'),full_page=True)
                assert not errors,errors
                browser.close()
            print('Browser checks passed: real database, arbitrary queries, safe header rendering, bounded reads, receipt and mobile layout')
        finally:server.shutdown()
if __name__=='__main__':main()
