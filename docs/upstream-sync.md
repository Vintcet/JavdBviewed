# Upstream Sync Record

原始项目：https://github.com/Adsryen/JavdBviewed

本仓库 upstream remote：`adsryen`

当前已评估到的 upstream commit：`222ff158`

最后评估时间：`2026-06-27`

## 同步原则

本项目已经和原始项目分叉，不直接按版本号合并。以后检查原始项目更新时，以 upstream commit hash 为基线，从“当前已评估到的 upstream commit”之后开始看。

默认策略是手动评估、选择性吸收，不直接 merge upstream。除非明确决定整段合并，否则优先把有价值的实现移植到当前架构里，避免覆盖本项目已有改动。

## 已评估提交

| Upstream commit | 结论 | 本项目对应提交 | 说明 |
| --- | --- | --- | --- |
| `de2a8baf` | 已吸收 | `4b87d61c` | 吸收 WebDAV 备份/恢复清单、系列、番号能力，并额外保护老备份不清空本地清单。 |
| `222ff158` | 已跳过 | 无 | 原项目更新日志和构建脚本调整，版本逻辑不适合本项目。 |

## 下次检查命令

```powershell
git fetch adsryen main
git log --oneline 222ff158..adsryen/main
```

如果发现新提交，评估后更新本文件：

- 更新“当前已评估到的 upstream commit”。
- 在“已评估提交”表里记录每个 upstream commit 是已吸收、已跳过还是待处理。
- 如果手动吸收了实现，记录本项目对应提交 hash。
