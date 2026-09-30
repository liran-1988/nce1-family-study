# -*- coding: utf-8 -*-
"""Create nce1-study-app/videos/001.mp4 ... as symlinks to original MP4s (no copy)."""
from pathlib import Path
import os
import re
import sys

ROOT = Path(__file__).resolve().parent
SRC = Path(r"D:/BaiduNetdiskDownload/新概念英语/2. 新概念1-【2024版】")
OUT = ROOT / "videos"

def main():
    if not SRC.is_dir():
        print("源视频目录不存在:", SRC)
        return 1
    files = {}
    for p in SRC.iterdir():
        if p.suffix.lower() != ".mp4":
            continue
        m = re.match(r"^(\d+)", p.name)
        if m:
            files[int(m.group(1))] = p
    if len(files) < 200:
        print("源 MP4 数量异常:", len(files))
        return 1
    OUT.mkdir(exist_ok=True)
    ok = fail = skip = 0
    for seq in range(1, 217):
        target = files.get(seq)
        if not target:
            print("缺序号", seq)
            fail += 1
            continue
        link = OUT / f"{seq:03d}.mp4"
        if link.exists() or link.is_symlink():
            # refresh if broken
            try:
                if link.resolve().exists() and link.stat().st_size > 0:
                    skip += 1
                    continue
            except OSError:
                pass
            try:
                link.unlink()
            except OSError:
                pass
        try:
            os.symlink(target, link)
            ok += 1
        except OSError as e:
            print("符号链接失败", link.name, "->", target.name, e)
            fail += 1
    print(f"完成: 新建 {ok}, 已有 {skip}, 失败 {fail}; 目录 {OUT}")
    if fail and ok == 0:
        print("若提示权限：请打开 Windows「开发人员模式」后再运行，或改用 serve-web.cmd（不依赖链接）。")
        return 2
    return 0 if fail == 0 else 0

if __name__ == "__main__":
    sys.exit(main())
