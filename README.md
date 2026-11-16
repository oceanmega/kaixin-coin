# 开心捡金币

给妈妈做的捡金币横版小游戏（网页版 / PWA，可加到 iPhone、iPad 主屏幕，离线也能玩）。

在线玩：https://oceanmega.github.io/kaixin-coin/

## 玩法
点一下跳，按住跳更高，空中再点一下二段跳。捡金币有连击加分；碰到小怪只扣几枚金币，不会死。每天一个新关卡（日期做种子），三颗星、连续签到奖励、商店换帽子/颜色/场景。

## 素材来源与授权
- **Kenney**（https://kenney.nl）CC0 1.0 公共领域素材：
  - New Platformer Pack（地砖、金币、小怪、旗子、火把、HUD 数字、山丘背景）
  - Interface Sounds、Digital Audio、Impact Sounds、Music Jingles（音效）
  - 授权原文：`assets/licenses/`
- 主角「豆豆」序列帧，以及江南老家 / 海边 / 雪乡 / 星空夜背景：按 Kenney 画风用 AI 图像生成的原创图（原图在 `src-art/`）。
- 背景音乐、代码：原创。

## 构建素材
`python3 tools/build_assets.py`（需要 Kenney 素材包解压到 `/workspace/kenney`、Pillow、numpy、ffmpeg），会生成 `assets/atlas.png`（精灵图集）、`assets/atlas.json`、`assets/bg/*`、`assets/sfx/*.mp3`。
