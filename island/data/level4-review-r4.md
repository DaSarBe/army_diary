# 第四輪複查（PR #10，commit 51512aa）：第 2、3 關確認 + 第 4 關坑道 + 擲骰後的敘事

## 一、第 2、3 關：我上次提的都有改進去
radar_complete_late、radar_door_missing_weak、vehicle_ridge 的新 chatter、ridge_callout toast（弱訊號與小林陣亡不播）、ridge_rest_alone、outpost_roster_missing、ridge_complete 去重，我都在 story.json 裡看到了。

## 二、最重要的問題：關卡結束才擲骰，但玩家完全沒被告知「誰死了」
`finishLevel` 先 `chapterFate`，再播 complete 對白。陣亡只會出現在下一關開頭的 `_missing` 版本和結算卡的一行字「阿凱：陣亡（已鎖定）」。黑場加無線電的死亡呈現（`companionRadio`）只在戰鬥中血量歸零時才會用。
結果：玩家在稜線上看阿凱笑著吃過期餅乾，按下繼續，下一關阿凱就不見了。這不符合我們的規則「死亡用黑場加無線電帶過」，也浪費了前面鋪的情緒。

建議實作（Sam）：`finishLevel` 裡如果這次擲出 kia，在 complete 對白之前先呼叫 `companionRadio(id, pickCompanionRadio(id))`，播黑場加無線電，再播 complete。不要在結算卡才告知。

「關卡結束擲出的陣亡」要用新的 radio 句子，因為 `akai_down`／`lin_down` 現有的句子是寫給「戰鬥中倒下」的（「他守的那一段，沒有人退」）。請在 story.json 加 `lin_roll`、`akai_roll`、`wang_roll` 三組 radio，用於擲骰陣亡：

**akai_roll（第 3、4、5 關結束時）**
- 黃連長：「阿凱的頻道沒有再開。」
- 黃連長：「他最後一個訊息，是問燈亮了沒有。」
- 備選：電台：「……保險單還沒簽完。」（只在第 4 關結束後用，呼應 tunnel_mouth 的「我還沒簽完那張保單」）

**lin_roll（第 1、3、4、5 關結束時）**
- 黃連長：「小林，回答。……小林，回答。」
- 電台：「……南灘通信，沒有訊號。重複，沒有訊號。」
- 黃連長：「他最後一句，是報位置。位置我收到了。」
- 備選：（第 1 關結束專用，天線剛架好）黃連長：「天線是他架的。訊號一直在。」

**wang_roll（第 4 關，已由 tunnel_outro_kia 處理，見下）**

注意：這些 radio 播完後，complete 對白裡不能再出現陣亡者。現有 complete 對白只有黃連長與電台，OK。

## 三、第 4 關坑道問題

### 必修
1. **阿凱陣亡後，第 4 關仍有阿凱台詞。** 第 3 關結束若阿凱陣亡：
   - `vehicle_rail` chatter「我在後面放煙。你先走。」
   - `vehicle_tunnel_jeep` chatter「班長，你先坐好」
   - `tunnel_outro`「班長，你先坐好」
   都沒有阿凱陣亡版。pickStory 這三處沒判 akai kia。
   替換（阿凱陣亡版）：
   - `vehicle_rail_akai_kia.chatter`：黃連長：「聲音太大了。抓好。」
   - `vehicle_tunnel_jeep_akai_kia.chatter`：王班長：「誰教你們這樣開車的？我的屁股比腿還痛。」黃連長：「班長，你先坐好。」王班長：「我是在坐好啊！」（把「你先坐好」讓給連長）
   - `tunnel_outro_akai_kia`：王班長：「你們幾個……少了一個吧？」黃連長：「少了一個。他的呼號，我收到了。」王班長：「……我知道了。」
   - 小林也陣亡時，這幾處只留黃連長與王班長。
2. **`vehicle_tunnel_jeep` chatter 與 `tunnel_outro` 逐字相同**，又重複一次（機車段那種問題）。留 jeep 上車的 chatter，`tunnel_outro` 改：
   - 王班長：「停。讓我自己站一下。」
   - 王班長：「……腿還在。好。」
   - 黃連長：「坑道過了。」（這句已在 tunnel_complete，下面第 4 點刪掉其一）
3. **軌道車路線也會播「誰教你們這樣開車的」**：`tunnel_outro` 在 rail 或 jeep 都用，但軌道車不是「開車」。建議加 `tunnel_outro_rail`：
   - 王班長：「這什麼車？比我當兵時的運煤車還吵。」
   - 王班長：「……不過你們來得不算晚。」
4. **「坑道過了」說了兩次**：`tunnel_outro_walk` 與 `tunnel_complete`。`tunnel_outro_walk` 黃連長那句刪掉，改：
   - 王班長：「下一程我自己走。你們先把水喝完。」
   - 黃連長：「慢慢走。」
5. **王班長陣亡版 `tunnel_outro_kia` 太薄（只有「……」和「雜訊」）。** 他是主角方子豪的私人理由，這一刻值得用心。黑場，聲音，不渲染：
   - 王班長：「……你怎麼來了。我又沒叫你。」（呼應第一句）
   - （黑場，只有引擎聲，兩秒）
   - 黃連長：「班長的呼號不再回應。他帶過的人，今天站得很穩。」
   - 電台：「收到。」
   這也呼應 `isl_chat_wang` 選項：若玩家在船艙選了「王班長在島上。我是來找人的」，在 `wang_found` 加一個變體：王班長：「你怎麼來了？我又沒叫你。」方子豪（旁白字幕）：「我是來找你的，班長。」——這個變體給 `isl_chat_wang` 玩家，其餘玩家不變。

### 建議修
6. **`captives_choice` 之後沒有人反應。** 背著班長做選擇，班長是最有資格說話的人：
   - 選回頭救：`rescue_captives.done` 後加，王班長：「……你比當年膽子大。」
   - 選先走：王班長：「不用解釋。我當班長的時候，也做過這種決定。」
   玩家沒被評價，也不被安慰。
7. **`tunnel_choice` 的黃連長一句話講了四個選項**，念起來像選單。改成兩段：
   - 黃連長：「王班長在最深處。坑道很窄，聲音會被放大。」
   - 黃連長：「潛進去、清場、推軌道車衝出去，外面也停了一台吉普。」
8. **`tunnel_mouth` 的小林台詞很好**（「如果我們一起死在這，誰會先被發現」），但第 4 關結束後小林有機率陣亡（基礎 14%），這句會變成回頭看的反諷，我認為是優點，不要刪。

## 四、flag 與邏輯（給 Dai 看）
- `vehicle_tunnel_jeep_kia` 的條件是 `fateOf('wang') === 'kia'`，但王班長的擲骰是 `tunnel_outro` 才呼叫 `chapterFate('wang')`，在吉普車那一段之前通常還沒擲，所以這個場景很少會被用到。如果這是有意設計（只有戰鬥中血量歸零才會觸發），那沒問題；如果希望「擲出陣亡」也走這個 jeep kia 版，請把王班長的擲骰移到 `rear_wave` 後、`tunnel_outro` 前，並把上述順序寫進規格。
