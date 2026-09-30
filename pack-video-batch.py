# -*- coding: utf-8 -*-
"""按课号窗口打包视频，准备推到 GitHub Pages 同仓 videos/。

默认压缩（540p），约 10 课 ≈ 150–250MB，单文件远小于 GitHub 100MB 硬限。

用法：
  python pack-video-batch.py 1 10
  python pack-video-batch.py 11 20
  python pack-video-batch.py 1 10 --no-compress

输出：videos/001.mp4 … + videos/manifest.json

然后：
  1) 改 video-config.js 的 NCE_VIDEO_FROM / NCE_VIDEO_TO
  2) git add videos video-config.js && git commit && git push
  3) 换批时先删 videos 里旧 mp4，再打新包推送
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = Path(r"D:/BaiduNetdiskDownload/新概念英语/2. 新概念1-【2024版】")
MAP = ROOT / "android-app" / "media-map.json"
OUT = ROOT / "videos"


def seq_of(path: str) -> int:
    return int(re.search(r"(\d+)", Path(path).stem).group(1))


def have_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def compress_copy(src: Path, dest: Path) -> None:
    cmd = [
        "ffmpeg", "-y", "-i", str(src),
        "-vf", "scale=-2:540",
        "-c:v", "libx264", "-crf", "30", "-preset", "fast",
        "-c:a", "aac", "-b:a", "64k",
        "-movflags", "+faststart",
        str(dest),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main() -> int:
    ap = argparse.ArgumentParser(description="Pack lesson videos for GitHub Pages rotation")
    ap.add_argument("from_lesson", type=int)
    ap.add_argument("to_lesson", type=int)
    ap.add_argument("--with-practice", action="store_true")
    ap.add_argument("--no-compress", action="store_true")
    ap.add_argument("--keep-old", action="store_true", help="不要清空 videos/，只覆盖本批文件")
    args = ap.parse_args()
    a, b = args.from_lesson, args.to_lesson
    if not (1 <= a <= b <= 144):
        raise SystemExit("课号须在 1–144，且 from <= to")
    if not SRC.is_dir():
        raise SystemExit(f"源视频目录不存在: {SRC}")
    compress = not args.no_compress
    if compress and not have_ffmpeg():
        raise SystemExit("未找到 ffmpeg。请安装后重试，或加 --no-compress。")

    mapping = json.loads(MAP.read_text(encoding="utf-8"))["videos"]
    if OUT.exists() and not args.keep_old:
        for old in OUT.glob("*.mp4"):
            old.unlink()
        man = OUT / "manifest.json"
        if man.exists():
            man.unlink()
    OUT.mkdir(parents=True, exist_ok=True)

    by_seq = {}
    for p in SRC.iterdir():
        if p.suffix.lower() != ".mp4":
            continue
        m = re.match(r"^(\d+)", p.name)
        if m:
            by_seq[int(m.group(1))] = p

    files = []
    total = 0
    for lid in range(a, b + 1):
        items = mapping.get(str(lid)) or []
        if not items:
            print(f"跳过 Lesson {lid}：无映射")
            continue
        chosen = items if args.with_practice else items[:1]
        for it in chosen:
            seq = seq_of(it["path"])
            src = by_seq.get(seq)
            if not src or not src.exists():
                print(f"缺文件 Lesson {lid} seq={seq}")
                continue
            name = f"{seq:03d}.mp4"
            dest = OUT / name
            if compress:
                print(f"压缩 L{lid:03d} …", flush=True)
                compress_copy(src, dest)
            else:
                shutil.copy2(src, dest)
            size = dest.stat().st_size
            if size > 95 * 1024 * 1024:
                raise SystemExit(f"{name} 超过 95MB，GitHub 可能拒收。请保持压缩或缩小跨度。")
            total += size
            files.append({
                "lesson": lid,
                "seq": seq,
                "file": name,
                "title": it.get("title"),
                "sourceName": it.get("sourceName") or src.name,
                "bytes": size,
                "compressed": compress,
            })
            print(f"L{lid:03d} -> {name}  {size/1024/1024:.1f}MB")

    manifest = {
        "host": "github-pages",
        "fromLesson": a,
        "toLesson": b,
        "withPractice": bool(args.with_practice),
        "compressed": compress,
        "count": len(files),
        "bytes": total,
        "approxMB": round(total / 1024 / 1024, 1),
        "files": files,
        "videoConfigHint": {
            "NCE_VIDEO_BASE": "",
            "NCE_VIDEO_FROM": a,
            "NCE_VIDEO_TO": b,
        },
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n完成：{len(files)} 个文件，约 {manifest['approxMB']} MB -> {OUT}")
    print(f"改 video-config.js：FROM={a} TO={b}，然后 git add videos 并 push。")
    if manifest["approxMB"] > 280:
        print("提示：本批偏大，克隆/推送会慢；可改成一次 6–8 课。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
