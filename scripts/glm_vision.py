#!/usr/bin/env python3
"""GLM-4.6V-Flash 识图 CLI
用法:
  python glm_vision.py <图片路径> [提示词] [--thinking]

API key 读取顺序:
  1. 环境变量 ZHIPU_API_KEY
  2. 文件 ~/.zhipu_api_key (第一行)

输出: 模型回复文本
"""
import argparse, base64, json, os, sys, urllib.request

API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
DEFAULT_PROMPT = "请详细描述这张图片的全部内容，包括所有文字、物体、布局、颜色和细节。"

def get_api_key():
    env = os.environ.get("ZHIPU_API_KEY")
    if env:
        return env.strip()
    for p in (os.path.expanduser("~/.zhipu_api_key"),):
        try:
            with open(p, encoding="utf-8") as f:
                k = f.readline().strip()
                if k:
                    return k
        except FileNotFoundError:
            pass
    return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image", help="图片路径")
    ap.add_argument("prompt", nargs="?", default=DEFAULT_PROMPT, help="提示词")
    ap.add_argument("--thinking", action="store_true", help="开启思考模式(更慢但更深入)")
    args = ap.parse_args()

    key = get_api_key()
    if not key:
        print("ERROR: 未找到 API key。设置环境变量 ZHIPU_API_KEY 或写入 ~/.zhipu_api_key")
        sys.exit(1)
    if not os.path.isfile(args.image):
        print(f"ERROR: 图片不存在: {args.image}")
        sys.exit(2)

    with open(args.image, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    ext = os.path.splitext(args.image)[1].lower().lstrip(".")
    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "webp": "image/webp", "gif": "image/gif", "bmp": "image/bmp"}.get(ext, "image/png")

    payload = {
        "model": "glm-4.6v-flash",
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                {"type": "text", "text": args.prompt},
            ],
        }],
        "thinking": {"type": "enabled" if args.thinking else "disabled"},
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read())
        content = data["choices"][0]["message"]["content"]
        print(content)
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:500]
        print(f"HTTP_ERROR {e.code}: {body}")
        sys.exit(3)

if __name__ == "__main__":
    main()
