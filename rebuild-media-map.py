# -*- coding: utf-8 -*-
"""Rebuild media-map.json: 1 lesson = 1 teaching video (from filename lesson-N)."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parent
SRC = Path(r"D:/BaiduNetdiskDownload/新概念英语/2. 新概念1-【2024版】")
OUT = ROOT / "android-app" / "media-map.json"

def clean_title(name: str) -> str:
    n = re.sub(r"^\d+_【视频】", "", name)
    n = re.sub(r"\.(mp4|MP4|mkv)$", "", n)
    n = re.sub(r"第一课时|第二课时|课时", "", n)
    n = re.sub(r"lesson\s*[-_]?\s*\d+", "", n, flags=re.I)
    n = n.strip(" _-·.")
    return n or "本课视频"

def main():
    lesson_videos = {}
    practices = []
    for p in SRC.iterdir():
        if p.suffix.lower() != ".mp4":
            continue
        m = re.match(r"^(\d+)", p.name)
        if not m:
            continue
        seq = int(m.group(1))
        lm = re.search(r"lesson\s*[-_]?\s*(\d+)", p.name, re.I)
        if lm:
            lid = int(lm.group(1))
            if 1 <= lid <= 144:
                lesson_videos[lid] = {
                    "seq": seq,
                    "title": clean_title(p.name) if clean_title(p.name) != "本课视频" else f"Lesson {lid}",
                    "name": p.name,
                }
        else:
            practices.append({"seq": seq, "title": clean_title(p.name), "name": p.name})

    if len(lesson_videos) != 144:
        raise SystemExit(f"expected 144 lesson videos, got {len(lesson_videos)}")

    # practice sits after each odd/even pair in source order; attach to even lesson as optional
    practices.sort(key=lambda x: x["seq"])
    for i, prac in enumerate(practices):
        even_lesson = (i + 1) * 2  # 1st practice -> L2, 2nd -> L4, ...
        if even_lesson > 144:
            break
        lesson_videos.setdefault("_prac", {})
        # store on side
        practices[i]["attach"] = even_lesson

    videos = {}
    for lid in range(1, 145):
        row = lesson_videos[lid]
        entries = [{
            "path": f"videos/{row['seq']:03d}.mkv",
            "title": "本课视频",
            "sourceName": row["name"],
        }]
        # optional practice after this even lesson
        for prac in practices:
            if prac.get("attach") == lid:
                entries.append({
                    "path": f"videos/{prac['seq']:03d}.mkv",
                    "title": f"巩固：{prac['title']}",
                    "sourceName": prac["name"],
                })
        videos[str(lid)] = entries

    # keep existing pdf pages if present
    old = {}
    if OUT.exists():
        old = json.loads(OUT.read_text(encoding="utf-8"))
    mapping = {
        "version": 1,
        "videos": videos,
        "pdf": old.get("pdf", {"asset": "student", "pages": {}, "pageStatus": {}}),
    }
    OUT.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")
    print("L1", videos["1"])
    print("L2", videos["2"])
    print("L3", videos["3"])
    print("single-only lessons", sum(1 for v in videos.values() if len(v) == 1))
    print("with practice", sum(1 for v in videos.values() if len(v) > 1))

if __name__ == "__main__":
    main()
