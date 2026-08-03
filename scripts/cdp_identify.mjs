// ===== 豆包识图一站式脚本 =====
// 用法: node cdp_identify.mjs <port> <url过滤> <图片路径> [提示词] [--mode 快速|专家] [--new-chat]
// 全流程一个 CDP 连接: 挂载上传入口→上传→等完成→输入→发送→等回复→输出
const args = process.argv.slice(2);
const port = args[0], urlFilter = args[1], imgPath = args[2];
let prompt = args.find(a => !a.startsWith("--") && args.indexOf(a) > 2) || null;
const mode = args.includes("--mode") ? args[args.indexOf("--mode") + 1] : null;
const newChat = args.includes("--new-chat");
if (!prompt) prompt = "请完全忽略本对话中此前的所有内容（包括之前的图片和消息），只根据当前这张图片回答。要求：请详细描述这张图片的全部内容，包括所有文字、物体、布局、颜色和细节。";

const list = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
const page = list.filter(t => t.type === 'page' && t.url.includes(urlFilter))[0];
if (!page) { console.log('NO_PAGE'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = {};
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending[mid] = { res, rej }; ws.send(JSON.stringify({ id: mid, method, params })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id].res(m); delete pending[m.id]; } };
await new Promise(r => ws.onopen = r);
const evaluate = async (expr) => { const m = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return m.result && m.result.result ? m.result.result.value : undefined; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clickAt = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};

// 1. 开新会话（可选）
if (newChat) {
  await send('Page.navigate', { url: 'https://www.doubao.com/chat/' });
  for (let i = 0; i < 30; i++) { if (await evaluate(`!!document.querySelector('textarea.semi-input-textarea')`)) break; await sleep(1000); }
  console.log('[1] new chat ready');
} else { console.log('[1] reuse current chat'); }

// 2. 切模式（可选）
if (mode) {
  const btn = await evaluate(`(() => { const b = document.querySelector('[data-valid-btn=mode-select-action-btn]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }; })()`);
  if (btn) {
    await clickAt(btn.x, btn.y); await sleep(1500);
    const item = await evaluate(`(() => { const pops = [...document.querySelectorAll('[data-slot=dropdown-menu-content]')].filter(p => p.innerText.includes('快速') || p.innerText.includes('专家')); if (!pops.length) return null; const t = [...pops[0].querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent.trim() === ${JSON.stringify(mode)} && el.getBoundingClientRect().width > 0); if (!t) return null; const r = t.getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }; })()`);
    if (item) { await clickAt(item.x, item.y); await sleep(1200); console.log('[2] mode ->', mode); }
    else console.log('[2] mode item not found, skip');
  } else console.log('[2] mode btn not found, skip');
}

// 3. 挂载上传入口（file input 不存在时点"+"按钮）
let hasInput = await evaluate(`!!document.querySelector('input[type=file]')`);
if (!hasInput) {
  const plusBtn = await evaluate(`(() => { const ta = document.querySelector('textarea.semi-input-textarea'); if (!ta) return null; const tr = ta.getBoundingClientRect(); const b = [...document.querySelectorAll('button[aria-haspopup=menu]')].find(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && Math.abs(r.top - tr.top) < 80 && r.left < tr.left + 100; }); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }; })()`);
  if (plusBtn) { await clickAt(plusBtn.x, plusBtn.y); await sleep(1200); }
  for (let i = 0; i < 10; i++) { if (await evaluate(`!!document.querySelector('input[type=file]')`)) break; await sleep(500); }
}
console.log('[3] file input ready');

// 4. 上传
await send('DOM.getDocument');
const node = await send('DOM.querySelector', { nodeId: (await send('DOM.getDocument')).result.root.nodeId, selector: 'input[type=file]' });
await send('DOM.setFileInputFiles', { nodeId: node.result.nodeId, files: [imgPath] });
console.log('[4] file set, waiting upload...');

// 5. 等上传完成：blob 预览出现 + 稳定 6 秒
let blobSeen = false;
for (let i = 0; i < 40; i++) {
  const n = await evaluate(`[...document.querySelectorAll('img')].filter(i => i.src.startsWith('blob:')).length`);
  if (n > 0) { blobSeen = true; break; }
  await sleep(500);
}
if (!blobSeen) { console.log('UPLOAD_FAIL'); process.exit(3); }
await sleep(6000); // 上传+索引缓冲
console.log('[5] upload done');

// 6. 输入提示词
await evaluate(`document.querySelector('textarea.semi-input-textarea').focus()`);
await send('Input.insertText', { text: prompt });
const vlen = await evaluate(`document.querySelector('textarea.semi-input-textarea').value.length`);
if (!vlen) { console.log('TYPE_FAIL'); process.exit(4); }
console.log('[6] typed', vlen, 'chars');

// 7. Enter 发送
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
for (let i = 0; i < 20; i++) { if (!(await evaluate(`document.querySelector('textarea.semi-input-textarea').value.length`))) break; await sleep(500); }
console.log('[7] sent');

// 8. 等回复：对话文本稳定 5 秒判定完成
let lastLen = -1, stable = 0;
const start = Date.now();
while (Date.now() - start < 150000) {
  const t = await evaluate(`(() => { const ta = document.querySelector('textarea.semi-input-textarea'); const tr = ta ? ta.getBoundingClientRect() : null; const el = [...document.querySelectorAll('div')].find(d => { const r = d.getBoundingClientRect(); return tr && r.bottom < tr.top && r.height > 200 && d.innerText.length > 50; }); return el ? el.innerText : ''; })()`);
  const len = t ? t.length : 0;
  if (len > 0) {
    if (len === lastLen) { stable++; if (stable >= 5) { console.log('[8] done, len=' + len); console.log('=====REPLY====='); console.log(t.slice(-3500)); console.log('=====END====='); process.exit(0); } }
    else stable = 0;
    lastLen = len;
  }
  await sleep(1000);
}
console.log('TIMEOUT_NO_REPLY');
ws.close(); process.exit(5);
