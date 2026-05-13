# 📷 攝影器材管理系統 — 部署說明

## 功能總覽

| 頁籤 | 功能 |
|------|------|
| 📤 今日出庫 | 掃描 QR Code 出庫、大表查詢、PDF 匯出分享 |
| 📋 器材列表 | 所有器材庫存一覽、搜尋過濾 |
| 🔧 狀態表 | 掃描填寫送修狀態，自動聯動庫存 |
| 📊 盤點表 | 自動計算應到/出租/維修數量 |
| 📥 入庫 | 掃描或手動新增器材，自動更新總數 |

---

## 🗄️ 第一步：建立 Supabase 資料庫

1. 前往 [supabase.com](https://supabase.com) 建立免費帳號與專案
2. 進入 **SQL Editor**
3. 複製 `schema.sql` 全部內容貼入並執行
4. 確認左側 **Table Editor** 出現以下資料表：
   - `equipments`
   - `rentals`
   - `users`
   - `status_logs`
   - `inbound_logs`

5. 前往 **Settings → API**，複製：
   - **Project URL**（格式：`https://xxxx.supabase.co`）
   - **anon public key**（`eyJ...` 開頭的長字串）

---

## 🌐 第二步：部署網頁

### 方法 A：GitHub Pages（推薦，免費）

```bash
# 1. 建立 GitHub repo（公開或私人皆可）
# 2. 上傳所有檔案（index.html, app.js, sw.js, manifest.json, icons/）
# 3. Settings → Pages → Deploy from branch → main / root
# 4. 等待 1-2 分鐘，取得 https://yourname.github.io/repo-name
```

### 方法 B：Netlify（拖放部署）

1. 前往 [netlify.com](https://netlify.com)
2. 將整個資料夾拖入部署區域
3. 取得自動產生的 HTTPS 網址

> ⚠️ **PWA 與相機功能需要 HTTPS**，請勿使用 `file://` 開啟

---

## 📱 第三步：設定連線

1. 用手機 Chrome 或 Safari 開啟部署網址
2. 點右上角 **⚙️** 圖示
3. 填入 Supabase URL 和 Anon Key
4. 點「儲存並連線」，確認顯示 ✅ 連線成功

---

## 📲 第四步：安裝為 PWA

**Android (Chrome)**：
- 點瀏覽器右上角 `⋮` → 「新增到主畫面」

**iPhone (Safari)**：
- 點底部 □↑ 分享按鈕 → 「加入主畫面」

---

## 📄 QR Code 格式規範

掃描器支援以下兩種格式：

**JSON 格式（推薦）：**
```json
{"name":"Sony A7IV 機身","code":"CAM-001"}
```

**簡易格式：**
```
Sony A7IV 機身|CAM-001
```

### 產生 QR Code

可使用 [qr-code-generator.com](https://www.qr-code-generator.com) 或任何 QR 產生器，輸入上述格式文字即可列印貼在器材上。

---

## 🗂️ 資料表欄位說明

### `equipments`（器材主表）
| 欄位 | 類型 | 說明 |
|------|------|------|
| `name` | TEXT | 器材名稱 |
| `code` | TEXT | 唯一識別碼，對應 QR Code |
| `total_qty` | INT | 總數量 |
| `rented_qty` | INT | 出租中數量（自動同步） |
| `repair_qty` | INT | 維修中數量 |
| `status` | TEXT | available / rented / repair / retired |

### `rentals`（出租記錄）
| 欄位 | 類型 | 說明 |
|------|------|------|
| `equipment_code` | TEXT | 關聯器材編號 |
| `user_name` | TEXT | 借用人 |
| `order_no` | TEXT | 單號 |
| `checkout_date` | DATE | 出庫日期 |
| `status` | TEXT | rented / returned / partial |

---

## 🔧 常見問題

**Q: 掃描時相機無法開啟？**
A: 確認網站使用 HTTPS，並在瀏覽器允許相機權限。

**Q: Supabase 連線失敗？**
A: 確認已執行 `schema.sql`，且 URL 和 Key 複製正確（Key 很長，注意別漏字）。

**Q: PDF 中文字顯示為亂碼？**
A: jsPDF 預設不支援中文字體。目前 PDF 以英文輸出，若需中文 PDF 可整合 `jspdf-font` 套件或改用 `html2canvas`。

**Q: 離線時可以使用嗎？**
A: Service Worker 快取靜態資源，介面可離線瀏覽。但出庫/入庫等寫入操作需要網路連線至 Supabase。

---

## 📦 檔案結構

```
camera-gear-manager/
├── index.html          ← 主頁面（含所有 UI）
├── app.js              ← 全部應用邏輯
├── sw.js               ← Service Worker（離線快取）
├── manifest.json       ← PWA Manifest
├── schema.sql          ← Supabase 資料庫建置腳本
├── README.md           ← 本說明文件
├── generate_icons.py   ← Icon 產生腳本（已執行）
└── icons/
    ├── icon-192.png
    └── icon-512.png
```
