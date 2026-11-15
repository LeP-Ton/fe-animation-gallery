# 动画预览下载站开发规范

本仓库为无构建框架依赖的 HTML/CSS/JavaScript 静态站，使用 GitHub Pages 托管，原始工程素材由 GitHub Releases 提供下载。

- `src/` 管网页，`catalog/` 管公开索引，`assets/posters/`与`assets/credits/`保留缩略图与作者说明。
- GIF和静态缩略图不纳入Git；`scripts/build_site.py --restore-previews`从固定Release下载并校验后还原。
- `site/`是生成目录，不手工修改，不提交Git。构建输出须保持小于GitHub Pages的1GB上限。
- 不提交本机绝对路径、个人剧情资料、浏览器收藏数据或凭据。源资源路径使用原库相对路径及公开来源链接。
- 动画原件和作者署名保留，程序许可不覆盖美术素材。未核查盾具不能推断无盾。
- 修改后运行 `node --test tests/*.test.js` 和构建；交互变化需验证浏览器播放、版本切换和下载。
- 新增说明和注释使用中文，原始资源名和已有专业名词可保留英文。
