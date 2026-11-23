import { validateConfig, makeIndex, lookup, parseContentType, inspectBytes } from './model.mjs';
const $ = id => document.getElementById(id);
const el = (tag, text, className) => { const node=document.createElement(tag); if(text!==undefined) node.textContent=text; if(className)node.className=className; return node; };
let config, index=[], matches=[], selected=null, offset=0, inspection=null, generation=0;
function dlRow(dl, key, value) { dl.append(el('dt',key),el('dd',value)); }
function recordView(row) {
  selected=row.type; const area=$('record'); area.replaceChildren(el('p','MEDIA TYPE','kind'),el('h3',row.type));
  const chips=el('div',undefined,'chips'); for(const extension of row.extensions)chips.append(el('span','.'+extension,'chip'));if(!row.extensions.length)chips.append(el('p','No extension recorded.'));
  area.append(chips);const dl=el('dl');
  dlRow(dl,'Reference provenance',row.source);dlRow(dl,'Typical charset',row.charset || 'Not recorded');dlRow(dl,'Usually compressible',row.compressible===null?'Not recorded':row.compressible?'Yes':'No');dlRow(dl,'Top-level family',row.type.split('/')[0]);area.append(dl);
  const note=el('p','Extensions are conventions. This record does not inspect a file or guarantee the format of a response.','note');area.append(note);
  const use=el('button','Interpret this type','quiet');use.type='button';use.addEventListener('click',()=>{$('header-value').value=row.type;interpretHeader();});area.append(use);
  if(row.source==='iana'){const p=el('p'); const link=el('a','Open IANA registration');link.href='https://www.iana.org/assignments/media-types/'+row.type;p.append(link);area.append(p);}
  for(const button of $('results').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.type===selected));
}
function drawMatches() {
  const rows=matches.slice(offset,offset+config.pageSize);$('results').replaceChildren();
  if(!rows.length)$('results').append(el('p','No reference entry matched. A missing entry does not make a valid custom media type invalid.','empty'));
  for(const row of rows){const button=el('button');button.type='button';button.dataset.type=row.type;button.setAttribute('aria-pressed',String(row.type===selected));button.append(el('strong',row.type),el('span',row.extensions.length?row.extensions.map(e=>'.'+e).join(' · '):'No extension recorded'));button.addEventListener('click',()=>recordView(row));$('results').append(button);}
  $('previous').disabled=offset===0;$('next').disabled=offset+config.pageSize>=matches.length;
  $('page-label').textContent=matches.length?`${offset+1}–${Math.min(offset+config.pageSize,matches.length)} of ${matches.length.toLocaleString()}`:'0 records';
}
function search() {
  if(!config){$('lookup-status').textContent='The reference is still loading.';return;}
  try{matches=lookup(index,$('query').value);offset=0;selected=matches[0]?.type || null;drawMatches();if(matches.length)recordView(matches[0]);else $('record').replaceChildren(el('h3','No matching record'),el('p','Try a broader keyword, a bare extension or a concrete media type.'));
  $('lookup-status').textContent=`${matches.length.toLocaleString()} reference ${matches.length===1?'entry':'entries'} matched. Search stays on this device.`;
  }catch(error){$('lookup-status').textContent=error.message+' Previous results are unchanged.';}
}
function interpretHeader() {
  if(!config)return;
  try{const parsed=parseContentType($('header-value').value,config.maximumHeaderCharacters);const area=$('header-result');area.replaceChildren(el('h3',parsed.type));const dl=el('dl');dlRow(dl,'Top-level type',parsed.topLevel);dlRow(dl,'Subtype',parsed.subtype);dlRow(dl,'Structured suffix',parsed.suffix || 'None');dlRow(dl,'Reference entry',index.some(r=>r.type===parsed.type)?'Found in bundled reference':'Not in bundled reference');area.append(dl);
  area.append(el('h4','Parameters'));if(!parsed.parameters.length)area.append(el('p','No parameters supplied.'));else{const params=el('dl');for(const p of parsed.parameters)dlRow(params,p.name,p.value);area.append(params);}
  if(parsed.suffix)area.append(el('p',`The +${parsed.suffix} suffix identifies an underlying representation family. The complete subtype can add its own rules.`));
  for(const warning of parsed.warnings)area.append(el('p',warning,'caution'));
  $('header-status').textContent='Header syntax parsed. This does not validate the actual response body.';
  }catch(error){$('header-status').textContent=error.message+' Previous interpretation is unchanged.';}
}
function evidenceCard(title,value,notes=[]) {const card=el('article');card.append(el('h3',title),el('p',value,'value'));for(const note of notes)card.append(el('p',note,'note'));return card;}
function drawInspection(result){
  $('file-result').hidden=false;$('inspection-title').textContent=`Inspection: ${result.file.name}`;const area=$('evidence');area.replaceChildren();
  area.append(evidenceCard('FILENAME EXTENSION',result.extension?'.'+result.extension:'No extension',[result.extensionTypes.length?result.extensionTypes.join(' · '):'No media type recorded for this extension.',...result.comparisons.extension.map(c=>`${c.type}: ${c.result}`)]));
  area.append(evidenceCard('BROWSER-REPORTED TYPE',result.file.browserType || 'Not supplied',['Usually inferred from the name or operating system; it is not a byte-level identification.',result.comparisons.browser]));
  area.append(evidenceCard('RECOGNIZED FILE HEADER',result.signature.name,[result.signature.type || 'No specific media type established.',result.signature.certainty,'Header patterns do not validate the entire format.']));
  area.append(evidenceCard('DECLARED CONTENT-TYPE',result.declared?.type || 'Not supplied',[result.comparisons.declared,...(result.declared?.warnings || [])]));
  $('hex').textContent=result.hexPreview || '(no bytes)';
  $('file-status').textContent=`${result.file.name} · ${result.file.size.toLocaleString()} bytes total · ${result.bytesRead.toLocaleString()} bytes inspected locally.`;
}
async function inspectFile(){
  const file=$('file').files[0];if(!file||!config)return;const current=++generation;const declared=$('declared').value;$('inspect').disabled=true;$('file-status').textContent='Reading the bounded file header on this device…';
  try {const bytes=new Uint8Array(await file.slice(0,config.maximumFileHeaderBytes).arrayBuffer());if(current!==generation)return;const result=inspectBytes(bytes,{name:file.name,size:file.size,type:file.type},index,declared);inspection=result;drawInspection(result);}
  catch(error){if(current===generation)$('file-status').textContent=error.message+' Previous inspection is unchanged.';}
  finally{if(current===generation)$('inspect').disabled=!$('file').files.length;}
}
function saveInspection(){if(!inspection)return;const url=URL.createObjectURL(new Blob([JSON.stringify(inspection,null,2)+'\n'],{type:'application/json'}));const link=el('a');link.href=url;link.download='mimecabinet-inspection.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('lookup-form').addEventListener('submit',e=>{e.preventDefault();search();});$('header-form').addEventListener('submit',e=>{e.preventDefault();interpretHeader();});
$('previous').addEventListener('click',()=>{offset=Math.max(0,offset-config.pageSize);drawMatches();});$('next').addEventListener('click',()=>{offset+=config.pageSize;drawMatches();});
$('file').addEventListener('change',()=>{generation++;$('inspect').disabled=!config||!$('file').files.length;$('file-status').textContent=$('file').files.length?'File selected. Choose Inspect file header to read its first bytes.':'No file selected. Previous inspection is retained.';});
$('inspect').addEventListener('click',inspectFile);$('save').addEventListener('click',saveInspection);
async function loadJson(path){const response=await fetch(path);if(!response.ok)throw new Error(`Could not load ${path}.`);return response.json();}
try{
  const [settings,database,provenance]=await Promise.all([loadJson('./config.json'),loadJson('./data/mime-db.json'),loadJson('./data/provenance.json')]);config=validateConfig(settings);index=makeIndex({...database,...config.customTypes});
  $('database-status').textContent=`${index.length.toLocaleString()} media types · mime-db ${provenance.version} · captured ${provenance.retrievedAt}`;
  $('read-limit').textContent=`At most ${config.maximumFileHeaderBytes.toLocaleString()} bytes are read. The first bytes are compared with a small, documented collection of format patterns. ZIP, Ogg and ISO media containers can hold several formats. Archives are not extracted, content is not executed, and unknown signatures stay unknown.`;
  for(const id of ['query','header-value','declared'])$(id).maxLength=config.maximumHeaderCharacters;
  for(const preset of config.presets){const button=el('button',preset.label);button.type='button';button.addEventListener('click',()=>{$('query').value=preset.query;search();});$('presets').append(button);}
  $('query').value=config.defaultQuery;$('header-value').value='application/ld+json; charset=utf-8';search();interpretHeader();$('inspect').disabled=!$('file').files.length;
}catch(error){$('database-status').textContent='The local reference could not load.';$('lookup-status').textContent=error.message+' Reload to try again.';$('inspect').disabled=true;}
