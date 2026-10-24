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
- 第 240 天起強制進入「漢光：海岸」。平常仍是第三人稱；按「舉槍」切成第一人稱射擊（30 發彈匣、換彈、掩體、命中判定）。倒下後可選擇重打這一波，或後送（受傷、跳過剩下的波次）。班長的生死在第 4 波結束後才判定。
- 結局共 14 種（含志願役 3 種、負面 2 種、海岸 2 種：倖存者、海岸英雄），結局圖鑑記錄在瀏覽器的 localStorage。

## 專案結構

```
index.html          頁面
css/game.css        樣式（手機優先）
js/engine.js        核心規則：屬性、判定、任務、獎勵、時間、結局（純邏輯，Node 與瀏覽器共用）
js/places.js        地點座標、中文名稱、任務步驟規劃器
js/gfx.js           畫質檔（低／中／高／自動）、自動降級、FPS 疊層
js/characters.js    camp1 角色 GLTF 與 AnimationMixer
js/world.js         three.js 世界：地圖、角色、搖桿/WASD、鏡頭、NPC、拾取物
js/minigames.js     小遊戲：連點、射擊、抽籤、節奏、限時、潛行等
js/fps.js           漢光海岸：第一人稱射擊、掩體、敵人與波次
js/audio.js         Web Audio 合成音效與靜音開關
js/ui.js            HUD、對話、卡片、面板
js/game.js          控制器：任務執行、NPC 對話、面板、存讀檔、結局
data/story.json     Eve 的劇情（5 章主線、60 任務、21 NPC）
data/story_beach.json  漢光海岸劇情（10 個任務，原樣保留）
data/fps-system.json   海岸戰鬥數值（原樣保留）
data/rpg-system.json  Dai 的系統（屬性、判定公式、等級、技能、裝備、結局條件、小遊戲）
data/tuning.json    實作端補充與微調（海岸新結局、T91、門檻都集中在這裡）
vendor/three.min.js three.js r128（本地備份，不依賴 CDN）
vendor/GLTFLoader.js 與後製（r128 examples）
assets/characters/  CC0 角色（Kenney Animated Characters 3 的 glTF／PNG）
island/assets/quaternius/  島嶼守備 Quaternius 角色／槍 GLB（CC0）
tools/kenney-fbx/   Kenney FBX 原檔（不隨 GitHub Pages 發布）
tools/quaternius/   Quaternius FBX 原檔（不隨 GitHub Pages 發布）
data/army-gfx.json  主遊戲畫質表與預算
tests/              模擬與 E2E 測試
```

`story.json`、`rpg-system.json`、`fps-system.json`、`story_beach.json` 保持原樣。程式補充與結局機率微調寫在 `data/tuning.json`。`survivor`、`beach_hero` 與 `it_t91` 只在 `tuning.json` 定義一次；`rpg-system.json` 裡重複的同名結局與物品在載入時略過。

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
node gfx-camp1.js         # 新訓中心畫面預算、角色面數、自動降級
```

E2E 需要本機有 Chrome（預設 `/usr/local/bin/google-chrome`，可用環境變數 `CHROME` 指定）。小遊戲在測試時啟用內建自動遊玩（`?auto=1`），其餘操作都走畫面上的按鈕與互動。

## 部署

推送到 `main` 時，`.github/workflows/pages.yml` 會把網站檔部署到 GitHub Pages。上傳前會刪除 `tools/`，所以 Kenney Animated Characters 3 的 FBX 原檔（`tools/kenney-fbx/`：`characterMedium.fbx`、`idle.fbx`、`run.fbx`）不會出現在公開網站路徑。執行時只用 `assets/characters/kenney/character.glb` 與 PNG。

## 數值調校說明

結局機率用 `tests/sim.js`（邏輯層，同一份 `engine.js`）模擬大量隨機遊玩，再用 `tests/tune.js` 搜尋結局門檻。為了讓每個正常結局在隨機玩法下至少 3%，做了這些微調，全部寫在 `data/tuning.json`（原始檔不動）：

- `endingOverrides`：調整 `exemplar`、`brother`、`iron`、`rule`、`sunny`、`calm`、`vstar`、`vlead`、`bad_injury` 的門檻。
- 背景起始屬性：工地學徒從 65/50/45/45 改成 62/48/40/45（讓總和符合系統檔的「170 到 195」）。
- 每日規則：日常操課每天消耗少量體力、疲勞並得 5 經驗；未受傷時每 25 天體能 +1；每日有小機率被記違規（軍紀越高越低）。
- 家書的「每日士氣 +1」改成每 10 天一次，且士氣低於 70 時才生效。

## 已知問題

- 小遊戲在自動測試中用內建自動遊玩驗證，實際觸控手感沒有在真實手機上測過；沒有實機測過 iOS／Android。
- 鏡頭沒有碰撞偵測，貼近圍牆或建築時可能穿牆。
- 靜態物件沒有合併 mesh，低階手機在營區地圖可能掉幀。
- `story.json` 裡 `16:00`、`21:00`、`23:59` 這類時刻型限制沒有實作；數字型的限時以「遊戲內秒數 ÷ 9 加路程」換算成現實秒數。
- 結局機率是對「隨機玩家」的估計，實際玩家的分布會不同。加入海岸章後，隨機模擬裡「倖存者」偏高，因為班長與小林的傷亡是機率判定。
- 敵人開火間隔是實作端的節奏（命中率與傷害仍用 `fps-system.json`）。硬派難度若一直探頭會很難打。
- 海岸戰鬥的自動驗證用測試用瞄準機器人，不是真人操作；倒下後選「重打／後送」的完整腳本沒有在瀏覽器裡跑完。沒有在實機 iOS／Android 上打過這一章。
