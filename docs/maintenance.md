# 配置、分类文件与站点适配器

## 阅读设置

DSH 以 `moyuban` 安装、启用插件和挂载设置页，[中文显示名](../locale/zh.json)为「摸鱼办」。各版共用原有的 `dsh-nga-reader` 会话编号、浏览器存储键、凭据键、数据路径、资源地址和宿主 API 路径，因此升级后可以继续读取旧数据。

设置页会显示宿主上的配置文件、缓存和版面数据目录。默认配置文件是 `DSH_HOME/plugin-workspaces/资料整理/reader-settings.json`。保存表单时，宿主按文件修订号核对并原子写入。如果其他窗口或编辑器已经修改文件，点「重新读取」合并后再保存。[默认配置](../reader-settings.json)

| 设置项 | 用途和默认值 |
| --- | --- |
| `cacheDirectory`、`boardDataDirectory` | 留空使用插件数据目录下的 `cache` 和 `boards`。指定宿主绝对路径或 `~/` 路径后，会分别使用其中的 `dsh-nga-reader-cache` 和 `dsh-nga-reader-boards` 子目录。 |
| `mediaCacheMiB` | 论坛图片和表情的缓存上限，默认 128 MiB，设为 0 时阅读端直接加载。 |
| `directoryCacheMinutes`、`favoriteSyncMinutes` | 公开版面目录默认缓存 30 分钟，设为 0 可关闭。NGA 收藏默认每 5 分钟可再次自动同步。 |
| `renderSmiles`、`foldImages`、`showAuthorUid` | 论坛表情显示为图片、楼层配图默认折叠、显示公开 UID，默认均开启。 |
| `promoteOnPick`、`openOnPick` | 默认将刚选的版面置顶并打开。关闭自动打开后，可留在目录继续选版。 |
| `defaultModel`、`defaultEffort`、`defaultPermission` | 新阅读会话的工具栏外观。已有会话优先使用端内保存的选择。这些选项不参与论坛请求。 |

切换到空的版面数据目录时，宿主会复制已有手动入口、各账号的收藏快照和最近选版记录。目标已有版面数据时，使用目标中的记录。原目录保留，公开目录和媒体缓存在新位置按需重建。0.11.2 配置中的 `defaultSource` 会在读取时忽略，下次保存设置时移除。[设置读写与迁移](../src/host/settings.js) · [版面文件命名](../src/host/board-files.js)

## 从本项目旧版升级

[CELLOPOI 发布的摸鱼办 0.13.0](https://github.com/CELLOPOI/moyuban/releases/tag/v0.13.0) 的安装包为 `dsh-moyu-0.13.0.tgz`。如果 Web 端安装的是这一版，先停掉 `dsh web`，在新版安装包所在目录执行下面三行命令。

```sh
dsh plugin --profile web remove dsh-moyu
dsh plugin --profile web add ./moyuban-0.14.0.tgz
dsh web
```

本项目更早的 0.11.2 和 0.12.0 使用包名 `dsh-nga-reader`。从这两版升级时，Web 端第一行改用 `dsh plugin --profile web remove dsh-nga-reader`。桌面端在 **插件 → dsh-nga-reader** 卸载旧版，再安装新版。

## 贴吧分类

每份普通分类是「百度贴吧」工作区的 `分类/<分类名>.ts`。在编辑器中保存，或用文本编辑器写入 UTF-8 后切回阅读端，都会更新同一份目录。例如，可以自行创建 `我的摄影.ts` 并填写以下内容。

```ts
export const sections = {
  "摄影": ["摄影吧", "数码相机吧"],
};
```

每个分组按数组顺序列出吧名，支持注释和尾逗号。宿主只解析 `sections` 数据字面量。普通分类的顺序和稳定编号保存在 `.目录.json`。首张「我关注的吧.ts」由当前百度账号提供，不对应磁盘上的分类文件。[解析、并发保存与中断恢复](../src/sites/tieba/directory.js)

## 接入论坛站点

将适配器加入 `installedSites()`。提供稳定的 `id`、显示名 `name` 和工作区目录名 `workspaceName`。目录名与会话编号在发布后需保持稳定。新站点的版面使用 `boardRef(site, kind, id, name)`，宿主据此校验请求与持久化记录的站点归属。[站点注册](../src/host/sites.js) · [会话编号](../src/shared/boards.js) · [贴吧适配器](../src/sites/tieba/index.js)

| 方法 | 输入与返回值 |
| --- | --- |
| `directory()` | 返回含 `key, name, groups` 的分类，每组有 `name, boards`。也可用 `parseBoard` 或 `searchBoards` 提供查找入口。 |
| `list({ board, page, account })` | 返回 `{ page, hasNext, items }`。每条讨论有 `id, title, author`。跨版索引另给 `entryId` 保存草稿和位置，读写用原帖 `id`。 |
| `thread({ board, id, page, account })` | 返回 `{ id, title, page, pages, posts }`。楼层有 `id, floor, author, blocks`，可附公开 `authorId` 与秒级 `time`。正文块支持 `text`、`quote` 和 `image`，适配器负责校验链接与图片地址。 |
| `replies({ board, id, postId, page, account })` | 有楼中楼的站点可提供此方法并设置楼层的 `replyCount`，展开后返回 `{ page, pages, items }`。 |

宿主按实际实现的方法声明能力。`createAccount` 接入站点专属的 DSH 凭据记录，`favorites` 同步收藏，`imageUrl` 校验允许缓存的媒体来源。实现 `reply` 才能发送，实现 `quoteTarget` 才能引用。论坛读取和回帖请求沿用 `mode: "live"`。只有明确收到站点回执的回帖才返回 `{ sent: true }`。[动作分发](../src/host/actions.js) · [NGA 回执校验](../src/sites/nga/api.js)

小红书提供 `createFeed`，按官网首页批次和账号代次处理推荐、正文、评论和附件。主区和右栏共享同一阅读状态。工作区会话只保存挂载所需的标题与本地轮次。[首页实现](../src/sites/xhs/feed.js) · [DSH 布局接口](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-layout/README.zh.md)
