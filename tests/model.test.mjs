import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseContentType,makeIndex,lookup,extensionOf,sniff,evidenceAgreement,inspectBytes,validateConfig} from '../web/model.mjs';
const database=JSON.parse(readFileSync(new URL('../web/data/mime-db.json',import.meta.url)));
const index=makeIndex(database);
const bytes=s=>new TextEncoder().encode(s);

test('finds full media type, bare extension and arbitrary filenames',()=>{
 assert.equal(lookup(index,'IMAGE/JPEG')[0].type,'image/jpeg');
 for(const input of ['docx','.docx','report.DOCX'])assert.equal(lookup(index,input)[0].type,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
 assert.equal(lookup(index,'made-up-no-such-file.extension-that-does-not-exist').length,0);
 assert.ok(lookup(index,'font/').length>1);
});
test('shared extensions keep multiple types, custom additions are searchable',()=>{
 const added=makeIndex({...database,'application/vnd.coolcode.receipt':{extensions:['ccreceipt'],source:'local'}});
 assert.equal(lookup(added,'notes.ccreceipt')[0].type,'application/vnd.coolcode.receipt');
 assert.ok(lookup(index,'.xml').length>1);
 const config=JSON.parse(readFileSync(new URL('../web/config.json',import.meta.url)));config.presets.push({label:'My receipt',query:'.ccreceipt'});assert.equal(validateConfig(config).presets.at(-1).query,'.ccreceipt');
});
test('parses quoted separators and escapes without losing value case',()=>{
 const result=parseContentType('Content-Type: Multipart/Form-Data; boundary="AbC; xyz\\\"q"; charset=UTF-8');
 assert.equal(result.type,'multipart/form-data');assert.equal(result.parameters[0].value,'AbC; xyz"q');assert.equal(result.parameters[1].value,'UTF-8');
});
test('rejects malformed, multiple and oversized headers and CRLF injection',()=>{
 for(const value of ['text/plain\r\nSet-Cookie: x=y','text/*','application','text/plain, application/json','text/plain; x="open','text/plain; =oops','text/plain; x=has space'])assert.throws(()=>parseContentType(value));
 assert.throws(()=>parseContentType('text/plain; x=12345',10));
});
test('reports duplicate parameters, suffix and missing multipart boundary',()=>{
 assert.match(parseContentType('text/plain; charset=utf-8; CHARSET=us-ascii').warnings[0],/Duplicate/);
 assert.equal(parseContentType('application/ld+json').suffix,'json');
 assert.match(parseContentType('multipart/form-data').warnings[0],/boundary/);
 assert.match(parseContentType('application/json; charset=UTF-8').warnings[0],/UTF-8/);
});
test('short inputs cannot become full binary signatures',()=>{
 assert.equal(sniff(new Uint8Array([137,80,78])).type,null);
 assert.equal(sniff(new Uint8Array()).name,'Empty file');
 assert.equal(sniff(bytes('plain text')).type,null);
});
test('recognizes PDF and PNG regardless of misleading filename',()=>{
 assert.equal(sniff(bytes('%PDF-1.7\n')).type,'application/pdf');
 const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0]);
 const result=inspectBytes(png,{name:'holiday.jpg',type:'image/jpeg',size:1000000},index,'image/png');
 assert.equal(result.signature.type,'image/png');assert.equal(result.bytesRead,10);assert.equal(result.file.size,1000000);assert.match(result.comparisons.browser,/Different indicators/);assert.match(result.comparisons.declared,/agrees/);
});
test('does not call a ZIP container a proven Office document',()=>{
 const zip=sniff(new Uint8Array([80,75,3,4]));
 assert.equal(zip.type,'application/zip');assert.match(evidenceAgreement(zip,'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),/subtype remains unverified/);
 assert.match(evidenceAgreement(zip,'application/octet-stream'),/Generic binary/);
});
test('RIFF subtype and ISO brand require structured header evidence',()=>{
 assert.equal(sniff(bytes('RIFF0000WEBP')).type,'image/webp');
 assert.equal(sniff(bytes('RIFF0000WAVE')).type,'audio/wav');
 const avif=new Uint8Array([0,0,0,20,...bytes('ftypavif'),0,0,0,0,...bytes('mif1')]);assert.equal(sniff(avif).type,'image/avif');
 const unknown=new Uint8Array([0,0,0,16,...bytes('ftypisom'),0,0,0,0]);assert.equal(sniff(unknown).type,null);assert.match(sniff(unknown).name,/ISO/);
});
test('BOM is only encoding evidence, with longest match first',()=>{
 const result=sniff(new Uint8Array([255,254,0,0,1]));assert.match(result.name,/UTF-32/);assert.equal(result.type,null);
});
test('configuration rejects unbounded reads and invalid media entries',()=>{
 const config=JSON.parse(readFileSync(new URL('../web/config.json',import.meta.url)));assert.throws(()=>validateConfig({...config,maximumFileHeaderBytes:2**30}));
 assert.throws(()=>makeIndex({'not a type':{extensions:['foo']}}));assert.throws(()=>makeIndex({'application/x-test':{extensions:['<script>']}}));
});
test('extension and agreement remain separate observations',()=>{
 assert.equal(extensionOf('C:\\files\\image.JPEG'),'jpeg');assert.equal(extensionOf('README'),'');assert.match(evidenceAgreement({type:null},'image/png'),/No comparison/);assert.match(evidenceAgreement({type:'image/jpeg'},'image/pjpeg'),/agrees/);
});
