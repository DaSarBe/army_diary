# 島嶼守備 · 角色與武器素材來源

本目錄只放 Quaternius 的 CC0 素材（轉成 glTF 後的執行檔）。原始 FBX 在 `tools/quaternius/fbx/`，GitHub Pages 上傳前會刪除整棵 `tools/`，不會出現在公開網站。

| 名稱 | 作者 | 網址 | 授權 | 本專案用法 |
| --- | --- | --- | --- | --- |
| Ultimate Animated Character Pack | Quaternius | https://quaternius.com/packs/ultimatedanimatedcharacter.html ；OpenGameArt https://opengameart.org/content/animated-characters-pack | CC0 1.0 | `soldier_male`（我軍頭盔）、`blue_soldier_male`（敵軍不同頭盔）、`casual_bald`（具名隊友／便帽輪廓）、`ninja_sand`（敵軍頭巾／沙色）。含 Idle／Walk／Shoot／RecieveHit／Defeat。高檔為原模；中／低檔是 Blender DECIMATE COLLAPSE 預先輸出的 `_mid`／`_low` GLB（目標 ≤1500／≤600，不在執行期抽面）。 |
| Ultimate Guns Pack | Quaternius | https://quaternius.com/packs/ultimategun.html ；OpenGameArt https://opengameart.org/content/low-poly-guns-pack | CC0 1.0 | 第一人稱與世界持槍都用這包，不再用方塊槍。`rifle_t91`←AssaultRifle_1、`rifle_t75`←AssaultRifle2_1（機槍近似）、`rifle_t65`←SniperRifle_1（精確步槍近似）、`pistol_m9`←Pistol_1。型號不必精確，看得出是槍即可。 |

未使用真實國家或政權的旗幟、徽章、臂章。我軍材質改成綠色迷彩、敵軍改成灰藍或沙色，色差拉開。頭盔／便帽／頭巾輪廓不同；友軍頭上有藍色箭頭，靠近才顯示名字。FBX 以 Blender 3.6 轉 GLB（不套用骨架、動畫掛 NLA）。角色在執行期合併成單材質頂點色（我軍 2 draw calls：身體＋藍箭頭；敵軍 1）。槍是獨立合併網格，不計入 `charTriangles`。

## 缺件（Quaternius 找不到，沿用現有程式方塊）

- **吉普車、機車、舢舨、軌道車、發電車**（Cars 包只有轎車／警車／賽車，沒有吉普或機車）
- 第一人稱手臂骨架（槍械包沒有 FPS arms，手部用中性綠手套方塊）
- 角色沒有獨立「跑／蹲走」片段：跑用 Walk 加速，蹲用 Idle
