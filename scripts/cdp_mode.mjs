// 用法: node cdp_mode.mjs <port> <url过滤> <模式名: 专家|快速|工作任务>
// 自动切换豆包模式：真实鼠标点击模式按钮 → 菜单 → 目标项
const [port, urlFilter, targetMode] = [process.argv[2], process.argv[3], process.argv[4]];
const list = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
const page = list.filter(t => t.type === 'page' && t.url.includes(urlFilter))[0];
if (!page) { console.log('NO_PAGE'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = {};
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending[mid] = res; ws.send(JSON.stringify({ id: mid, method, params })); });
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.result.value;
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
await new Promise(r => ws.onopen = r);

const clickAt = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};

// 1. 找模式按钮（含"专家"或"快速"文本、在输入框上方、可点击）
let btn = await evaluate(`(() => {
  const ta = document.querySelector('textarea.semi-input-textarea');
  const tr = ta ? ta.getBoundingClientRect() : null;
  const cands = [document.querySelector('[data-valid-btn=mode-select-action-btn]')].filter(Boolean);
  if (!cands.length) return null;
  const b = cands[0]; const r = b.getBoundingClientRect();
  return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), text: (b.textContent||'').trim().slice(0,10) };
})()`);
if (!btn) { console.log('MODE_BTN_NOT_FOUND'); process.exit(1); }
console.log('BTN', JSON.stringify(btn));

// 2. 点开菜单
await clickAt(btn.x, btn.y);
await new Promise(r => setTimeout(r, 1500));

// 3. 找目标菜单项（模式菜单：含"快速"文本的那个 dropdown）
const item = await evaluate(`(() => {
  const pops = [...document.querySelectorAll('[data-slot=dropdown-menu-content]')].filter(p => p.innerText.includes('快速') || p.innerText.includes('专家'));
  if (!pops.length) return null;
  const pop = pops[0];
  const targets = [...pop.querySelectorAll('*')].filter(el => el.children.length === 0 && el.textContent.trim() === ${JSON.stringify(targetMode)} && el.getBoundingClientRect().width > 0);
  if (!targets.length) return null;
  const r = targets[0].getBoundingClientRect();
  return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) };
})()`);
if (!item) { console.log('MODE_ITEM_NOT_FOUND: ' + targetMode); process.exit(2); }
console.log('ITEM', JSON.stringify(item));

// 4. 点击目标项
await clickAt(item.x, item.y);
await new Promise(r => setTimeout(r, 1500));

// 5. 验证模式按钮文本
const after = await evaluate(`(() => {
  const ta = document.querySelector('textarea.semi-input-textarea');
  const tr = ta ? ta.getBoundingClientRect() : null;
  const b = document.querySelector('[data-valid-btn=mode-select-action-btn]');
  return b ? (b.textContent||'').trim().slice(0,10) : '?';
})()`);
console.log('AFTER:', after);
ws.close(); process.exit(0);
