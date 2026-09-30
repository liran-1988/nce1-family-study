# 新概念英语 · 家庭学习

家庭自用学习页（课文、词汇、练习）。**本仓库不含教材 PDF、签名密钥。** 视频按学习进度**分批放进同仓 `videos/`，推到 GitHub Pages**。

## 网页 / PWA

打开 Pages 后：课文和练习始终可用。视频只播仓库里当前这一批。

### 视频分批（传到 GitHub，约 10 课 / ~200MB）

1. 打包当前窗口（默认压缩，单文件远小于 100MB 限制）：

```bash
python pack-video-batch.py 1 10
```

生成 `videos/*.mp4` + `videos/manifest.json`。

2. 改 `video-config.js` 窗口（与本批一致）：

```js
window.NCE_VIDEO_BASE = "";  // 同仓相对路径 videos/001.mp4
window.NCE_VIDEO_FROM = 1;
window.NCE_VIDEO_TO = 10;
```

3. 提交并推送（视频要进 git，不要再 ignore）：

```bash
git add videos video-config.js
git commit -m "videos: lessons 1-10 for Pages"
git push
```

4. 学完换下一批（例如 11–20）：

```bash
python pack-video-batch.py 11 20   # 默认会删掉 videos 里旧 mp4
# 改 FROM/TO 为 11 / 20 后 commit + push
```

前 30 单元可按 1–10 → 11–20 → 21–30 轮换；旧课视频从仓库删掉即可，课文练习仍在。

窗口外的课：页面仍可学课文/练习，不提供视频按钮。

本机未推视频时：双击 `打开学习.cmd` 可播 D 盘全量原片。

## 本机 Android

`delivery-android/nce1-family-offline.apk` 需本机构建，不随仓库分发。

## 不要提交

`books/*.pdf`、APK、`android-app/.private/`、未压缩原片大包。
