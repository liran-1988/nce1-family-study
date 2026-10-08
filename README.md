# 新概念英语 · 家庭学习

家庭自用学习页（课文、词汇、练习）。**本仓库不含教材 PDF、签名密钥。** 视频按学习进度**分批放进同仓 `videos/`，推到 GitHub Pages**。

## 网页 / PWA

### 手机/平板朗读修复

网页版优先播放 `audio/voice/*.mp3` 的本地生成录音，避免浏览器没有 `speechSynthesis` 或没有离线英语音色时全部无声。音频为参考美音，不是教材原声；未调用在线TTS。

更新时必须一起保留 **`index.html`、`sw.js` 和整个 `audio/` 文件夹**，只上传index不会使手机读出声音。首次读取未缓存声音需要联网；课程页可选“缓存本课声音”，成功后相应声音可离线。清浏览器数据后需重新缓存。

详细证据与设备边界见 `delivery-web-audio/声音修复与家长说明.md`。本地生成不等于线上已更新；完成推送后必须核对线上资源及播放结果。设备媒体音量、蓝牙输出和实际听辨还需用户确认。

### 本项目发布约定

用户于 2026-10-08 明确授权：本项目修改完成并通过检查后，提交、推送到 `liran-1988/nce1-family-study`，验证 https://liran-1988.github.io/nce1-family-study/ 生效后再通知。此约定仅适用于该应用，不扩展到工作区其他仓库、付费服务、原始教材 PDF、新的视频分发或签名密钥。

发布只暂存本次相关文件，不使用全仓 `git add .`；保留现有视频与配置，禁止强制推送。核对页面、Service Worker 和音频资源，区分浏览器技术播放验证与 Android 真机、人耳听辨。已安装 PWA 更新时先联网关闭后重新打开，必要时刷新；不要为更新而清除浏览器数据，以免丢失学习记录与离线缓存。

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
