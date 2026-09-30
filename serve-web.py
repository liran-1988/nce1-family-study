# -*- coding: utf-8 -*-
"""家庭学习本地服务：页面 + /videos/NNN.mp4 直映原始 MP4，支持 Range（浏览器播视频必需）。"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import re
import sys
import urllib.parse

ROOT = Path(__file__).resolve().parent
SRC = Path(r"D:/BaiduNetdiskDownload/新概念英语/2. 新概念1-【2024版】")
PORT = 8765

def build_map():
    mapping = {}
    if not SRC.is_dir():
        return mapping
    for p in SRC.iterdir():
        if p.suffix.lower() != ".mp4":
            continue
        m = re.match(r"^(\d+)", p.name)
        if m:
            mapping[int(m.group(1))] = p
    return mapping

VIDEO_MAP = build_map()

def resolve_video(seq: int):
    local = ROOT / "videos" / f"{seq:03d}.mp4"
    if local.exists():
        return local
    return VIDEO_MAP.get(seq)

class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "public, max-age=3600")
        super().end_headers()

    def translate_path(self, path):
        parsed = urllib.parse.urlparse(path).path
        m = re.match(r"^/videos/0*(\d+)\.(mp4|webm|mkv)$", parsed, re.I)
        if m:
            target = resolve_video(int(m.group(1)))
            if target and Path(target).exists():
                return str(Path(target).resolve())
            # fall through to missing file under ROOT/videos
        return super().translate_path(path)

    def send_head(self):
        path = Path(self.translate_path(self.path))
        if path.is_dir():
            return super().send_head()
        if not path.is_file():
            self.send_error(404, "File not found")
            return None
        ctype = self.guess_type(str(path))
        try:
            file_size = path.stat().st_size
            file_obj = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        range_header = self.headers.get("Range")
        if not range_header:
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(file_size))
            self.send_header("Last-Modified", self.date_time_string(path.stat().st_mtime))
            self.end_headers()
            self.range_spec = None
            return file_obj

        m = re.match(r"bytes=(\d*)-(\d*)", range_header.strip())
        if not m:
            file_obj.close()
            self.send_error(400, "Invalid Range")
            return None
        start_s, end_s = m.group(1), m.group(2)
        if start_s == "" and end_s == "":
            file_obj.close()
            self.send_error(400, "Invalid Range")
            return None
        if start_s == "":
            # suffix bytes: bytes=-N
            length = int(end_s)
            if length <= 0:
                file_obj.close()
                self.send_error(400, "Invalid Range")
                return None
            start = max(0, file_size - length)
            end = file_size - 1
        else:
            start = int(start_s)
            end = int(end_s) if end_s else file_size - 1
        if start >= file_size:
            file_obj.close()
            self.send_error(416, "Requested Range Not Satisfiable")
            return None
        end = min(end, file_size - 1)
        if end < start:
            file_obj.close()
            self.send_error(416, "Requested Range Not Satisfiable")
            return None

        length = end - start + 1
        self.send_response(206)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
        self.send_header("Content-Length", str(length))
        self.send_header("Last-Modified", self.date_time_string(path.stat().st_mtime))
        self.end_headers()
        self.range_spec = (start, length)
        return file_obj

    def copyfile(self, source, outputfile):
        if getattr(self, "range_spec", None):
            start, length = self.range_spec
            source.seek(start)
            remaining = length
            while remaining > 0:
                chunk = source.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                remaining -= len(chunk)
            return
        return super().copyfile(source, outputfile)

    def log_message(self, fmt, *args):
        sys.stdout.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))
        sys.stdout.flush()

if __name__ == "__main__":
    if len(VIDEO_MAP) < 100:
        print(f"警告：只找到 {len(VIDEO_MAP)} 个源 MP4，目录是否存在？\n{SRC}")
    else:
        print(f"源 MP4 映射 {len(VIDEO_MAP)} 个")
    print(f"请用浏览器打开: http://127.0.0.1:{PORT}/")
    print("进课程点「播放本课视频」即可，不用选文件夹。保持本窗口开启。")
    try:
        ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
    except OSError as e:
        print("启动失败（端口可能被占用）:", e)
        print("请先关掉其他「打开学习」窗口，或结束占用 8765 的进程后再试。")
        raise
