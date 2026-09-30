# 新概念英语 · 家庭学习

家庭自用学习页（课文、词汇、练习）。**本仓库不含教学视频、教材 PDF、签名密钥。**

## 网页 / PWA

GitHub Pages 打开后：课文和练习可用。视频需在 `video-config.js` 填写 OSS 前缀后才会从网盘播：

```js
window.NCE_VIDEO_BASE = "https://你的桶.oss-cn-区域.aliyuncs.com/nce1";
```

对象键约定：`001.mp4` … `216.mp4`（与课次视频序号一致，不是把一课拆成 Part1/Part2）。

未配置 OSS 时，本机可双击 `打开学习.cmd`，把 D 盘原始 MP4 映射到 `/videos/001.mp4`。

## 本机 Android

`delivery-android/nce1-family-offline.apk` 需要在本机构建，不随仓库分发（包内含教材扫描件）。视频课包仍用本机目录。

## 不要提交

视频、`books/*.pdf`、APK、`android-app/.private/`（签名钥）。
