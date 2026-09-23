import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import routeParser from 'next/dist/compiled/path-to-regexp/index.js';

const PROJECT = fileURLToPath(new URL('../../../', import.meta.url));
const BASE = '/visuals/first-thousand';
const ORIGIN = 'http://release.invalid';
const MiB = 1024 * 1024;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const mime = file => ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.txt': 'text/plain' })[extname(file)] || 'application/octet-stream';

export async function loadRouteConfig(path = resolve(PROJECT, 'next.config.ts')) {
  // Use the installed TypeScript compiler so this also runs on supported Node 20.
  // The reviewed config contains type-only imports; runtime imports stay rejected.
  const source = await readFile(path, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  assert.ok(!/^\s*import\s/m.test(compiled), 'QA config loader does not execute runtime config imports');
  return (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)).default;
}

async function routeRules(config) {
  const headers = await config.headers?.() || [];
  const raw = await config.rewrites?.() || [];
  const rewrites = Array.isArray(raw) ? raw : [...raw.beforeFiles || [], ...raw.afterFiles || [], ...raw.fallback || []];
  return { headers: headers.map(rule => ({ ...rule, pattern: routeParser.pathToRegexp(rule.source) })), rewrites };
}

function responseHeaders(rules, path) {
  const headers = {};
  for (const rule of rules.headers) if (rule.pattern.test(path)) {
    assert.ok(!rule.has && !rule.missing, 'Conditional headers require real Next HTTP verification');
    for (const header of rule.headers) headers[header.key.toLowerCase()] = header.value;
  }
  return headers;
}

function localFile(directory, path, base) {
  assert.ok(path.startsWith(`${base}/`), `Resource escapes the artwork route: ${path}`);
  const file = resolve(directory, decodeURIComponent(path.slice(base.length + 1)));
  const inside = relative(resolve(directory), file);
  assert.ok(inside && !inside.startsWith(`..${sep}`) && inside !== '..', `Resource escapes output directory: ${path}`);
  return file;
}

export async function createReleaseServer({ directory, config, base = BASE, port = 0 }) {
  const rules = await routeRules(config);
  assert.ok(rules.rewrites.some(rule => rule.source === base && rule.destination === `${base}/index.html`), 'Missing production no-trailing-slash rewrite');
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
      const path = new URL(request.url, ORIGIN).pathname;
      const target = path === base || path === `${base}/` ? `${base}/index.html` : path;
      const file = localFile(directory, target, base);
      const bytes = await readFile(file);
      const etag = `"${sha(bytes)}"`;
      response.writeHead(request.headers['if-none-match'] === etag ? 304 : 200, { ...responseHeaders(rules, path), 'content-type': mime(file), etag });
      response.end(request.method === 'HEAD' || request.headers['if-none-match'] === etag ? undefined : bytes);
    } catch { response.writeHead(404, { 'content-type': 'text/plain' }); response.end('Not found'); }
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', done); });
  return { server, origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done, fail) => server.close(error => error ? fail(error) : done())) };
}

function webpSize(bytes) {
  assert.ok(bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP', 'Invalid WebP container');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, 'Truncated WebP container');
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4), at = offset + 8;
    assert.ok(at + length <= bytes.length, 'Truncated WebP chunk');
    if (kind === 'VP8X') return [1 + bytes.readUIntLE(at + 4, 3), 1 + bytes.readUIntLE(at + 7, 3)];
    if (kind === 'VP8L') { assert.equal(bytes[at], 0x2f); const bits = bytes.readUInt32LE(at + 1); return [1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff)]; }
    if (kind === 'VP8 ') { assert.equal(bytes.toString('hex', at + 3, at + 6), '9d012a'); return [bytes.readUInt16LE(at + 6) & 0x3fff, bytes.readUInt16LE(at + 8) & 0x3fff]; }
    offset = at + length + length % 2;
  }
  throw Error('WebP has no image dimensions');
}

// Analyze emitted JavaScript, not source assumptions. TypeScript parses import
// syntax and worker constructors; a small constant evaluator resolves Vite base
// constants and pure URL helpers without executing application code.
function references(source, filename, moduleUrl, documentUrl) {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0, `Invalid emitted JavaScript: ${filename}`);
  const definitions = new Map(), modules = [], workers = [], resources = [];
  const scope = node => { for (let p = node.parent; p; p = p.parent) if (ts.isSourceFile(p) || ts.isBlock(p) || ts.isFunctionLike(p)) return p; };
  function index(node) {
    if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isParameter(node)) && node.name && ts.isIdentifier(node.name)) {
      const key = scope(node); if (!definitions.has(key)) definitions.set(key, new Map()); definitions.get(key).set(node.name.text, node);
    }
    ts.forEachChild(node, index);
  }
  index(ast);
  const binding = node => { for (let p = node.parent; p; p = p.parent) { const found = definitions.get(p)?.get(node.text); if (found) return found; } };
  function constant(node, argumentsMap = new Map(), seen = new Set()) {
    if (!node || seen.has(node)) return;
    seen = new Set(seen).add(node);
    if (node.getText(ast) === 'import.meta.url') return String(moduleUrl);
    if (node.getText(ast) === 'location.origin' || node.getText(ast) === 'window.location.origin') return ORIGIN;
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'href') return constant(node.expression, argumentsMap, seen);
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isParenthesizedExpression(node)) return constant(node.expression, argumentsMap, seen);
    if (ts.isIdentifier(node)) {
      if (argumentsMap.has(node.text)) return argumentsMap.get(node.text);
      const definition = binding(node); return definition && constant(definition.initializer, argumentsMap, seen);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = constant(node.left, argumentsMap, seen), right = constant(node.right, argumentsMap, seen);
      return typeof left === 'string' && typeof right === 'string' ? left + right : undefined;
    }
    if (ts.isTemplateExpression(node)) {
      let value = node.head.text;
      for (const span of node.templateSpans) { const part = constant(span.expression, argumentsMap, seen); if (typeof part !== 'string') return; value += part + span.literal.text; }
      return value;
    }
    if (ts.isNewExpression(node) && node.expression.getText(ast) === 'URL') {
      const value = constant(node.arguments?.[0], argumentsMap, seen), base = constant(node.arguments?.[1], argumentsMap, seen);
      if (value !== undefined && base !== undefined) return new URL(value, base).href;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const definition = binding(node.expression), fn = definition && (ts.isFunctionDeclaration(definition) ? definition : definition.initializer);
      if (!fn || !(ts.isFunctionDeclaration(fn) || ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return;
      const params = new Map(argumentsMap);
      fn.parameters.forEach((parameter, index) => params.set(parameter.name.getText(ast), constant(node.arguments[index], argumentsMap, seen)));
      const body = ts.isBlock(fn.body) ? fn.body.statements.length === 1 && ts.isReturnStatement(fn.body.statements[0]) ? fn.body.statements[0].expression : undefined : fn.body;
      return constant(body, params, seen);
    }
  }
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) modules.push(new URL(node.moduleSpecifier.text, moduleUrl).href);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const value = constant(node.arguments[0]); assert.ok(value, `Unresolved dynamic module import: ${filename}`); modules.push(new URL(value, moduleUrl).href);
    }
    if (ts.isNewExpression(node) && node.expression.getText(ast) === 'Worker') {
      const value = constant(node.arguments?.[0]); assert.ok(value, `Unresolved worker URL: ${filename}`); workers.push(new URL(value, documentUrl).href);
    }
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'fetch') {
      const value = constant(node.arguments[0]); if (value) resources.push(new URL(value, documentUrl).href);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left) && node.left.name.text === 'src') {
      const value = constant(node.right); if (value) resources.push(new URL(value, documentUrl).href);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return { modules, workers, resources };
}

async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(path)); else result.push(path);
  }
  return result;
}

export async function verifyRelease({ directory = resolve(PROJECT, 'public/visuals/first-thousand'), base = BASE, config, origin } = {}) {
  config ||= await loadRouteConfig();
  const rules = await routeRules(config);
  assert.ok(rules.rewrites.some(rule => rule.source === base && rule.destination === `${base}/index.html`), 'Missing production no-trailing-slash rewrite');
  const documentUrl = new URL(base, ORIGIN), expectedManifest = `${base}/assets/people.json`;
  const expectedAuthor = `${base}/assets/yue.jpg`, paths = new Map();
  async function resource(url, type = '') {
    url = new URL(url, documentUrl);
    if (['data:', 'blob:'].includes(url.protocol)) return;
    assert.equal(url.origin, ORIGIN, `Unexpected external runtime resource: ${url.href}`);
    const file = localFile(directory, url.pathname, base);
    if (!paths.has(url.pathname)) {
      const bytes = await readFile(file).catch(() => { throw Error(`Missing release resource: ${url.pathname}`); });
      paths.set(url.pathname, { file, bytes: bytes.length, hash: sha(bytes), mime: mime(file), type });
    }
    return url.pathname;
  }
  const html = await readFile(resolve(directory, 'index.html'), 'utf8');
  assert.ok(!html.includes('%BASE_URL%'), 'Unexpanded Vite base in output HTML');
  const queue = [], runtimeResources = new Set(), workers = new Set(), visited = new Set();
  for (const tag of html.matchAll(/<(script|link|img)\b[^>]*>/gi)) {
    const attribute = tag[0].match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i);
    if (!attribute) continue;
    const path = await resource(attribute[1], tag[1]);
    if (!path) continue;
    if (tag[1].toLowerCase() === 'script' || /\brel=["']modulepreload["']/i.test(tag[0])) queue.push(path);
    else runtimeResources.add(path);
  }
  assert.ok(queue.length, 'No emitted JavaScript entry in output HTML');
  while (queue.length) {
    const path = queue.shift(); if (visited.has(path)) continue; visited.add(path);
    const source = await readFile(paths.get(path).file, 'utf8');
    const refs = references(source, path, new URL(path, ORIGIN), documentUrl);
    for (const module of [...refs.modules, ...refs.workers]) { const found = await resource(module, 'module'); if (found) queue.push(found); }
    for (const worker of refs.workers) workers.add(new URL(worker).pathname);
    for (const asset of refs.resources) { const found = await resource(asset, 'runtime'); if (found) runtimeResources.add(found); }
  }
  const styles = [...paths.keys()].filter(path => path.endsWith('.css')), checkedStyles = new Set();
  while (styles.length) {
    const path = styles.shift(); if (checkedStyles.has(path)) continue; checkedStyles.add(path);
    const css = await readFile(paths.get(path).file, 'utf8');
    for (const reference of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)|@import\s+["']([^"']+)["']/g)) {
      const found = await resource(new URL((reference[1] || reference[2]).trim(), new URL(path, ORIGIN)), 'style-asset');
      if (found?.endsWith('.css')) styles.push(found);
    }
  }
  assert.ok(workers.size, 'No bundled graph Worker reachable from the emitted entry');
  assert.ok(runtimeResources.has(expectedManifest), 'Emitted application does not reference the route-safe collection manifest');
  assert.ok(runtimeResources.has(expectedAuthor), 'Emitted application/HTML does not reference the route-safe author image');
  await resource(`${base}/assets/THIRD_PARTY_LICENSES.txt`, 'license');
  const data = JSON.parse(await readFile(localFile(directory, expectedManifest, base), 'utf8'));
  assert.equal(data.schemaVersion, 2); assert.notEqual(data.preview, true);
  assert.ok(Number.isInteger(data.count) && data.count >= 1000 && data.count <= data.layoutCapacity, 'Invalid release account count');
  assert.equal(data.people.length, data.count); assert.equal(data.portraits.length, data.count);
  assert.equal(new Set(data.people.map(person => person.handle.toLowerCase())).size, data.count, 'Duplicate release accounts');
  assert.deepEqual(data.atlases.map(atlas => atlas.tileSize).sort((a, b) => a - b), [16, 32, 64], 'Release must contain only 16/32/64 display atlases');
  assert.equal(data.atlasRows, Math.ceil(data.count / data.atlasColumns));
  const imageChecks = new Map();
  for (const [kind, entries] of [['atlas', data.atlases], ['portrait', data.portraits]]) for (const item of entries) {
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
    assert.equal(item.file, `${kind === 'atlas' ? 'portraits' : 'portrait'}-${item.sha256.slice(0, 16)}.webp`);
    const path = await resource(`${base}/assets/${item.file}`, kind);
    if (!imageChecks.has(path)) {
      const bytes = await readFile(paths.get(path).file); imageChecks.set(path, { hash: sha(bytes), bytes: bytes.length, size: webpSize(bytes) });
    }
    const image = imageChecks.get(path);
    assert.equal(image.hash, item.sha256, `Image hash mismatch: ${item.file}`); assert.equal(image.bytes, item.bytes, `Image byte count mismatch: ${item.file}`);
    assert.deepEqual(image.size, [item.width, item.height], `Image dimensions mismatch: ${item.file}`);
    if (kind === 'atlas') {
      assert.deepEqual(image.size, [data.atlasColumns * item.tileSize, data.atlasRows * item.tileSize]);
      assert.ok(item.bytes <= ({ 16: 1, 32: 4, 64: 12 })[item.tileSize] * MiB, `Display atlas exceeds release transfer budget: ${item.tileSize}px`);
    } else { assert.deepEqual(image.size, [128, 128]); assert.ok(item.bytes <= 128 * 1024, `Single portrait exceeds transfer budget: ${item.file}`); }
  }
  for (const file of await filesUnder(directory)) if (/\/(?:portraits|portrait)-[^/]+\.webp$/.test(file)) {
    const path = `${base}/${relative(directory, file).split(sep).join('/')}`;
    assert.ok(imageChecks.has(path), `Unreferenced portrait image leaked into release: ${path}`);
  }
  const manifestCache = responseHeaders(rules, expectedManifest)['cache-control'] || '';
  assert.ok(/no-store|(?:max-age=0.*must-revalidate)/i.test(manifestCache) && !/immutable/i.test(manifestCache), 'Collection manifest must revalidate, not use immutable caching');
  for (const path of imageChecks.keys()) assert.match(responseHeaders(rules, path)['cache-control'] || '', /max-age=31536000.*immutable/i, `Hashed image needs immutable cache: ${path}`);
  assert.ok(!/immutable/i.test(responseHeaders(rules, expectedAuthor)['cache-control'] || ''), 'Unhashed author image must not be immutable');
  const local = origin ? null : await createReleaseServer({ directory, base, config });
  const liveOrigin = origin || local.origin;
  try {
    const page = await fetch(new URL(base, liveOrigin), { redirect: 'error', signal: AbortSignal.timeout(30000) });
    assert.equal(page.status, 200, 'No-trailing-slash production route must return 200 without redirect');
    assert.ok(page.headers.get('content-type')?.startsWith('text/html'), 'Artwork route must serve HTML');
    assert.equal(sha(Buffer.from(await page.arrayBuffer())), sha(Buffer.from(html)), 'HTTP route did not serve the verified built index');
    const entries = [...paths.entries()]; let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(8, entries.length) }, async () => {
      while (cursor < entries.length) {
        const [path, expected] = entries[cursor++];
        const response = await fetch(new URL(path, liveOrigin), { redirect: 'error', signal: AbortSignal.timeout(30000) });
        assert.equal(response.status, 200, `HTTP resource failed: ${path}`);
        const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        assert.ok(expected.mime === 'text/javascript' ? ['text/javascript', 'application/javascript'].includes(contentType) : contentType === expected.mime, `Wrong resource MIME: ${path}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.equal(bytes.length, expected.bytes, `HTTP resource length changed: ${path}`); assert.equal(sha(bytes), expected.hash, `HTTP resource hash changed: ${path}`);
        const expectedCache = responseHeaders(rules, path)['cache-control'];
        if (expectedCache) assert.equal(response.headers.get('cache-control'), expectedCache, `HTTP cache differs from reviewed Next config: ${path}`);
      }
    }));
    const missing = await fetch(new URL(`${base}/assets/qa-does-not-exist.js`, liveOrigin), { signal: AbortSignal.timeout(30000) });
    assert.equal(missing.status, 404, 'Missing modules must not fall back to HTML with 200');
  } finally { await local?.close(); }
  return { count: data.count, modules: [...visited], workers: [...workers], resources: paths.size, uniquePortraits: new Set(data.portraits.map(p => p.file)).size, atlases: data.atlases.map(({ tileSize, bytes }) => ({ tileSize, bytes })), manifestSha256: paths.get(expectedManifest).hash, http: liveOrigin, note: origin ? 'Verified supplied HTTP server; browser execution remains separate.' : 'Verified local static server using reviewed Next rewrite/header rules; actual Next/browser/deployment remains separate.' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i++) {
    assert.ok(['--dir', '--origin', '--serve'].includes(args[i]), `Unknown argument: ${args[i]}`);
    options[args[i].slice(2)] = args[++i];
  }
  let service;
  try {
    const directory = options.dir ? resolve(options.dir) : resolve(PROJECT, 'public/visuals/first-thousand');
    const config = await loadRouteConfig();
    if (options.serve) service = await createReleaseServer({ directory, config, port: Number(options.serve) });
    console.log(JSON.stringify(await verifyRelease({ directory, config, origin: options.origin || service?.origin }), null, 2));
    if (service) { console.log(`Preview: ${service.origin}${BASE}`); for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void service.close().then(() => process.exit())); }
  } catch (error) { console.error(error.message); await service?.close(); process.exitCode = 1; }
}
