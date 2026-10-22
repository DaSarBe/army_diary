# 阿兵哥日記

第三人稱 3D 角色扮演遊戲，背景是中華民國國軍義務役的一年（365 天）。在瀏覽器裡執行，純靜態網頁，不需要安裝或建置。

## 線上遊玩

https://dasarbe.github.io/army_diary/

## 玩法

- 移動：左下搖桿，或電腦 `W` `A` `S` `D`／方向鍵。拖曳畫面轉視角。
- 互動：右下按鈕，或 `E`／空白鍵。對話、檢查、撿東西、開始小遊戲都用同一個按鈕。
- NPC 頭上有「!」表示可以接任務，「?」表示可以回報。沒有 NPC 在場的委託（來信、來電）會貼在各地圖的布告欄。
- 時間：每天分上午、下午、晚上，完成一個任務會用掉一個時段（大型任務兩個）。到寢室「睡覺」或「快轉」過日子，睡覺會恢復體力與疲勞，也會累積日常訓練經驗。
- 介面：任務日誌、背包與裝備、技能、角色、福利社商店、存讀檔都在畫面右側的按鈕。`Esc` 開啟選單。
- 失敗有後果：任務失敗、逾時、違規、受傷、住院、禁閉，最嚴重會被移送法辦，導向負面結局。
- 結局共 12 種（含志願役 3 種、負面 2 種），結局圖鑑記錄在瀏覽器的 localStorage。

## 專案結構

```
index.html          頁面
css/game.css        樣式（手機優先）
js/engine.js        核心規則：屬性、判定、任務、獎勵、時間、結局（純邏輯，Node 與瀏覽器共用）
js/places.js        地點座標、中文名稱、任務步驟規劃器
js/world.js         three.js 世界：地圖、角色、搖桿/WASD、鏡頭、NPC、拾取物
js/minigames.js     小遊戲：連點、射擊、抽籤、節奏、限時、潛行等
js/audio.js         Web Audio 合成音效與靜音開關
js/ui.js            HUD、對話、卡片、面板
js/game.js          控制器：任務執行、NPC 對話、面板、存讀檔、結局
data/story.json     Eve 的劇情（5 章、60 任務、21 NPC、12 結局）
data/rpg-system.json  Dai 的系統（屬性、判定公式、等級、技能、裝備、結局條件、小遊戲）
data/tuning.json    實作端補充與微調（所有預設值與數值調整集中在這裡）
vendor/three.min.js three.js r128（本地備份，不依賴 CDN）
tests/              模擬與 E2E 測試
```

`story.json` 與 `rpg-system.json` 保持原樣。程式對它們沒有定義的部分所做的補充、以及為了結局機率所做的微調，全部寫在 `data/tuning.json`。

## 本機執行

資料檔是用 `fetch` 載入的，所以要透過網頁伺服器開啟，例如：

```
python3 -m http.server 8000
```

然後開啟 http://localhost:8000/。

## 測試

```
cd tests && npm install
node sim.js 3000          # 邏輯層大量隨機遊玩，列出各結局機率
node tune.js 6000 random  # 搜尋結局門檻（結果寫進 data/tuning.json 的 endingOverrides）
node e2e.js desktop       # headless Chrome，桌機尺寸，用真實 UI 從頭玩到結局
node e2e.js mobile        # headless Chrome，手機尺寸（390×844、觸控）
```

E2E 需要本機有 Chrome（預設 `/usr/local/bin/google-chrome`，可用環境變數 `CHROME` 指定）。小遊戲在測試時啟用內建自動遊玩（`?auto=1`），其餘操作都走畫面上的按鈕與互動。

## 部署

推送到 `main` 時，`.github/workflows/pages.yml` 會把整個 repo 部署到 GitHub Pages。
