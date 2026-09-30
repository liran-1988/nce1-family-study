from pathlib import Path
import json,hashlib
D=Path(__file__).parent/'delivery-android'
verification=json.loads((D/'delivery-artifact-verification.json').read_text(encoding='utf8'))
if verification['status']!='pass':raise RuntimeError('交付资产验收未通过，拒绝生成最终资产摘要')
media=json.loads((D/'media/media-manifest.json').read_text(encoding='utf8'))
intro=json.loads((D/'video-course-audit.json').read_text(encoding='utf8')) if (D/'video-course-audit.json').exists() else {}
sources=json.loads((D/'verified-course-map.json').read_text(encoding='utf8'))
sourcebytes=13201586909
videobytes=verification['mediaBytes'];apkbytes=verification['apkBytes']
summary={'version':'1.0 家庭离线版','audience':'四年级英语补充学习，不将年级等同语言能力','licenseScope':'仅家庭个人使用，非公开/班级分享授权','platform':'Android 8.0/API26+技术配置；实际测试以android-validation记录为准；iOS不支持','apk':{'filename':'nce1-family-offline.apk','bytes':apkbytes,'sha256':verification['apkSha256']},'media':{'folder':'media/videos','files':216,'format':'Matroska .mkv, copied H264720p25 video + AACmono64 audio -3dB','sourceBytes':sourcebytes,'outputBytes':videobytes,'savedBytes':sourcebytes-videobytes,'reductionPercent':round((1-videobytes/sourcebytes)*100,2)},'textbookScope':sources['auditScope'],'unverified':['家庭真机型号和系统','所有Android8设备兼容','人工音频听辨/主观口型同步','未认证课程的逐字正文、所有词表音标、原练习与答案全量'],'offline':{'firstStart':'课程和内置3PDF无需网络','video':'家长先拷贝所需本地资源并授权SAF目录，不访问D盘','tts':'需要本机已有离线英语音色，无音色时提示，不自动联网下载','records':'固定本地origin localStorage；同签名覆盖更新保留、卸载清数据删除、不同设备不自动同步'}}
(D/'交付清单与边界.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
(D/'先读我-家庭交付.md').write_text(f'''# 家庭离线Android版交付

这是实际APK安装版，不是ZIP源码、PWA或iOS安装包。仅家庭自用；教材出版印次与全书准确性尚未全部核实。

## 交付文件
- nce1-family-offline.apk：{apkbytes:,}字节，约{apkbytes/1024**2:.2f}MiB，内置课程与三份PDF，不内置50小时视频。
- media/videos/：216个真实MKV，{videobytes:,}字节，约{videobytes/1024**3:.3f}GiB；原MP4共{sourcebytes:,}字节，体积减少{sourcebytes-videobytes:,}字节（{(1-videobytes/sourcebytes)*100:.2f}%）。这是实际总量，不是试样外推。
- 手机可仅拷贝需要的课程视频；全套较大，建议USB本地复制，不要求联网。
- 家长使用说明、Android实际验证记录、审核与教材对应清单在本目录。源index只是预览源，不拿它冒充APK。

## 最少使用步骤
1. 将APK传到Android手机/平板，在系统中对本次安装来源允许安装并完成安装，之后可关回该开关。
2. 可先不传视频：安装后课程、练习、内置教材PDF离线可用；桌面点应用图标进入。
3. 观看视频时，把本目录media/videos复制到设备存储；在应用“家长与老师”选择含videos子目录的media文件夹并授权。只用本机目录，勿选云盘提供方。
4. 打开对应课程，主动选择视频Part1、Part2或练习片，不自动连播。PDF可直接看课程原页，参考答案在家长区。
5. 听写/朗读需设备有离线英语音色；无音色不影响图文、PDF、练习和视频，但会提示。

## 不能省略的验收边界
- 目标具体家庭设备型号未提供，真机仍未验证；请以android-validation.md记载的模拟器/版本为准，不能外推所有Android。
- 教材正文已核范围见content-audit.md，候选内容仍带来源状态，不宣传全部144课已准确。
- 视频H264图像码流复制与完整解码不代表已人工听辨或全片口型同步检查。
- 本目录不得当作获得对外分享教材视频的授权；不上传、不公开。

## 附件阅读顺序
审核报告-家庭离线版.md → content-audit.md → 教材视频练习答案对应清单.csv → optimization-notes.md → video-processing.md → android-validation.md → 家长使用说明。
''',encoding='utf8')
print('actual release summary generated')
