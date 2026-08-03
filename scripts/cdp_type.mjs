// 用法: node cdp_type.mjs <port> <url过滤> "<文本>"
const [port, urlFilter, text] = [process.argv[2], process.argv[3], process.argv[4]];
const list = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
const page = list.filter(t => t.type === 'page' && t.url.includes(urlFilter))[0];
if (!page) { console.log('NO_PAGE'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = {};
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id; pending[mid] = res;
  ws.send(JSON.stringify({ id: mid, method, params }));
});
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
await new Promise(r => ws.onopen = r);
await send('Runtime.evaluate', { expression: `document.querySelector('textarea.semi-input-textarea').focus()` });
await send('Input.insertText', { text });
console.log('TYPE_SENT');
ws.close(); process.exit(0);
