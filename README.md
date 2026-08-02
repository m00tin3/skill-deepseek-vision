# skill-deepseek-vision

这个skill通过免费的智谱glm4.6v-flash，让deepseek能够识别图片

通过智谱 **GLM-4.6V-Flash** 免费 API 实现图片识别（识图 / OCR / 图表分析 / 视频·文件理解），秒级返回文字描述。

> 模型官方标注为**完全免费**，不限 token 量（仅限并发速率）。适合个人高频使用，无风控风险，无需浏览器自动化。

## 特性

- ⚡ 秒级返回（非流式，约 2~10s）
- 🆓 免费：`glm-4.6v-flash` 官方免费模型
- 🖼️ 支持 png / jpg / jpeg / webp / gif / bmp
- 🧠 可开关思考模式（`--thinking`，复杂推理更深入）
- 🔒 API key 独立存放，不写入代码

## 目录结构

```
skill-deepseek-vision/
├── SKILL.md                # 技能 playbook（Reasonix/Claude 等 Agent 使用）
├── README.md               # 本文件
└── scripts/
    └── glm_vision.py       # 识图 CLI（纯标准库，无第三方依赖）
```

## 安装与配置

1. 注册 [智谱开放平台](https://bigmodel.cn)（手机号 + 实名认证），在控制台创建 API Key
2. 配置 Key（二选一）：
   - 环境变量：`export ZHIPU_API_KEY="你的key"`
   - 或写入用户目录：`echo "你的key" > ~/.zhipu_api_key`

## 用法

```bash
# 基本识图（默认提示词：详细描述图片内容）
python scripts/glm_vision.py <图片路径>

# 自定义提示词
python scripts/glm_vision.py <图片路径> "请逐字读出图片中的所有文字"

# 开启思考模式
python scripts/glm_vision.py <图片路径> "这张图的几何证明过程是什么" --thinking
```

作为 Agent skill 使用时，直接说"识图 xxx.png"即可自动调用。

## 注意事项

- ⚠️ **API Key 是敏感信息**：不要提交到 Git，建议用环境变量或 `~/.zhipu_api_key`
- 免费模型有限并发（错误码 `1302`），个人使用远达不到上限；遇到 `1305` 是平台过载，稍后重试
- 模型不支持同一次请求混合传入文件 + 视频 + 图片（单次单类型）

## License

MIT
