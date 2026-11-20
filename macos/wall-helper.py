#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Setup and control helper for copyparty-media-wall.

Serves a setup page on this computer only (127.0.0.1) and does what a web page
cannot do on its own: pick folders on disk, write the copyparty config, fetch
FFmpeg, and start or stop copyparty. Standard library only.
"""
import json, os, platform, re, secrets, signal, socket, subprocess, sys, tempfile, threading, time, zipfile
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

VERSION = "helper-1"
HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("WALL_HELPER_PORT", "3924"))
CPP_PORT = int(os.environ.get("WALL_PORT", "3923"))
MAC = sys.platform == "darwin"
CFG = os.environ.get("WALL_CFG") or (
    os.path.expanduser("~/Library/Application Support/copyparty") if MAC
    else os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~/.config"), "copyparty-media-wall"))
SFX = os.path.join(HERE, "copyparty-sfx.py")
WALL_SRC = os.path.join(HERE, "wall")
PAGE = os.path.join(HERE, "setup.html")
BIN = os.path.join(CFG, "bin")
PYLIB = os.path.join(CFG, "pylib")
CONF = os.path.join(CFG, "copyparty.conf")
LOG = os.path.join(os.path.expanduser("~/Library/Logs") if MAC else CFG, "copyparty.log")
EXTRA_PATH = [BIN, "/opt/homebrew/bin", "/usr/local/bin"]
FF_URL = "https://ffmpeg.martin-riedl.de/redirect/latest/macos/%s/release/%s.zip"
USER_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")

lock = threading.Lock()
job = {"ffmpeg": {"state": "idle", "pct": 0, "msg": ""}, "start": {"state": "idle", "msg": ""}}


def rd(name, default=""):
    try:
        with open(os.path.join(CFG, name), encoding="utf-8") as f:
            return f.read()
    except OSError:
        return default


def wr(name, text, private=False):
    os.makedirs(CFG, exist_ok=True)
    p = os.path.join(CFG, name)
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600 if private else 0o644)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    if private:
        os.chmod(p, 0o600)


def token():
    t = rd("helper-token").strip()
    if not t:
        t = secrets.token_urlsafe(24)
        wr("helper-token", t, True)
    return t


def account():
    ls = rd("account.txt").split("\n")
    return (ls[0], ls[1]) if len(ls) >= 2 and ls[0] and ls[1] else None


def folders():
    return [x for x in rd("folders.txt").split("\n") if x and os.path.isdir(x)]


def perm():
    p = rd("perm.txt").strip()
    return p if p in ("r", "rwmd") else ""


def env_path():
    return os.pathsep.join(EXTRA_PATH + [os.environ.get("PATH", "")])


def which(name):
    for d in env_path().split(os.pathsep):
        p = os.path.join(d, name)
        if d and os.path.isfile(p) and os.access(p, os.X_OK):
            return p
    return ""


def have_ffmpeg():
    return bool(which("ffmpeg") and which("ffprobe"))


def have_pillow():
    try:
        e = dict(os.environ, PYTHONPATH=PYLIB)
        return subprocess.run([sys.executable, "-c", "import PIL"], env=e, capture_output=True, timeout=30).returncode == 0
    except Exception:
        return False


def lan_ip():
    """The address other devices on the home network should use. VPN and proxy tunnels are skipped."""
    private = re.compile(r"^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)")
    try:
        out = subprocess.run(["/sbin/ifconfig"], capture_output=True, text=True, timeout=5).stdout
        cands, dev = [], ""
        for line in out.splitlines():
            if line and not line[0].isspace():
                dev = line.split(":")[0]
            m = re.match(r"\s+inet (\d+\.\d+\.\d+\.\d+)", line)
            if m and private.match(m.group(1)):
                cands.append((0 if dev.startswith(("en", "eth", "wl")) else 1, m.group(1)))
        if cands:
            return sorted(cands)[0][1]
    except Exception:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip if private.match(ip) else ""
    except OSError:
        return ""


def port_open(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.6):
            return True
    except OSError:
        return False


def cpp_pids():
    """Only the copyparty started with OUR config file; any other copyparty on this machine is left alone."""
    out = []
    try:
        r = subprocess.run(["ps", "-axo", "pid=,command="], capture_output=True, text=True, timeout=5)
        for line in r.stdout.splitlines():
            pid, _, cmd = line.strip().partition(" ")
            if pid.isdigit() and "copyparty" in cmd and cmd.rstrip().endswith(" -c " + CONF):
                out.append(int(pid))
    except Exception:
        pass
    return [p for p in out if p != os.getpid()]


def stop_cpp():
    for p in cpp_pids():
        try:
            os.kill(p, signal.SIGTERM)
        except OSError:
            pass
    for _ in range(30):
        if not cpp_pids():
            break
        time.sleep(0.2)
    for p in cpp_pids():
        try:
            os.kill(p, signal.SIGKILL)
        except OSError:
            pass


def volume_config(fl, pm, user):
    accs = "  accs:\n    %s: %s\n\n" % (pm, user)
    if len(fl) == 1:
        return "[/media]\n  %s\n%s" % (fl[0], accs)
    os.makedirs(os.path.join(CFG, "mediaroot"), exist_ok=True)
    out = "[/media]\n  %s\n  accs:\n    r: %s\n\n" % (os.path.join(CFG, "mediaroot"), user)
    used = []
    for p in fl:
        nm = re.sub(r"[\[\]#:\\]", "_", os.path.basename(p.rstrip("/"))) or "library"
        base, k = nm, 1
        while nm.lower() in used:
            k += 1
            nm = "%s %d" % (base, k)
        used.append(nm.lower())
        out += "[/media/%s]\n  %s\n%s" % (nm, p, accs)
    return out


def write_config():
    user, pw = account()
    wall = os.path.join(CFG, "wall")
    for d in ("state", "hist"):
        os.makedirs(os.path.join(CFG, d), exist_ok=True)
    os.makedirs(wall, exist_ok=True)
    for n in os.listdir(WALL_SRC):
        with open(os.path.join(WALL_SRC, n), "rb") as a, open(os.path.join(wall, n), "wb") as b:
            b.write(a.read())
    cfg = ("[global]\n  i: 0.0.0.0\n  p: %d\n  q\n  grid\n  e2dsa\n  e2ts\n  no-hash: .\n  re-maxage: 300\n  srch-hits: 200000\n"
           "  hist: %s\n  shr: /share\n  shr-db: %s\n\n[accounts]\n  %s: %s\n\n"
           "[/]\n  %s\n  accs:\n    h: *\n  flags:\n    d2d\n\n%s"
           "[/.wallstate]\n  %s\n  accs:\n    rwd: %s\n  flags:\n    d2d\n") % (
        CPP_PORT, os.path.join(CFG, "hist"), os.path.join(CFG, "shares.db"), user, pw, wall,
        volume_config(folders(), perm(), user), os.path.join(CFG, "state"), user)
    wr("copyparty.conf", cfg, True)


def configured():
    return bool(account() and folders() and perm())


def start_cpp():
    """Runs in a thread: installs Pillow if needed, writes the config, (re)starts copyparty."""
    j = job["start"]
    try:
        if not configured():
            raise RuntimeError("not configured")
        if not have_pillow():
            j.update(state="busy", msg="pillow")
            os.makedirs(PYLIB, exist_ok=True)
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--disable-pip-version-check", "--timeout", "10",
                            "--retries", "1", "--upgrade", "--target", PYLIB, "pillow"], capture_output=True, timeout=300)
        j.update(state="busy", msg="starting")
        stop_cpp()
        write_config()
        os.makedirs(os.path.dirname(LOG), exist_ok=True)
        e = dict(os.environ, PATH=env_path(), PYTHONPATH=PYLIB)
        with open(LOG, "wb") as lf:
            subprocess.Popen([sys.executable, SFX, "-c", CONF], stdin=subprocess.DEVNULL, stdout=lf, stderr=lf,
                             cwd=tempfile.gettempdir(), env=e, start_new_session=True)
        for _ in range(120):
            if port_open(CPP_PORT):
                wr("running-version", VERSION)
                j.update(state="done", msg="")
                return
            time.sleep(0.5)
        raise RuntimeError("timeout")
    except Exception as ex:
        j.update(state="error", msg=str(ex)[:200])


def fetch_ffmpeg():
    j = job["ffmpeg"]
    try:
        if not MAC:
            raise RuntimeError("unsupported")
        arch = "arm64" if platform.machine() == "arm64" else "amd64"
        os.makedirs(BIN, exist_ok=True)
        for i, name in enumerate(("ffmpeg", "ffprobe")):
            zp = os.path.join(BIN, name + ".zip")
            with urllib.request.urlopen(FF_URL % (arch, name), timeout=30) as r, open(zp, "wb") as f:
                total = int(r.headers.get("Content-Length") or 0)
                got = 0
                while True:
                    buf = r.read(262144)
                    if not buf:
                        break
                    f.write(buf)
                    got += len(buf)
                    j.update(state="busy", pct=int((i + (got / total if total else 0)) * 50))
            with zipfile.ZipFile(zp) as z:
                z.extract(name, BIN)
            os.remove(zp)
            os.chmod(os.path.join(BIN, name), 0o755)
            subprocess.run([os.path.join(BIN, name), "-version"], capture_output=True, timeout=30, check=True)
        j.update(state="done", pct=100, msg="")
    except Exception as ex:
        j.update(state="error", msg=str(ex)[:200])


def list_dir(path):
    path = os.path.abspath(os.path.expanduser(path or "~"))
    if not os.path.isdir(path):
        path = os.path.expanduser("~")
    try:
        names = sorted((n for n in os.listdir(path) if not n.startswith(".") and os.path.isdir(os.path.join(path, n))), key=str.lower)
        err = ""
    except OSError as ex:
        names, err = [], ("denied" if isinstance(ex, PermissionError) else "error")
    if MAC:
        names = [n for n in names if not n.endswith((".app", ".photoslibrary", ".bundle"))]
    home = os.path.expanduser("~")
    quick = [("home", home)] + [(k, os.path.join(home, d)) for k, d in (
        ("movies", "Movies"), ("downloads", "Downloads"), ("desktop", "Desktop"), ("documents", "Documents"),
        ("pictures", "Pictures"), ("music", "Music")) if os.path.isdir(os.path.join(home, d))]
    if os.path.isdir("/Volumes"):
        quick.append(("disks", "/Volumes"))
    parent = os.path.dirname(path)
    return {"path": path, "parent": parent if parent != path else "", "dirs": names, "error": err,
            "quick": [{"k": k, "p": p} for k, p in quick]}


def status():
    acc = account()
    run = bool(cpp_pids()) and port_open(CPP_PORT)
    ip = lan_ip()
    return {"version": VERSION, "configured": configured(), "user": acc[0] if acc else "", "folders": folders(), "perm": perm(),
            "running": run, "stale": run and rd("running-version").strip() != VERSION,
            "local": "http://127.0.0.1:%d/" % CPP_PORT, "lan": ("http://%s:%d/" % (ip, CPP_PORT)) if ip else "",
            "ffmpeg": have_ffmpeg(), "ffmpeg_job": job["ffmpeg"], "start_job": job["start"], "mac": MAC,
            "python": platform.python_version()}


def save(body):
    user = str(body.get("user", "")).strip()
    pw = body.get("password")
    cur = account()
    if not USER_RE.match(user):
        return "user"
    if pw is None or pw == "":
        if not cur:
            return "password"
        pw = cur[1]
    pw = str(pw)
    if len(pw) < 8 or len(pw) > 64 or re.search(r"\s", pw):
        return "password"
    fl = []
    for p in body.get("folders") or []:
        p = os.path.abspath(str(p)).rstrip("/") or "/"
        if os.path.isdir(p) and p not in fl:
            fl.append(p)
    if not fl:
        return "folders"
    pm = body.get("perm")
    if pm not in ("r", "rwmd"):
        return "perm"
    wr("account.txt", "%s\n%s\n" % (user, pw), True)
    wr("folders.txt", "".join(p + "\n" for p in fl), True)
    wr("perm.txt", pm + "\n")
    return ""


class H(BaseHTTPRequestHandler):
    server_version = "wall-helper"

    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="application/json", extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode("utf-8")
        elif isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text/") or ctype.endswith("json") else ""))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def host_ok(self):
        # only answer when addressed as this computer: blocks DNS-rebinding from web pages
        return self.headers.get("Host", "") in ("127.0.0.1:%d" % PORT, "localhost:%d" % PORT)

    def cookie_ok(self):
        m = re.search(r"(?:^|;\s*)wst=([A-Za-z0-9_-]+)", self.headers.get("Cookie", ""))
        return bool(m) and secrets.compare_digest(m.group(1), token())

    def api_ok(self):
        # the custom header cannot be sent cross-site without a CORS preflight, which is never granted here
        return self.host_ok() and self.cookie_ok() and self.headers.get("X-Wall") == "1"

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if not self.host_ok():
            return self.send(403, "forbidden", "text/plain")
        if u.path == "/api/ping":
            return self.send(200, {"version": VERSION})
        if u.path == "/":
            t = (q.get("t") or [""])[0]
            if t and secrets.compare_digest(t, token()):
                return self.send(302, "", "text/plain", {"Location": "/", "Set-Cookie": "wst=%s; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000" % token()})
            if not self.cookie_ok():
                return self.send(403, "<!doctype html><meta charset=utf-8><title>Media Wall</title><body style='font:16px sans-serif;background:#0b0d12;color:#eef1f6;display:grid;place-items:center;height:100vh;margin:0'><div style='text-align:center'>请在这台电脑上双击 Copyparty 图标来打开此页面。<br><br>Open this page by double-clicking the Copyparty app on this computer.</div>", "text/html")
            with open(PAGE, "rb") as f:
                return self.send(200, f.read(), "text/html")
        if not self.api_ok():
            return self.send(403, {"error": "forbidden"})
        if u.path == "/api/status":
            return self.send(200, status())
        if u.path == "/api/ls":
            return self.send(200, list_dir((q.get("path") or [""])[0]))
        self.send(404, {"error": "not found"})

    def do_POST(self):
        u = urlparse(self.path)
        if not self.api_ok():
            return self.send(403, {"error": "forbidden"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n).decode("utf-8")) if 0 < n < 1000000 else {}
        except Exception:
            return self.send(400, {"error": "bad request"})
        if u.path == "/api/save":
            err = save(body if isinstance(body, dict) else {})
            return self.send(400 if err else 200, {"error": err})
        if u.path == "/api/start":
            with lock:
                if job["start"]["state"] != "busy":
                    job["start"].update(state="busy", msg="starting")
                    threading.Thread(target=start_cpp, daemon=True).start()
            return self.send(200, {"error": ""})
        if u.path == "/api/stop":
            stop_cpp()
            job["start"].update(state="idle", msg="")
            return self.send(200, {"error": ""})
        if u.path == "/api/ffmpeg":
            with lock:
                if job["ffmpeg"]["state"] != "busy":
                    job["ffmpeg"].update(state="busy", pct=0, msg="")
                    threading.Thread(target=fetch_ffmpeg, daemon=True).start()
            return self.send(200, {"error": ""})
        self.send(404, {"error": "not found"})


def main():
    os.makedirs(CFG, exist_ok=True)
    token()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    # after an update, or after a reboot, bring the service back without asking
    if configured() and (not cpp_pids() or rd("running-version").strip() != VERSION):
        job["start"].update(state="busy", msg="starting")
        threading.Thread(target=start_cpp, daemon=True).start()
    srv.serve_forever()


if __name__ == "__main__":
    main()
