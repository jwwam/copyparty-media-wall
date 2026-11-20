#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Container entrypoint: turns a few environment variables into a copyparty config, then starts copyparty.

  WALL_PASSWORD       required, at least 8 characters, no spaces (or WALL_PASSWORD_FILE=/run/secrets/...)
  WALL_USER           login name, default "wall"
  WALL_PERM           "r" (read-only, default) or "rw" (upload, rename, move, delete)

  /media              your library; mount one folder here, or several below it (/media/Movies, /media/Photos)
  /data               settings, index, thumbnails, watch history, share links (mount it to keep them)
"""
import os, re, sys

MEDIA, DATA, WALL = "/media", "/data", "/wall"


def die(zh, en):
    sys.stderr.write("\n[media-wall] %s\n[media-wall] %s\n\n" % (en, zh))
    sys.exit(64)


def main():
    user = os.environ.get("WALL_USER", "wall").strip()
    pw = os.environ.get("WALL_PASSWORD", "")
    pwf = os.environ.get("WALL_PASSWORD_FILE", "")
    if not pw and pwf:
        try:
            with open(pwf, encoding="utf-8") as f:
                pw = f.read().strip()
        except OSError as ex:
            die("无法读取 WALL_PASSWORD_FILE：%s" % ex, "cannot read WALL_PASSWORD_FILE: %s" % ex)
    perm = {"r": "r", "ro": "r", "rw": "rwmd", "rwmd": "rwmd"}.get(os.environ.get("WALL_PERM", "r").strip().lower())

    if not re.match(r"^[A-Za-z0-9_-]{1,32}$", user):
        die("WALL_USER 只能包含字母、数字、- 和 _", "WALL_USER may only contain letters, digits, - and _")
    if len(pw) < 8 or len(pw) > 64 or re.search(r"\s", pw):
        die("必须设置 WALL_PASSWORD：至少 8 位，不能包含空格。例如  -e WALL_PASSWORD=你的密码",
            "WALL_PASSWORD is required: at least 8 characters, no spaces. Example:  -e WALL_PASSWORD=your-password")
    if not perm:
        die("WALL_PERM 只能是 r（只读）或 rw（可上传和删除）", "WALL_PERM must be r (read-only) or rw (upload and delete)")

    try:
        for d in ("state", "hist", "cfg"):
            os.makedirs(os.path.join(DATA, d), exist_ok=True)
        conf = os.path.join(DATA, "copyparty.conf")
        fd = os.open(conf, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    except OSError as ex:
        die("/data 不可写（%s）。请挂载一个当前用户可写的目录到 /data。" % ex,
            "/data is not writable (%s). Mount a folder that the container user can write to at /data." % ex)
    if not os.path.isdir(MEDIA):
        os.makedirs(MEDIA, exist_ok=True)
    try:
        empty = not os.listdir(MEDIA)
    except OSError:
        empty = True
    if empty:
        sys.stderr.write("[media-wall] /media is empty. Mount your library there, for example  -v /path/to/movies:/media\n"
                         "[media-wall] /media 是空的。请把媒体文件夹挂载到这里，例如  -v /你的/电影目录:/media\n")

    cfg = ("[global]\n  i: 0.0.0.0\n  p: 3923\n  no-crt\n  q\n  grid\n  e2dsa\n  e2ts\n  no-hash: .\n  re-maxage: 300\n  srch-hits: 200000\n"
           "  hist: %s/hist\n  shr: /share\n  shr-db: %s/shares.db\n\n[accounts]\n  %s: %s\n\n"
           "[/]\n  %s\n  accs:\n    h: *\n  flags:\n    d2d\n\n"
           "[/media]\n  %s\n  accs:\n    %s: %s\n\n"
           "[/.wallstate]\n  %s/state\n  accs:\n    rwd: %s\n  flags:\n    d2d\n") % (DATA, DATA, user, pw, WALL, MEDIA, perm, user, DATA, user)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(cfg)

    sys.stderr.write("[media-wall] starting; open http://<this-machine>:3923/ and log in as \"%s\" (%s)\n" % (user, "read-only" if perm == "r" else "read-write"))
    sys.stderr.flush()
    env = dict(os.environ, XDG_CONFIG_HOME=os.path.join(DATA, "cfg"))
    for k in ("WALL_PASSWORD",):  # do not leave the password in the server's environment
        env.pop(k, None)
    if os.path.isfile("/z/cpp.sh"):  # the official image's own launcher
        os.execve("/bin/ash", ["/bin/ash", "/z/cpp.sh", "-c", conf], env)
    os.execvpe("python3", ["python3", "-m", "copyparty", "-c", conf], env)


if __name__ == "__main__":
    main()
