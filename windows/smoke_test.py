# -*- coding: utf-8 -*-
"""End-to-end smoke test of a built package: helper, setup API, copyparty, thumbnails, share links.

    python smoke_test.py --python <interpreter inside the package> --app <app folder> [--ffmpeg]

Uses a throwaway settings folder and its own ports, so it does not touch a real installation.
Works on Windows, macOS and Linux.
"""
from http.cookiejar import CookieJar
import argparse, json, os, shutil, subprocess, sys, tempfile, time, urllib.error, urllib.parse, urllib.request

for _s in (sys.stdout, sys.stderr):  # Windows consoles default to a legacy code page
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ap = argparse.ArgumentParser()
ap.add_argument("--python", required=True)
ap.add_argument("--app", required=True)
ap.add_argument("--ffmpeg", action="store_true", help="also download FFmpeg through the helper and check video covers")
A = ap.parse_args()
A.app = os.path.abspath(A.app)
A.python = os.path.abspath(A.python)

HP, CP = 39340, 39341
H, U = "http://127.0.0.1:%d" % HP, "http://127.0.0.1:%d" % CP
tmp = tempfile.mkdtemp(prefix="wall-smoke-")
cfg, media = os.path.join(tmp, "settings folder"), os.path.join(tmp, "media")
os.makedirs(os.path.join(media, "照片 photos"))
os.makedirs(os.path.join(media, "docs"))
with open(os.path.join(media, "docs", "note.txt"), "w", encoding="utf-8") as f:
    f.write("hello from the smoke test")
env = dict(os.environ, WALL_CFG=cfg, WALL_HELPER_PORT=str(HP), WALL_PORT=str(CP), PYTHONPATH=os.path.join(A.app, "pylib"))
fails = []


def check(name, ok, detail=""):
    print("%s  %s%s" % ("PASS" if ok else "FAIL", name, (" -> " + str(detail)) if detail != "" else ""), flush=True)
    if not ok:
        fails.append(name)


def call(url, data=None, headers=None, jar=None, method=None):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar)) if jar is not None else urllib.request.build_opener()
    try:
        with op.open(req, timeout=60) as r:
            return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)


# a test picture, made with the Pillow that ships in the package
pic = os.path.join(media, "照片 photos", "picture.png")
r = subprocess.run([A.python, "-c", "from PIL import Image; Image.new('RGB',(640,360),(200,90,40)).save(r'%s')" % pic], env=env, capture_output=True, text=True)
check("Pillow is importable by the packaged Python", r.returncode == 0 and os.path.isfile(pic), r.stderr.strip()[-200:])

log = open(os.path.join(tmp, "helper.log"), "wb")
helper = subprocess.Popen([A.python, os.path.join(A.app, "wall-helper.py")], cwd=A.app, env=env, stdout=log, stderr=log, stdin=subprocess.DEVNULL)
try:
    for _ in range(60):
        try:
            if call(H + "/api/ping")[0] == 200:
                break
        except Exception:
            time.sleep(0.25)
    st, body, _ = call(H + "/api/ping")
    check("helper answers", st == 200, body.decode())
    tok = open(os.path.join(cfg, "helper-token"), encoding="utf-8").read().strip()
    check("page refused without the token", call(H + "/")[0] == 403)
    check("API refused without the cookie", call(H + "/api/status", headers={"X-Wall": "1"})[0] == 403)
    jar = CookieJar()
    st, body, _ = call(H + "/?t=" + tok, jar=jar)
    check("token opens the setup page", st == 200 and b"<title>" in body)
    check("API refused without the custom header", call(H + "/api/status", jar=jar)[0] == 403)
    check("API refused for a foreign Host header", call(H + "/api/status", headers={"X-Wall": "1", "Host": "evil.example:%d" % HP}, jar=jar)[0] == 403)

    def api(path, body=None):
        hd = {"X-Wall": "1"}
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            hd["Content-Type"] = "application/json"
        st, raw, _ = call(H + path, data=data, headers=hd, jar=jar)
        try:
            return st, json.loads(raw.decode("utf-8"))
        except ValueError:
            return st, {}

    st, s = api("/api/status")
    check("status before setup", st == 200 and not s["configured"] and not s["running"], {k: s.get(k) for k in ("os", "python", "ffmpeg", "ffmpeg_dl")})
    st, d = api("/api/ls?path=" + urllib.parse.quote(media))
    check("folder browser lists subfolders", [x["n"] for x in d.get("dirs", [])] == ["docs", "照片 photos"], [x["n"] for x in d.get("dirs", [])])
    check("folder browser returns full child paths", all(os.path.isdir(x["p"]) for x in d.get("dirs", [])))
    st, d = api("/api/ls?path=")
    check("folder browser opens the home folder with shortcuts", os.path.isdir(d.get("path", "")) and len(d.get("quick", [])) >= 1, [q["k"] for q in d.get("quick", [])])
    for bad, why in (({"user": "bad name", "password": "12345678", "folders": [media], "perm": "r"}, "user"),
                     ({"user": "tester", "password": "short", "folders": [media], "perm": "r"}, "password"),
                     ({"user": "tester", "password": "Smoke-pw_123", "folders": [os.path.join(tmp, "nope")], "perm": "r"}, "folders")):
        st, d = api("/api/save", bad)
        check("save rejects a bad " + why, st == 400 and d.get("error") == why)
    st, d = api("/api/save", {"user": "tester", "password": "Smoke-pw_123", "folders": [media, os.path.join(media, "docs")], "perm": "rwmd"})
    check("save accepts valid settings", st == 200, d)

    def start():
        api("/api/start", {})
        for _ in range(240):
            st, s = api("/api/status")
            if s.get("start_job", {}).get("state") in ("done", "error"):
                return s
            time.sleep(0.5)
        return s

    s = start()
    check("copyparty starts", s["start_job"]["state"] == "done" and s["running"], s["start_job"])
    st, body, _ = call(U + "/")
    check("library page is served", st == 200 and "影音库".encode("utf-8") in body)
    st, body, _ = call(U + "/media/?ls")
    anon = json.loads(body.decode("utf-8")) if st == 200 and body[:1] == b"{" else {}
    check("anonymous visitors cannot see any library content", st == 403 or (not anon.get("dirs") and not anon.get("files")), (st, body[:160]))
    st, body, _ = call(U + "/media/media/docs/note.txt")
    check("anonymous visitors cannot fetch files", st in (401, 403, 404), st)
    cj = CookieJar()
    bnd = "----smoke"
    form = "".join("--%s\r\nContent-Disposition: form-data; name=\"%s\"\r\n\r\n%s\r\n" % (bnd, k, v) for k, v in (("act", "login"), ("cppwd", "Smoke-pw_123"))) + "--%s--\r\n" % bnd
    call(U + "/", data=form.encode(), headers={"Content-Type": "multipart/form-data; boundary=" + bnd}, jar=cj)
    st, body, _ = call(U + "/media/?ls", jar=cj)
    ls = json.loads(body.decode("utf-8")) if st == 200 else {}
    names = sorted(urllib.parse.unquote(x["href"]) for x in ls.get("dirs", []))
    check("login works and both libraries are mounted", st == 200 and names == ["docs/", "media/"], names)
    time.sleep(3)
    st, body, _ = call(U + "/media/?srch", data=json.dumps({"q": "name like *", "n": 999}).encode(), headers={"Content-Type": "text/plain"}, jar=cj)
    hits = [urllib.parse.unquote(h["rp"]) for h in json.loads(body.decode("utf-8")).get("hits", [])] if st == 200 else []
    check("the index finds files, including non-ASCII names", any(h.endswith("picture.png") and "照片" in h for h in hits), hits)
    purl = U + "/media/media/" + urllib.parse.quote("照片 photos/picture.png")
    st, body, hd = call(purl + "?th=jf3", jar=cj)
    check("image thumbnail is generated", st == 200 and "jpeg" in hd.get("Content-Type", ""), hd.get("Content-Type"))
    st, body, _ = call(U + "/media/media/docs/uploaded.txt", data=b"uploaded by the smoke test", jar=cj, method="PUT")
    check("upload works with read-write permission", st in (200, 201) and os.path.isfile(os.path.join(media, "docs", "uploaded.txt")), st)
    st, body, _ = call(U + "/?share", data=json.dumps({"k": "smokekey1", "vp": ["/media/media/docs/note.txt"], "pw": "", "exp": "60", "perms": ["read"]}).encode(), headers={"Content-Type": "application/json"}, jar=cj)
    check("share link is created", st == 201 and b"created share" in body, body[:120])
    st, body, _ = call(U + "/share/smokekey1/note.txt")
    check("share link opens without login", st == 200 and body == b"hello from the smoke test", st)
    st, body, _ = call(U + "/.wallstate/state.json", data=b'{"fav":{},"pos":{}}', headers={"Replace": "1"}, jar=cj, method="PUT")
    check("watch state can be saved", st in (200, 201), st)

    if A.ffmpeg:
        api("/api/ffmpeg", {})
        for _ in range(900):
            st, s = api("/api/status")
            if s["ffmpeg_job"]["state"] in ("done", "error"):
                break
            time.sleep(1)
        check("FFmpeg download through the helper", s["ffmpeg_job"]["state"] == "done" and s["ffmpeg"], s["ffmpeg_job"])
        ff = shutil.which("ffmpeg", path=os.path.join(cfg, "bin"))
        if ff:
            vid = os.path.join(media, "docs", "clip.mp4")
            subprocess.run([ff, "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=3:size=320x180:rate=10", "-pix_fmt", "yuv420p", vid], capture_output=True)
            s = start()
            check("copyparty restarts with FFmpeg available", s["start_job"]["state"] == "done" and s["running"])
            call(U + "/", data=form.encode(), headers={"Content-Type": "multipart/form-data; boundary=" + bnd}, jar=cj)
            st, body, hd = call(U + "/media/media/docs/clip.mp4?th=jf3", jar=cj)
            check("video cover is generated", st == 200 and "jpeg" in hd.get("Content-Type", ""), hd.get("Content-Type"))

    api("/api/stop", {})
    time.sleep(1)
    st, s = api("/api/status")
    check("stop works", not s["running"])
    try:
        urllib.request.urlopen(U + "/", timeout=2)
        check("library port is closed after stop", False)
    except Exception:
        check("library port is closed after stop", True)
finally:
    helper.terminate()
    try:
        helper.wait(10)
    except Exception:
        helper.kill()
    log.close()
    if fails:
        for n in ("helper.log",):
            try:
                print("---- %s ----\n%s" % (n, open(os.path.join(tmp, n), encoding="utf-8", errors="replace").read()[-3000:]))
            except OSError:
                pass
        try:
            print("---- copyparty.log ----\n%s" % open(os.path.join(cfg, "copyparty.log"), encoding="utf-8", errors="replace").read()[-3000:])
        except OSError:
            pass
    shutil.rmtree(tmp, ignore_errors=True)

print("\n%d failed" % len(fails) if fails else "\nall checks passed")
sys.exit(1 if fails else 0)
