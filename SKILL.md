---
name: doubao-vision
description: 通过 Chrome CDP 调用豆包网页版识图，把本地图片转成文字描述返回。触发词：识图、看图、图片识别、豆包识图。需配合 browser-cdp 复用登录态。
---

# 豆包识图（Doubao Vision via Browser）

通过复用 Chrome 登录态打开豆包网页版，上传图片并让豆包描述，把返回文字交给主会话。主会话拿到文字后再做后续推理。

## 配置（按需修改）

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| CDP 端口 | `9223` | 被占用就换 9224+，全文同步替换 |
| 浏览器路径 | `C:\Program Files\Google\Chrome\Application\chrome.exe` | 没装 Chrome 可换 `msedge.exe` |
| debug profile | `~/chrome-debug-profile` | 存放登录态；首次使用需从已登录的 Chrome 复制登录态，或启动后在浏览器窗口手动登录豆包 |
| 配套脚本 | `scripts/cdp_eval.mjs`、`scripts/cdp_key.mjs` | 从本目录复制到可执行位置（或直接用 `{SKILL_DIR}/scripts/...` 全路径） |

> 本 skill 是**白嫖豆包网页版视觉能力的自动化通道**：低频个人使用没问题；批量调用有触发风控（验证码/限流）的风险，量大建议改用官方视觉 API。

## 0. 入口检查

- 确认图片路径存在（`ls` 或文件检查），不存在就先向用户要正确路径。
- 本 skill 只负责"识图拿文字"，不负责基于文字的后续推理。
- **敏感信息**：全流程涉及浏览器登录态，不要在任何输出中打印 Cookie 原文。

## 1. 前置检查 A：电脑是否有 Chrome

在 Windows 常见安装路径中查找 chrome.exe：

```bash
for p in "/c/Program Files/Google/Chrome/Application/chrome.exe" \
         "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
         "$LOCALAPPDATA/Google/Chrome/Application/chrome.exe"; do
  [ -f "$p" ] && echo "FOUND: $p"
done
```

- 找到 → 记下路径，继续第 2 步。
- **没找到** → 用 ask 工具问用户怎么办：
  - 选项 1：让用户先安装 Chrome（推荐，最稳）；
  - 选项 2：改用 Edge（Chromium 内核，同样支持 CDP）：`"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"`，后续所有 `chrome.exe` 换成 `msedge.exe`；
  - 选项 3：用户指定其他浏览器路径。

## 2. 前置检查 B：豆包登录状态确认

**用 ask 工具主动问用户："你已经在（常规）Chrome 里登录过豆包吗？"** 选项：
- 「已登录」→ 继续（登录态通过 chrome-debug-profile 复用，见第 3 步）。
- 「没登录 / 不确定」→ 先走第 3 步把 CDP 浏览器启动起来，然后**提示用户在弹出的 Chrome 窗口里手动登录豆包**，等用户确认登录完成后再继续识图。
- 用户提供账号密码要求自动登录 → 说明风险（密码会经浏览器输入），推荐扫码/手动登录。

启动后仍要做自动验证（第 4 步），以页面实际状态为准，不盲信用户回答。

## 3. 启动 / 复用 CDP 浏览器（依赖 browser-cdp）

先 `read_skill browser-cdp` 获取 `SKILL_DIR`。**2026-08-03 实测：setup 脚本可能启动失败**（探测报 `CHROME_RUNNING=no`、`--yes` 后报成功，但 CDP 端口上实际是别的 404 服务；且脚本内部会 `taskkill` 用户 Chrome）。优先手动启动，最稳、绝不误杀：

1. 探测：`node {SKILL_DIR}/scripts/setup-cdp-chrome.js 9223 --detect-only`
   - `CDP_STATUS=ready` → 直接用 `agent-browser --cdp 9223`（端口保持一致）
   - 否则手动启动（**不杀任何进程**，后台运行）：
     ```bash
     rm -f ~/chrome-debug-profile/SingletonLock ~/chrome-debug-profile/SingletonCookie ~/chrome-debug-profile/SingletonSocket
     "/c/Program Files/Google/Chrome/Application/chrome.exe" --remote-debugging-port=9223 \
       --user-data-dir="C:\Users\24856\chrome-debug-profile" \
       --no-first-run --no-default-browser-check --disable-background-networking --no-sandbox &
     sleep 6
     ```
   - 验证 CDP 存活：
     ```bash
     node -e "fetch('http://127.0.0.1:9223/json/version').then(r=>r.json()).then(v=>console.log('OK',v.Browser))"
     ```
2. 打开豆包：
   ```bash
   agent-browser --cdp 9223 open "https://www.doubao.com/chat/"
   ```
3. ⚠️ **agent-browser 每步都可能报 `WaitDelay expired` / `Operation timed out`，但实际已成功**——以输出里的 `✓ Done` 和实际返回为准，看到 error 不要重试或放弃。`snapshot -i` 在豆包页面会卡死，一律用 eval 探测 DOM。

## 4. 校验登录态（自动）

```bash
agent-browser --cdp 9223 eval 'location.href'
```

- 页面加载中间态可能出现"登录"按钮——**等待 5~10s 后复查**（豆包会从登录页自动跳转 `?from_login=1`）。
- 最终 URL 仍停在 `login` / `passport` → 登录态失效：提示用户在弹出的 CDP Chrome 窗口手动登录，用户确认后再继续。
- 已登录标志：无"登录"按钮、cookie 含 `passport_csrf_token`、URL 带 `from_login=1`。

## 5. 上传图片并识图

1. 探测上传控件（豆包是**隐藏的 `input[type=file]`**，accept 含 png/jpg/webp）：
   ```bash
   agent-browser --cdp 9223 eval '[...document.querySelectorAll("input[type=file]")].map(e=>e.accept).join(",")'
   ```
2. 上传（实测直接可用，无需 DOM.setFileInputFiles）：
   ```bash
   agent-browser --cdp 9223 upload "input[type=file]" "<图片绝对路径，正斜杠>"
   ```
3. 确认上传成功：页面出现 `blob:` URL 的 img 预览、`hasPreview=true`（eval 检查 `[class*="upload-list"],[class*="file-card"],[class*="attachment"]` 等）。
4. 输入提示词：
   ```bash
   agent-browser --cdp 9223 type "textarea.semi-input-textarea" "请详细描述这张图片的全部内容，包括所有文字、物体、布局、颜色和细节。"
   ```
   - ⚠️ **type 会报假超时但实际成功**，用 `node {SKILL_DIR}/scripts/cdp_eval.mjs 9223 "doubao.com" '...value.length'` 验证输入框非空。
   - 需要精确文字时改为："请逐字读出图片中的所有文字。"
   - 需要表格/图表数据时改为："请把图中的表格/图表数据逐项列出。"
5. **发送（不能用 `press "Enter"`，2026-08-03 实测无效，豆包受控输入框不认字段不全的键盘事件）**，用 CDP 原生按键脚本：
   ```javascript
   // {SKILL_DIR}/scripts/cdp_key.mjs  用法: node cdp_key.mjs <port> <url过滤> Enter
   const [port, urlFilter, key] = [process.argv[2], process.argv[3], process.argv[4]];
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
   await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
   await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
   console.log('KEY_SENT'); ws.close(); process.exit(0);
   ```
   ```bash
   node {SKILL_DIR}/scripts/cdp_key.mjs 9223 "doubao.com" "Enter"
   ```
   - 发送成功标志：输入框 value 变空（`vlen: 0`）。
6. 等待回复生成（生成期间页面网络活跃，agent-browser 会一直超时——**改用 Node WebSocket 直连取结果**，见第 6 步）。

## 6. 提取结果（Node WebSocket 直连 CDP）

```javascript
// {SKILL_DIR}/scripts/cdp_eval.mjs  用法: node cdp_eval.mjs <port> <url过滤串> '<js表达式>'
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
ws.onerror = () => { clearTimeout(timer); console.log('WS_ERROR'); process.exit(3); };
```

```bash
node {SKILL_DIR}/scripts/cdp_eval.mjs 9223 "doubao.com" 'document.body.innerText.slice(-2500)'
```

- **必须按 URL 过滤**（`doubao.com`），否则会选到 DevTools tab。
- 截取最后一条 AI 回复，**原样返回给主会话**，注明来源"豆包识图（网页版）"。
- 豆包回复末尾常带追问建议（"图片中…是什么？"），只取 AI 回复主体即可。

## 7. 登录态失效处理

- 提示用户登录态过期：让用户在 CDP Chrome 窗口（chrome-debug-profile）手动登录豆包后重试。
- 或从常规 Chrome 复制登录态：`node {SKILL_DIR}/scripts/setup-cdp-chrome.js 9223 --reset --yes`（会杀所有 Chrome，需先征得同意）。

## 8. 常见问题

| 问题 | 处理 |
|------|------|
| 没装 Chrome | ask 用户：装 Chrome / 用 Edge（msedge.exe 同样支持 CDP）/ 指定路径 |
| 9222/9223 端口被占且返回 404 | 不是 CDP 服务；换新端口（9224...）手动启动 |
| agent-browser 报 WaitDelay 超时 | 忽略，以 `✓ Done` 和输出为准 |
| `snapshot -i` 卡死 | 不用它，用 eval 探测 DOM |
| 找不到上传按钮 | eval 找隐藏 `input[type=file]`（豆包就是隐藏的） |
| 上传后无回复 | eval 确认 blob 预览存在；提示词换简单句重试 |
| `press Enter` 发不出去 | agent-browser 的 press 字段不全，豆包不认；改用 CDP 原生 `Input.dispatchKeyEvent`（cdp_key.mjs） |
| type 报超时但实际成功 | 假超时；用 cdp_eval.mjs 验证输入框 value 长度确认 |
| eval 拿到 DevTools 页内容 | 按 URL 过滤 target（`doubao.com`） |
| 返回内容截断 | 取 `innerText` 不同区间（slice 大范围 / 分页） |
| 页面结构变了 | 不要死磕写死的选择器，用 eval 动态探测 |

## 9. 边界说明

- 识图结果是**有损描述**：像素级细节、小字、图表刻度可能失真，涉及精确数据时向用户说明。
- 批量识图：逐张串行执行本流程；超过 10 张建议提示用户改用视觉 API（如 `doubao-vision`、`qwen-vl`）。
