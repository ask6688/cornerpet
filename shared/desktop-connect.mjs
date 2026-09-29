export const HANDOFF_PORT = 47823;
export const HANDOFF_PATH = '/v1/pet';
export const HANDOFF_URL = `http://127.0.0.1:${HANDOFF_PORT}${HANDOFF_PATH}`;

export function validateConnectOrigin(value) {
  if (typeof value !== 'string' || value.length > 512) throw new Error('无效的桌角网址');
  const url = new URL(value);
  if (url.origin !== value || url.username || url.password ||
      !(url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('请通过 HTTPS 或 localhost 打开桌角');
  }
  return value;
}

export function buildConnectUrl({ token, origin }) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('无效的连接凭证');
  validateConnectOrigin(origin);
  return `cornerpet://connect?${new URLSearchParams({ v: '1', token, origin })}`;
}

export function parseConnectUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('无效的连接链接');
  const url = new URL(value), params = url.searchParams;
  if (url.protocol !== 'cornerpet:' || url.hostname !== 'connect' || url.username || url.password || url.port || url.hash ||
      (url.pathname && url.pathname !== '/') || [...params].length !== 3 ||
      ['v', 'token', 'origin'].some(key => params.getAll(key).length !== 1) || params.get('v') !== '1') throw new Error('无效的连接链接');
  const connection = { token: params.get('token'), origin: params.get('origin') };
  buildConnectUrl(connection);
  return Object.freeze(connection);
}
