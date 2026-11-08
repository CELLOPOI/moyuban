# 摸鱼办（moyuban）维护入口

这是给其他人安装的 DeepSeek Harness 插件。它在原生工作区里提供 NGA、百度贴吧和小红书阅读入口。先从 [README](README.md) 了解使用者看到的行为；涉及侧栏、卡片、右栏时，对照[选吧界面](docs/tieba-workspace.png)和[文字摘录界面](docs/excerpt-workspace.png)。

**当前版本为 0.14.0**，包名为 `moyuban`，适配 DSH 0.2.2-rc.1。小红书采用主区文字索引，右栏按需展开附件。[游客与专用账号的研究结论](docs/xiaohongshu-research.md) · [配置与站点适配器接口](docs/maintenance.md)

首页配图使用最终界面与虚构条目，图注标明「界面示意，条目为虚构」。打包时核对 README 的相对图片路径，并在已安装插件的详情页查看。

## 从哪里读

| 要理解或修改的事 | 从这里沿调用链读 | 对应测试 |
| --- | --- | --- |
| 插件加载与前后端通信 | [包入口与兼容声明](package.json)、[DSH 加载配置](cordis.patch.yml)。从[客户端请求](src/client/host-api.js)沿[宿主路由](src/host/index.js)读到[动作分发](src/host/actions.js) | [通过实际请求函数和路由验证站点隔离](test/sites.test.js) |
| 小红书推荐、扫码和附件 | [独立官网会话](src/sites/xhs/browser.js)与[单篇归属、已渲染正文和来源错误](src/sites/xhs/detail.js) → [批次、刷新、账号边界和媒体定位](src/sites/xhs/feed.js) → [同源媒体和 Range](src/sites/xhs/media.js)。查看[端内状态](src/client/excerpt-store.js)与[文字索引和原生右栏](src/client/excerpts.jsx) | [数据和账号隔离](test/excerpts.test.js)、[多批旧卡和单篇错误](test/excerpt-detail.test.js)、[输入栏、原生加载动画、窗口尺寸与 Esc](scripts/check-excerpts.mjs)、[专用账号实机路径](scripts/check-excerpts-live.mjs) |
| 小红书首页首次打开与刷新失败 | [首页读取](src/sites/xhs/home.js)从同一次导航的 HTML、接口和页面卡片取首批。已连接账号遇到登录页不得降级为游客；刷新只有读到新条目后才替换原索引 | [响应体不可读、空批次先到、登录过期、网络故障与重试](test/excerpt-home.test.js) |
| 原生工作区加号、快捷键与 Esc | [客户端挂载](src/client/index.jsx)注册输入框、右栏、Esc 和快捷键。[工作区导航](src/client/workspace-navigation.js)识别选版空会话，记住上一个工作对话和最近版面 | [客户端产物的插槽、选吧与返回](test/client-workspace.test.js) |
| 版面身份、置顶与工作区持久化 | [会话编号及旧版兼容](src/shared/boards.js) → [手动入口、收藏与最近选版的文件名](src/host/board-files.js) → [版面库与置顶规则](src/host/board-library.js) → [原生会话投影](src/host/workspace.js) | [收藏和置顶](test/directory.test.js)、[保留自定义会话标题](test/workspace.test.js) |
| 设置保存、数据目录迁移与缓存 | [设置表单](src/client/settings.jsx)使用[端内设置快照](src/client/settings-store.js)。[宿主设置](src/host/settings.js)按版面文件规则迁移数据，与贴吧分类共用[文件锁和原子写入](src/host/files.js)。[公开目录与媒体缓存](src/host/cache.js)按站点管理 | [设置读写顺序、迁移与缓存](test/settings.test.js) |
| 贴吧选吧、编辑分类 | [卡片与右栏](src/client/directory.jsx)、[输入框菜单](src/client/reply-toolbar.jsx) → [目录编辑器](src/client/directory-editor.jsx) → [分类文件、顺序与写入冲突](src/sites/tieba/directory.js) | [外部编辑、界面保存与重启](test/tieba-directory.test.js) |
| 贴吧扫码与关注列表 | [右栏关注状态](src/client/followed.js) → [站点注册与 DSH 凭据边界](src/host/sites.js) → [扫码](src/sites/tieba/account.js)、[凭据的域与路径](src/sites/tieba/session.js)、[关注同步](src/sites/tieba/follows.js) | [凭据作用域、分页与换号](test/tieba-account.test.js) |
| NGA 读帖、引用和回帖确认 | [NGA 适配器](src/sites/nga/index.js) → [原帖定位、格式回退与站点回执](src/sites/nga/api.js)。宿主和客户端共用[发送确认条件](src/shared/errors.js) | [读取回退](test/nga-read.test.js)、[旧入口的引用与回执](test/sites.test.js) |
| 贴吧匿名读帖与楼中楼 | [贴吧适配器](src/sites/tieba/index.js)处理版面归属、分页及 `320036` 回退，[正文解析](src/sites/tieba/content.js)保留原楼号并提取图片和子回复 | [匿名访问、楼号与独立分页](test/tieba.test.js) |
| 讨论索引、楼层与草稿 | [阅读状态](src/client/reader.js)按入口编号恢复草稿和页码，向原帖编号读写。[讨论索引与楼层](src/client/transcript.jsx)和[输入框](src/client/composer.jsx)订阅同一个阅读器 | [跨标签页草稿与回帖](test/reader.test.js)、[输入与引用](test/composer.test.js)、[返回索引后恢复楼层](test/workspace.test.js) |

## 重构时要保留的行为

- 选吧和选帖有两个入口：左栏「百度贴吧」的加号 → 主区分类卡片 → 原生右栏分组和吧 → 选中吧后按置顶和自动跳转设置处理。进入版面会话后才会看到选帖用的「讨论索引」。
- 贴吧普通分类以 DSH 主目录下的 `plugin-workspaces/百度贴吧/分类/*.ts` 为准。主目录取 `DSH_HOME`，默认 `~/.dsh`。新装时仅显示关注卡，升级时保留已有文件和顺序。外部编辑和输入框「＋ → 编辑选吧目录…」读写同一批 UTF-8 文件，`export const sections` 只解析字面量。
- 「我关注的吧.ts」是第一张卡片，由当前账号同步，不是手工分类文件。打开它才按需提示扫码。公开查吧、读帖不依赖账号；读帖遇到 `320036` 有匿名备用路径。关注不会批量加入左栏，换号或退出后，旧请求不能把上个账号的关注写回右栏。持久凭据只交给 DSH 凭据服务，Passport 与贴吧各自的票据作用域必须保留。
- NGA 保留独立「资料整理」工作区、原有会话编号、收藏和引用回帖；贴吧保持只读。保留已有会话的自定义名称、草稿和 Esc 返回恢复。两站界面相似时，先对照能力和持久化数据再抽取公共代码。
- NGA 读取和回帖沿用显式 `live` 请求。旧客户端的 `example` 请求必须在宿主分发前拒绝，旧端内的示例导航和草稿不能作为真实帖的后备数据。已落盘的 `defaultSource` 应允许升级读取其余设置。[旧客户端、草稿和回执回归](test/sites.test.js) · [配置升级回归](test/settings.test.js)
- 「资料摘录 → 阅读索引」打开后只呈现推荐标题；预览固定使用同一个中性标签地址。正文默认折叠附件，不要挂载隐藏图片、封面或有声自动播放的视频。切换账号清除旧索引、游标和媒体授权；不要将个性化推荐放进公开缓存。实机脚本只在临时 DSH Web 宿主上运行：把本地启动地址放在进程环境变量 `EXCERPT_TEST_URL`，不要保存或输出其中的令牌。

## 验证与本地提交

1. 接手时先看 `git status --short --branch`、`git log -6 --oneline --decorate`、`git diff --stat` 和 `git ls-files --others --exclude-standard`。有既有改动时，再看 `git diff --cached` 区分已暂存的工作。保留仓库根目录已有的各版本安装包；它们被 Git 忽略。
2. 使用已有依赖。按改动运行对应测试，跨模块修改运行 `npm test`。客户端或其依赖变化时先运行 `npm run build`，再运行 `npm test`，原生插槽测试会加载生成的 `dist/client.js`。将该产物随源码提交。需要运行 DSH 时用临时 `DSH_HOME` 和测试凭据。
3. **默认做本地 Git 提交。** 完成一项可以独立验证的改动后，检查实际差异、验证结果和暂存内容，主动 `git commit`，无需逐次确认。一次提交只收本项工作；保留他人已暂存和未暂存的改动。仅审阅且没有改动时不做空提交，用户明确要求暂不提交时依其要求。交接时给出提交号。
4. 默认提交只指本地仓库。推送、发布、在使用者环境安装依赖或插件、操作真实账号，须有单独授权。

移动模块、更改持久化约定或升级已验收版本时，顺手更新本页对应的入口和测试链接。
