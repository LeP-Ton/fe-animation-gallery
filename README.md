# 火纹动画图鉴

GBA《火焰之纹章》战斗动画的非官方预览与下载站。素材来自 [Klokinator/FE-Repo](https://github.com/Klokinator/FE-Repo)，保留原始作者说明。

- 全库 2,017 套资源、6,943 个角色资源 GIF，包含原版、同人改绘与其他作品移植。
- 保留步兵、骑兵、弓兵、谋士、辅助五类人形入口，另有其他素材及外形待确认入口。
- 支持原库 23 类筛选、武器与盾具筛选、GIF切换与放大、收藏、备注与JSON导出。
- 可下载当前 GIF、整套或所选 GIF 预览 ZIP；PNG、图集、BIN/DMP与脚本通过分类原始资源包或全库包下载。

## 访问与下载

- 预览网站：https://lep-ton.github.io/fe-animation-gallery/
- 原始资源包：[GitHub Releases](https://github.com/LeP-Ton/fe-animation-gallery/releases/tag/assets-v1)
- 每个下载包的大小、文件数、SHA-256见 `catalog/packages.json`。

## 本地构建

只需要 Python 3.11 及以上版本与 Node.js。预览 GIF 和静态缩略图不纳入 Git，而是在构建时从固定 Release 素材快照与缩略图包还原，并按 SHA-256 校验。

```sh
node --test tests/*.test.js
python3 scripts/build_site.py --restore-previews
python3 -m http.server 8770 --bind 127.0.0.1 --directory site
```

然后打开终端显示的本机地址。GitHub Actions 使用同一构建命令部署 Pages。

如已有对应原始资源，可运行 `scripts/prepare_catalog.py --help` 重新准备索引与缩略图；该准备步骤需要 Pillow，以及来源清单、人形分类清单和资源包清单作为输入。

## 目录

- `src/`：静态站点界面与交互。
- `catalog/metadata.json`：不含本机路径的公开资源索引。
- `catalog/preview-map.json`：原 GIF 路径到内容哈希的映射，用于从 Release 还原。
- `catalog/posters-package.json`：静态缩略图包的地址、大小与校验值。
- `assets/credits/`：原作者说明；`assets/posters/`在构建时恢复。
- `vendor/`：固定版本 JSZip 及原始许可证。
- `scripts/`：索引准备、校验与站点构建。
- `.github/workflows/pages.yml`：GitHub Pages 自动部署。

## 分类与盾具说明

人形、拟人异族、非人形与混合形态分别记录；62套外形/跨形态素材保留待确认，不视为已完成逐帧鉴定。常规素材依据来源职业分类，混杂目录与君主目录有关键帧复核。骑弓、法骑等允许副分类。

只有已具体核查过的51个GIF版本标为无盾候选。名称写着无盾、空手无盾或未经检查，都不自动成为无盾结论。

## 权利与隐私

本站为非官方同人素材整理，与 Nintendo、Intelligent Systems 无隶属关系。站点原创程序许可与美术素材权利分开；详见 `LICENSE` 和 `THIRD_PARTY_NOTICES.md`，各素材以原目录 CREDITS/README 与原作者要求为准。

收藏与备注只写入当前浏览器，本站程序不上传这些内容；导出和下载在访客操作后执行。站点未加入统计脚本或登录系统。GitHub托管服务自身的日志政策适用于网页访问。
