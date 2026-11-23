const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const MEDIA = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function validateConfig(value) {
  if (!value || !Number.isInteger(value.pageSize) || value.pageSize < 1 || value.pageSize > 100 || !Number.isInteger(value.maximumFileHeaderBytes) || value.maximumFileHeaderBytes < 512 || value.maximumFileHeaderBytes > 1048576 || !Number.isInteger(value.maximumHeaderCharacters) || value.maximumHeaderCharacters < 100 || value.maximumHeaderCharacters > 65536 || !Array.isArray(value.presets) || value.presets.some(p => typeof p.label !== 'string' || typeof p.query !== 'string') || typeof value.defaultQuery !== 'string') throw new Error('The app configuration is invalid.');
  if (value.customTypes && (typeof value.customTypes !== 'object' || Array.isArray(value.customTypes))) throw new Error('customTypes must be an object.');
  return value;
}

export function parseContentType(input, limit = 8192) {
  if (typeof input !== 'string' || input.length > limit) throw new Error(`Use a Content-Type value of at most ${limit} characters.`);
  if (/[\x00-\x08\x0A-\x1F\x7F]/.test(input)) throw new Error('Use one header value without line breaks or control characters.');
  const value = input.trim().replace(/^content-type\s*:\s*/i, '');
  const pieces = []; let piece = '', quoted = false, escaped = false;
  for (const c of value) {
    if (escaped) { piece += c; escaped = false; continue; }
    if (quoted && c === '\\') { piece += c; escaped = true; continue; }
    if (c === '"') quoted = !quoted;
    if (c === ';' && !quoted) { pieces.push(piece.trim()); piece = ''; } else piece += c;
  }
  if (quoted || escaped) throw new Error('The quoted parameter value is not closed.');
  pieces.push(piece.trim());
  const type = pieces.shift().toLowerCase();
  if (!MEDIA.test(type) || type.includes('*')) throw new Error('Use a concrete media type, such as application/json or text/html.');
  const parameters = [], warnings = [];
  for (const field of pieces) {
    if (!field) { warnings.push('An empty parameter was ignored.'); continue; }
    const equal = field.indexOf('=');
    if (equal < 1) throw new Error(`A parameter needs a name and value: ${field.slice(0, 80)}`);
    const name = field.slice(0, equal).trim().toLowerCase(), raw = field.slice(equal + 1).trim();
    if (!TOKEN.test(name)) throw new Error('A parameter name is invalid.');
    let parsed;
    if (raw.startsWith('"')) {
      if (!/^"(?:[^"\\]|\\[\t\x20-\x7E])*"$/.test(raw)) throw new Error('A quoted parameter contains invalid characters.');
      parsed = raw.slice(1, -1).replace(/\\(.)/g, '$1');
    } else {
      if (!TOKEN.test(raw)) throw new Error('Unquoted parameter values must be tokens; quote values containing spaces.');
      parsed = raw;
    }
    if (parameters.some(p => p.name === name)) warnings.push(`Duplicate ${name} parameter: interpretation can differ between consumers.`);
    parameters.push({ name, value: parsed });
  }
  const [topLevel, subtype] = type.split('/');
  const suffix = subtype.includes('+') ? subtype.slice(subtype.lastIndexOf('+') + 1) : null;
  if (topLevel === 'multipart' && !parameters.some(p => p.name === 'boundary' && p.value)) warnings.push('Multipart bodies require a nonempty boundary parameter.');
  if ((type === 'application/json' || suffix === 'json') && parameters.some(p => p.name === 'charset')) warnings.push('JSON interchange uses UTF-8; application/json defines no charset parameter.');
  return { type, topLevel, subtype, suffix, parameters, warnings };
}

export function extensionOf(name) {
  const base = String(name).split(/[\\/]/).pop().toLowerCase();
  const index = base.lastIndexOf('.');
  return index >= 0 && index < base.length - 1 ? base.slice(index + 1) : '';
}

export function makeIndex(database) {
  if (!database || typeof database !== 'object' || Array.isArray(database)) throw new Error('The media-type reference is invalid.');
  for (const [type, data] of Object.entries(database)) {
    if (!MEDIA.test(type) || type.includes('*') || !data || typeof data !== 'object' || (data.extensions && (!Array.isArray(data.extensions) || data.extensions.some(e => typeof e !== 'string' || !/^[a-z0-9][a-z0-9._+-]*$/.test(e))))) throw new Error('A media-type entry is invalid.');
  }
  return Object.entries(database).map(([type, data]) => ({ type, extensions: data.extensions || [], source: data.source || 'Not recorded', charset: data.charset || null, compressible: typeof data.compressible === 'boolean' ? data.compressible : null })).sort((a,b) => a.type.localeCompare(b.type));
}

export function lookup(index, input) {
  let query = String(input).trim().toLowerCase();
  if (!query) return index;
  if (query.includes(';') || /^content-type\s*:/.test(query)) query = parseContentType(query).type;
  const exact = index.filter(row => row.type === query);
  if (exact.length) return exact;
  const fileLike = query.startsWith('.') || (!query.includes('/') && query.includes('.'));
  const ext = fileLike ? extensionOf(query) : query;
  const extensionMatches = index.filter(row => row.extensions.includes(ext));
  if (extensionMatches.length) return extensionMatches;
  if (fileLike) return [];
  return index.filter(row => row.type.includes(query) || row.extensions.some(e => e.includes(query)));
}

const starts = (bytes, numbers, offset = 0) => bytes.length >= offset + numbers.length && numbers.every((v,i) => bytes[offset+i] === v);
const ascii = (bytes, text, offset = 0) => starts(bytes, Array.from(text, c => c.charCodeAt(0)), offset);
const SIGNATURES = [
  ['PNG', 'image/png', [137,80,78,71,13,10,26,10]],
  ['JPEG', 'image/jpeg', [255,216,255]],
  ['GIF87a', 'image/gif', 'GIF87a'], ['GIF89a', 'image/gif', 'GIF89a'],
  ['PDF', 'application/pdf', '%PDF-'],
  ['ZIP container', 'application/zip', [80,75,3,4]], ['Empty ZIP container', 'application/zip', [80,75,5,6]], ['Spanned ZIP container', 'application/zip', [80,75,7,8]],
  ['gzip', 'application/gzip', [31,139,8]],
  ['7-Zip', 'application/x-7z-compressed', [55,122,188,175,39,28]],
  ['RAR 4', 'application/vnd.rar', [82,97,114,33,26,7,0]], ['RAR 5', 'application/vnd.rar', [82,97,114,33,26,7,1,0]],
  ['TIFF, little-endian', 'image/tiff', [73,73,42,0]], ['TIFF, big-endian', 'image/tiff', [77,77,0,42]],
  ['Icon container', 'image/vnd.microsoft.icon', [0,0,1,0]],
  ['Ogg container', 'application/ogg', 'OggS'], ['FLAC', 'audio/flac', 'fLaC'], ['ID3 audio tag', 'audio/mpeg', 'ID3'],
  ['WOFF font', 'font/woff', 'wOFF'], ['WOFF2 font', 'font/woff2', 'wOF2'],
  ['SQLite database', 'application/vnd.sqlite3', 'SQLite format 3\0'],
  ['ELF executable/object', 'application/x-elf', [127,69,76,70]],
  ['DOS MZ header', 'application/x-msdownload', 'MZ'], ['WebAssembly', 'application/wasm', [0,97,115,109]],
];

export function sniff(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error('Expected bytes.');
  if (!bytes.length) return { name:'Empty file', type:null, certainty:'No bytes to inspect', container:false };
  if (ascii(bytes, 'RIFF') && bytes.length >= 12) {
    for (const [brand,name,type] of [['WEBP','WebP','image/webp'],['WAVE','WAVE','audio/wav'],['AVI ','AVI','video/x-msvideo']]) if (ascii(bytes,brand,8)) return { name, type, certainty:'Recognized header pattern', container:true };
  }
  if (bytes.length >= 16 && ascii(bytes, 'ftyp', 4)) {
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
    if (size >= 16 && size <= bytes.length && size % 4 === 0) {
      const brands = [String.fromCharCode(...bytes.slice(8,12))];
      for (let i=16;i<size;i+=4) brands.push(String.fromCharCode(...bytes.slice(i,i+4)));
      const avif = brands.some(b=>['avif','avis'].includes(b)), heic = brands.some(b=>['heic','heix','hevc','hevx'].includes(b)), heif = brands.some(b=>['mif1','msf1'].includes(b));
      return { name:avif?'AVIF container':heic?'HEIC container':heif?'HEIF container':'ISO base media container', type:avif?'image/avif':heic?'image/heic':heif?'image/heif':null, certainty:`ftyp brands: ${brands.join(', ')}`, container:true };
    }
  }
  for (const [name,type,pattern] of SIGNATURES) if (typeof pattern === 'string' ? ascii(bytes,pattern) : starts(bytes,pattern)) return { name, type, certainty:'Recognized header pattern', container:name.includes('container') };
  for (const [pattern,encoding] of [[[255,254,0,0],'UTF-32 little-endian'],[[0,0,254,255],'UTF-32 big-endian'],[[239,187,191],'UTF-8'],[[255,254],'UTF-16 little-endian'],[[254,255],'UTF-16 big-endian']]) if(starts(bytes,pattern)) return { name:`${encoding} byte-order mark`, type:null, certainty:'Encoding marker only; media type unknown', container:false };
  return { name:'No supported signature matched', type:null, certainty:'Unknown does not mean invalid', container:false };
}

const ZIP_TYPES = /^(application\/(vnd\.openxmlformats-officedocument\..+|vnd\.oasis\.opendocument\..+|epub\+zip|java-archive|vnd\.android\.package-archive|zip|x-zip-compressed))$/;
const ALIASES = { 'image/x-icon':'image/vnd.microsoft.icon', 'image/pjpeg':'image/jpeg', 'audio/x-wav':'audio/wav', 'application/x-gzip':'application/gzip', 'application/x-rar-compressed':'application/vnd.rar' };
export function evidenceAgreement(detected, claimed) {
  if (!detected.type || !claimed) return 'No comparison available';
  const base = String(claimed).split(';')[0].trim().toLowerCase();
  if (base === 'application/octet-stream') return 'Generic binary declaration; no specific agreement established';
  if (detected.type === 'application/zip' && ZIP_TYPES.test(base) && base !== 'application/zip') return 'ZIP container is compatible; specific subtype remains unverified';
  if (detected.type === 'application/ogg' && ['audio/ogg','video/ogg'].includes(base)) return 'Ogg container is compatible; contained media remains unverified';
  return (ALIASES[base] || base) === detected.type ? 'Header pattern agrees with this type' : 'Different indicators — investigate the original file';
}

export function inspectBytes(bytes, file, index, declared = '') {
  const extension = extensionOf(file.name), extensionTypes = extension ? index.filter(row=>row.extensions.includes(extension)).map(row=>row.type) : [];
  const signature = sniff(bytes);
  const parsed = declared.trim() ? parseContentType(declared) : null;
  return { schema:'coolcode.mimecabinet.v1', capturedAt:new Date().toISOString(), file:{ name:file.name,size:file.size,browserType:file.type || null }, bytesRead:bytes.length, extension:extension || null, extensionTypes, declared:parsed, signature, comparisons:{browser:evidenceAgreement(signature,file.type),declared:evidenceAgreement(signature,parsed?.type),extension:extensionTypes.map(type=>({type,result:evidenceAgreement(signature,type)}))}, hexPreview:Array.from(bytes.slice(0,64), n=>n.toString(16).padStart(2,'0')).join(' ') };
}
