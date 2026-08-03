const [port, urlFilter, expr] = [process.argv[2], process.argv[3], process.argv[4]];
const list = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
const page = (urlFilter ? list.filter(t => t.type === 'page' && t.url.includes(urlFilter)) : list.filter(t => t.type === 'page'))[0];
if (!page) { console.log('NO_PAGE'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
const timer = setTimeout(() => { console.log('WS_TIMEOUT'); process.exit(2); }, 25000);
ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id === 1) {
    clearTimeout(timer);
    const v = m.result && m.result.result;
    console.log(v ? (typeof v.value === 'string' ? v.value : JSON.stringify(v.value)) : JSON.stringify(m.result));
    ws.close(); process.exit(0);
  }
};
ws.onerror = e => { clearTimeout(timer); console.log('WS_ERROR'); process.exit(3); };
