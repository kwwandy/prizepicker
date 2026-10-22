# 開獎分佈圖 + 選號器

單一 `index.html`，支援英國 Lotto / Set for Life / Thunderball / EuroMillions、美國 Powerball、香港六合彩。

## 資料夾內容（全部可以公開）
- `index.html`　網頁本體
- `data/*.json`　只有「日期、期數、開出號碼」，冇獎金、冇投注額、冇個人資料
- `scripts/update.mjs`　更新資料用嘅程式；`scripts/add-draw.mjs`　處理手動新增嘅 Issue；`scripts/test-parsers.mjs`　解析測試（`node scripts/test-parsers.mjs`）
- `.github/workflows/pages.yml`　自動更新 + 發佈

## 設定步驟（一次過）
1. 喺 GitHub 開一個 **public** repo，將呢個資料夾內所有檔案（包括隱藏嘅 `.github`）上載到 `main` branch。
2. Settings → Pages → Build and deployment → Source 揀 **GitHub Actions**。
3. Actions 分頁 → 「Update data and deploy」→ Run workflow（games 填 `all`）。**第一次一定要睇清楚每個遊戲有冇成功**（Summary 有列表）。
4. 網址係 `https://<你嘅用戶名>.github.io/<repo名>/`。

## 自動更新時間（UTC 19:30，即香港凌晨 03:30）
只更新「前一日有開獎」嘅遊戲，星期一唔跑：
| 跑嘅日子 | 更新 |
|---|---|
| 日 | Lotto、Powerball、六合彩、Thunderball |
| 二 | Set for Life、Powerball |
| 三 | EuroMillions、六合彩、Thunderball |
| 四 | Lotto、Powerball、Thunderball |
| 五 | Set for Life、六合彩 |
| 六 | EuroMillions、Thunderball |

## 手動更新
- GitHub：Actions → Run workflow，games 可填 `all` 或 `lotto,tb`。
- 網頁「更新資料」掣：只係重新讀取已發佈嘅 data，唔會去外面抓。想即刻抓新資料，要先喺 GitHub 手動 Run workflow（網頁有連結）。

## 手動新增一期（所有裝置都見到）
網頁頂部「新增一期」→ 揀遊戲、日期、點號碼 →「提交到 GitHub」。會開一個已填好嘅 GitHub Issue，撳「Submit new issue」。
`.github/workflows/add-draw.yml` 會驗證、寫入 `data/`、重新發佈，再喺 Issue 回覆結果並關閉（1–2 分鐘）。之後網頁撳「更新資料」。
- 只處理 repo 擁有者開嘅、標題以 `[add-draw]` 開頭嘅 Issue。
- 同日已有不同號碼會拒絕，除非勾選「覆蓋」（Issue 內 `force: yes`）。
- 每次修改都有 Issue 同 commit 記錄。

## 本機雙擊使用
直接開 `index.html`，照舊可以 **匯入 CSV**。想用已發佈資料：撳「網站網址」輸入你嘅 GitHub Pages 網址一次，再撳「更新資料」。

## 注意
- 資料來源：英國 national-lottery.co.uk CSV、紐約州 data.ny.gov（Powerball）、Renavon 嘅六合彩 CSV（第三方，授權未確認）。如果某來源改格式或封鎖，該遊戲會更新失敗（Actions 變紅、發電郵），但舊資料同網頁唔受影響，仍可手動匯入 CSV。
- 更新時如來源同已存資料有超過 5 期唔一致，會拒絕寫入，需確認後用 `force`。
- GitHub 規定 repo 60 日冇活動會暫停定時工作；到時去 Actions 重新啟用，或隨便 commit 一次。
