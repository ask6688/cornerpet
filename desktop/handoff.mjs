import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { HANDOFF_PORT, HANDOFF_PATH, parseConnectUrl } from '../shared/desktop-connect.mjs';
import { MAX_PACKAGE_BYTES, parsePetPackage, validatePngAsset } from '../shared/pet-config.mjs';

// Both file imports and the local bridge use the same validation and native PNG decode.
export function parseDesktopPackage(text, decodePng) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_PACKAGE_BYTES) throw new Error('桌宠文件过大');
  const pet = parsePetPackage(text);
  for (const asset of new Set([pet.image2D, pet.thumbnail, pet.expressionAtlas].filter(Boolean))) {
    const expected = validatePngAsset(asset);
    const decoded = decodePng(Buffer.from(asset.split(',')[1], 'base64'));
    if (!decoded || decoded.width !== expected.width || decoded.height !== expected.height) throw new Error('PNG 图片无法解码');
  }
  return pet;
}

export function createHandoffServer({ adopt, port = HANDOFF_PORT }) {
  // ponytail: one active browser pairing; a new explicit connection replaces the old tab's capability.
  let connection, adopting = false;
  const server = http.createServer({ requestTimeout: 10_000, headersTimeout: 5_000, connectionsCheckingInterval: 1_000 }, async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Connection', 'close');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status, value) => {
      if (response.writableEnded) return;
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(value));
      // Do not keep receiving an unauthenticated or oversized upload.
      if (!request.complete) response.once('finish', () => request.destroy());
    };
    const reject = (status, error) => reply(status, { ok: false, error });
    const actualPort = server.address()?.port;
    const guarded = ['host', 'origin', 'authorization', 'content-type', 'content-length'];
    const names = request.rawHeaders.filter((_, index) => index % 2 === 0).map(name => name.toLowerCase());
    if (guarded.some(name => names.filter(value => value === name).length > 1) ||
        request.socket.remoteAddress !== '127.0.0.1' || request.headers.host !== `127.0.0.1:${actualPort}`) return reject(400, 'invalid-request');
    if (request.url !== HANDOFF_PATH) return reject(404, 'not-found');
    const paired = connection;
    if (!paired || request.headers.origin !== paired.origin) return reject(403, 'not-paired');
    response.setHeader('Access-Control-Allow-Origin', paired.origin);
    response.setHeader('Vary', 'Origin');
    if (request.method === 'OPTIONS') {
      const headers = String(request.headers['access-control-request-headers'] ?? '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
      if (request.headers['access-control-request-method'] !== 'POST' ||
          headers.some(value => !['authorization', 'content-type'].includes(value)) ||
          request.headers['access-control-request-private-network'] && request.headers['access-control-request-private-network'] !== 'true') return reject(400, 'invalid-preflight');
      response.setHeader('Access-Control-Allow-Methods', 'POST');
      response.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
      if (request.headers['access-control-request-private-network'] === 'true') response.setHeader('Access-Control-Allow-Private-Network', 'true');
      return response.writeHead(204).end();
    }
    if (request.method !== 'POST') return reject(405, 'method-not-allowed');
    const bearer = request.headers.authorization;
    if (typeof bearer !== 'string' || !/^Bearer [a-f0-9]{64}$/.test(bearer) ||
        !timingSafeEqual(Buffer.from(bearer.slice(7)), Buffer.from(paired.token))) return reject(401, 'not-paired');
    if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers['content-type'] ?? '')) return reject(415, 'json-required');
    const declaredLength = request.headers['content-length'];
    if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_PACKAGE_BYTES)) return reject(413, 'package-too-large');
    if (adopting) return reject(409, 'busy');
    adopting = true;
    let length = 0;
    const chunks = [];
    try {
      for await (const chunk of request) {
        length += chunk.length;
        if (length > MAX_PACKAGE_BYTES) return reject(413, 'package-too-large');
        chunks.push(chunk);
      }
      if (connection !== paired) return reject(401, 'pairing-changed');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, length));
      const pet = await adopt(text);
      reply(200, { ok: true, petId: pet.petId, name: pet.name });
    } catch {
      reject(400, 'invalid-package');
    } finally { adopting = false; }
  });
  server.setTimeout(10_000, socket => socket.destroy());
  server.maxHeadersCount = 30;
  return {
    pair(url) {
      const next = parseConnectUrl(url);
      // Reawakening the same tab must not invalidate a transfer already in flight.
      if (connection?.token !== next.token || connection?.origin !== next.origin) connection = next;
    },
    listen() { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(server.address()); }); }); },
    close() { connection = undefined; server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); },
  };
}
