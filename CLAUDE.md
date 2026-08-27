# CLAUDE.md

> Claude Code 專用入口。**本檔僅為指路牌**，所有規範以 [AGENTS.md](AGENTS.md) 為準。

## 給 Claude 的最短指令

1. 開始任何任務前，先完整讀取 [AGENTS.md](AGENTS.md)，並遵守其中每一條規則。
2. **語言規則（最高優先）**：所有對話、可見分析摘要、註解、commit message、PR 描述一律使用**繁體中文**，唯一例外是專有名詞（技術詞、符號、股票代號、常見縮寫）。詳見 AGENTS.md §0。
3. 動 `index.html` 的 `<script>` 區塊後，**同一 commit** 內必須包含 `python update-csp-hash.py` 產生的新 SHA-384 hash，否則頁面白畫面。詳見 AGENTS.md §3。
4. 交付任何非文件變更前，逐項核對 AGENTS.md §11 的自檢清單，並在回覆中回報結果。

## 若 AGENTS.md 與本檔衝突

以 **AGENTS.md** 為準。本檔若有內容與之不一致，視為過時，請提出更新 PR。
