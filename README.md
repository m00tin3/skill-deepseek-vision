# skill-deepseek-vision

通过 **豆包网页版** 免费识图：复用 Chrome 登录态，用 CDP 自动化操作豆包上传图片并取回文字描述。让没有视觉能力的 AI 获得"外置眼睛"。

> 本质是白嫖豆包网页版的视觉算力。适合个人低频使用；批量调用有触发风控（验证码/限流）的风险。

## 特性

- 🆓 免费：复用你已登录的豆包账号，无 API 费用
- 🖼️ 支持 png / jpg / jpeg / webp 等（豆包上传支持格式）
- 🔐 复用 Chrome 登录态，不需要账号密码
- 🤖 全自动：上传 → 提问 → 等待生成 → 提取结果

## 目录结构

```
skill-deepseek-vision/
├── SKILL.md                # 技能 playbook（Reasonix/Claude 等 Agent 使用）
├── README.md               # 本文件
└── scripts/
    ├── cdp_eval.mjs        # Node WebSocket 直连 CDP 取页面内容
    └── cdp_key.mjs         # CDP 原生键盘事件（发送消息用）
```

## 依赖

- Windows / macOS / Linux + Google Chrome
- Node.js 22+（内置 WebSocket）
- `agent-browser`：`npm install -g agent-browser`

## 配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| CDP 端口 | `9223` | 被占用就换 9224+ |
| debug profile | `~/chrome-debug-profile` | 登录态存放处；首次需在浏览器窗口手动登录豆包 |

启动 CDP 浏览器：

```bash
rm -f ~/chrome-debug-profile/SingletonLock ~/chrome-debug-profile/SingletonCookie ~/chrome-debug-profile/SingletonSocket
"/c/Program Files/Google/Chrome/Application/chrome.exe" --remote-debugging-port=9223 \
  --user-data-dir="C:\Users\24856\chrome-debug-profile" \
  --no-first-run --no-default-browser-check --no-sandbox &
```

打开豆包并确认登录：`https://www.doubao.com/chat/`（登录标志：无"登录"按钮、cookie 含 `passport_csrf_token`）。

## 用法（Agent skill 模式）

直接对 Agent 说"识图 xxx.png"即可自动执行：

1. 打开豆包页面 → 校验登录态
2. 隐藏 `input[type=file]` + `agent-browser upload` 上传图片
3. 输入提示词（type 到 `textarea.semi-input-textarea`）
4. CDP 原生 Enter 发送（`agent-browser press` 字段不全，豆包不认）
5. Node WebSocket 直连取回 AI 回复

## 注意事项

- ⚠️ **低频使用**：网页版自动化有风控风险，不要批量高频调用
- agent-browser 会报假超时（`WaitDelay expired`），以 `✓ Done` 和实际输出为准
- 识图结果是有损描述：像素级细节、小字、图表刻度可能失真
- 登录态过期：在 CDP Chrome 窗口手动重新登录豆包即可

## License

MIT
