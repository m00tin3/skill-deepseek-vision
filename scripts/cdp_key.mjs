// 用法: node cdp_key.mjs <port> <url过滤> <key>  —— 模拟完整 keyDown+keyUp
const [port, urlFilter, key] = [process.argv[2], process.argv[3], process.argv[4]];
const list = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
const page = list.filter(t => t.type === 'page' && t.url.includes(urlFilter))[0];
if (!page) { console.log('NO_PAGE'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = {};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id; pending[mid] = res;
  ws.send(JSON.stringify({ id: mid, method, params }));
});
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
await new Promise(r => ws.onopen = r);
const keyMap = { Enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' } };
const k = keyMap[key] || { key, code: key, vk: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0, text: key };
// 先聚焦输入框
await send('Runtime.evaluate', { expression: `document.querySelector('textarea.semi-input-textarea').focus()` });
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, text: k.text || undefined, unmodifiedText: k.text || undefined });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk });
console.log('KEY_SENT', key);
ws.close(); process.exit(0);
