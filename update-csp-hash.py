#!/usr/bin/env python3
"""
每次修改 index.html 的 JS 區塊後，執行此腳本自動更新 CSP hash。

使用方式：
    python3 update-csp-hash.py
"""
import hashlib, base64, re, sys
from pathlib import Path

HTML_FILE = Path(__file__).parent / 'index.html'

def compute_script_hash(html_bytes: bytes) -> str:
    """計算 <script>...</script> 區塊的 SHA-384 hash（CSP 格式）"""
    lf = html_bytes.replace(b'\r\n', b'\n')
    m  = re.search(b'<script>\n(.*?)\n</script>', lf, re.DOTALL)
    if not m:
        raise ValueError("找不到 inline <script> 區塊")
    script_bytes = b'\n' + m.group(1) + b'\n'
    digest = hashlib.sha384(script_bytes).digest()
    return 'sha384-' + base64.b64encode(digest).decode()

def update_csp_hash(html_text: str, new_hash: str) -> str:
    """將 CSP meta 裡的 sha384-... 替換成新 hash"""
    return re.sub(r"'sha384-[A-Za-z0-9+/=]+'", f"'{new_hash}'", html_text)

def main():
    print(f"讀取：{HTML_FILE}")
    raw  = HTML_FILE.read_bytes()
    text = raw.decode('utf-8')

    # 計算新 hash
    new_hash = compute_script_hash(raw)
    print(f"新 hash：{new_hash}")

    # 找出目前 CSP 裡的 hash
    m = re.search(r"'(sha384-[A-Za-z0-9+/=]+)'", text)
    old_hash = m.group(1) if m else '（未找到）'
    print(f"舊 hash：{old_hash}")

    if new_hash == old_hash:
        print("✅ Hash 相同，無需更新。")
        return

    # 更新
    updated = update_csp_hash(text, new_hash)
    HTML_FILE.write_text(updated, encoding='utf-8')
    print("✅ CSP hash 已更新完成。")
    print("請記得 git add index.html && git commit && git push")

if __name__ == '__main__':
    main()
