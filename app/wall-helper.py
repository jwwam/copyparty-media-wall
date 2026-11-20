#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Setup and control helper for copyparty-media-wall (macOS, Windows, Linux).

Serves a setup page on this computer only (127.0.0.1) and does what a web page
cannot do on its own: pick folders on disk, write the copyparty config, fetch
FFmpeg, and start or stop copyparty. Standard library only.
"""
import json, os, platform, re, secrets, signal, socket, string, subprocess, sys, tempfile, threading, time, zipfile
import urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

VERSION = "helper-2"
HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("WALL_HELPER_PORT", "3924"))
CPP_PORT = int(os.environ.get("WALL_PORT", "3923"))
MAC = sys.platform == "darwin"
WIN = os.name == "nt"
CFG = os.environ.get("WALL_CFG") or (
    os.path.expanduser("~/Library/Application Support/copyparty") if MAC
    else os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~/.config"), "copyparty-media-wall"))
SFX = os.path.join(HERE, "copyparty-sfx.py")
WALL_SRC = os.path.join(HERE, "wall")
PAGE = os.path.join(HERE, "setup.html")
BIN = os.path.join(CFG, "bin")
PYLIB = os.path.join(CFG, "pylib")
CONF = os.path.join(CFG, "copyparty.conf")
PIDFILE = os.path.join(CFG, "copyparty.pid")
LOG = os.path.join(os.path.expanduser("~/Library/Logs") if MAC else CFG, "copyparty.log")
EXTRA_PATH = [BIN] + ([] if WIN else ["/opt/homebrew/bin", "/usr/local/bin"])
EXE = ".exe" if WIN else ""
# the console-less interpreter is fine for this helper, but copyparty wants the normal one
PY = os.path.join(os.path.dirname(sys.executable), "python.exe") if WIN and os.path.isfile(os.path.join(os.path.dirname(sys.executable), "python.exe")) else sys.executable
NOWIN = 0x08000000 if WIN else 0  # CREATE_NO_WINDOW
FF = ({"src": "ffmpeg.martin-riedl.de", "mb": 60} if MAC else {"src": "github.com/BtbN/FFmpeg-Builds", "mb": 140} if WIN else None)
FF_MAC = "https://ffmpeg.martin-riedl.de/redirect/latest/macos/%s/release/%s.zip"
FF_WIN = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
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
    if private and not WIN:
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
        p = os.path.join(d, name + EXE)
        if d and os.path.isfile(p) and os.access(p, os.X_OK):
            return p
    return ""


def have_ffmpeg():
    return bool(which("ffmpeg") and which("ffprobe"))


def have_pillow():
    try:
        e = dict(os.environ, PYTHONPATH=PYLIB)
        return subprocess.run([PY, "-c", "import PIL"], env=e, capture_output=True, timeout=30, creationflags=NOWIN).returncode == 0
    except Exception:
        return False


PRIVATE = re.compile(r"^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)")


def lan_ip():
    """The address other devices on the home network should use. VPN and proxy tunnels are skipped."""
    if not WIN:
        try:
            out = subprocess.run(["/sbin/ifconfig"], capture_output=True, text=True, timeout=5).stdout
            cands, dev = [], ""
            for line in out.splitlines():
                if line and not line[0].isspace():
                    dev = line.split(":")[0]
                m = re.match(r"\s+inet (\d+\.\d+\.\d+\.\d+)", line)
                if m and PRIVATE.match(m.group(1)):
                    cands.append((0 if dev.startswith(("en", "eth", "wl")) else 1, m.group(1)))
            if cands:
                return sorted(cands)[0][1]
        except Exception:
            pass
    else:
        try:
            for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
                if PRIVATE.match(ip):
                    return ip
        except OSError:
            pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip if PRIVATE.match(ip) else ""
    except OSError:
        return ""


def port_open(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.6):
            return True
    except OSError:
        return False


def pid_alive(pid):
    if WIN:
        try:
            r = subprocess.run(["tasklist", "/FI", "PID eq %d" % pid, "/FO", "CSV", "/NH"], capture_output=True, text=True, timeout=10, creationflags=NOWIN)
            return ('"%d"' % pid) in r.stdout and "python" in r.stdout.lower()
        except Exception:
            return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def cpp_pids():
    """Only the copyparty started with OUR config file; any other copyparty on this machine is left alone."""
    out = []
    p = rd("copyparty.pid").strip()
    if p.isdigit() and pid_alive(int(p)):
        out.append(int(p))
    if not WIN:
        try:
            r = subprocess.run(["ps", "-axo", "pid=,command="], capture_output=True, text=True, timeout=5)
            for line in r.stdout.splitlines():
                pid, _, cmd = line.strip().partition(" ")
                if pid.isdigit() and "copyparty" in cmd and cmd.rstrip().endswith(" -c " + CONF):
                    out.append(int(pid))
        except Exception:
            pass
    return [x for x in set(out) if x != os.getpid()]


def stop_cpp():
    if WIN:
        for p in cpp_pids():
            subprocess.run(["taskkill", "/PID", str(p), "/T", "/F"], capture_output=True, timeout=20, creationflags=NOWIN)
    else:
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
    for _ in range(30):
        if not port_open(CPP_PORT):
            break
        time.sleep(0.2)
    try:
        os.remove(PIDFILE)
    except OSError:
        pass


def fwd(p):
    # copyparty configs take forward slashes on every platform
    return p.replace("\\", "/") if WIN else p


def volume_config(fl, pm, user):
    accs = "  accs:\n    %s: %s\n\n" % (pm, user)
    if len(fl) == 1:
        return "[/media]\n  %s\n%s" % (fwd(fl[0]), accs)
    os.makedirs(os.path.join(CFG, "mediaroot"), exist_ok=True)
    out = "[/media]\n  %s\n  accs:\n    r: %s\n\n" % (fwd(os.path.join(CFG, "mediaroot")), user)
    used = []
    for p in fl:
        nm = re.sub(r"[\[\]#:\\/]", "_", os.path.basename(os.path.normpath(p))) or re.sub(r"[^A-Za-z0-9]", "", p) or "library"
        base, k = nm, 1
        while nm.lower() in used:
            k += 1
            nm = "%s %d" % (base, k)
        used.append(nm.lower())
        out += "[/media/%s]\n  %s\n%s" % (nm, fwd(p), accs)
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
    quiet = "" if os.environ.get("WALL_DEBUG") else "  q\n"  # full copyparty logging when debugging
    cfg = ("[global]\n  i: 0.0.0.0\n  p: %d\n" + quiet + "  grid\n  e2dsa\n  e2ts\n  no-hash: .\n  re-maxage: 300\n  srch-hits: 200000\n"
           "  hist: %s\n  shr: /share\n  shr-db: %s\n\n[accounts]\n  %s: %s\n\n"
           "[/]\n  %s\n  accs:\n    h: *\n  flags:\n    d2d\n\n%s"
           "[/.wallstate]\n  %s\n  accs:\n    rwd: %s\n  flags:\n    d2d\n") % (
        CPP_PORT, fwd(os.path.join(CFG, "hist")), fwd(os.path.join(CFG, "shares.db")), user, pw, fwd(wall),
        volume_config(folders(), perm(), user), fwd(os.path.join(CFG, "state")), user)
    wr("copyparty.conf", cfg, True)


def configured():
    return bool(account() and folders() and perm())


def index_dbs():
    out = []
    for base, _, files in os.walk(os.path.join(CFG, "hist")):
        if "up2k.db" in files:
            out.append(os.path.join(base, "up2k.db"))
    return out


def search_state():
    """'ok', 'busy' (index not ready yet) or 'broken' (copyparty cannot open an index database)."""
    try:
        from http.cookiejar import CookieJar
        user, pw = account()
        op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
        base = "http://127.0.0.1:%d" % CPP_PORT
        bnd = "----wallhelper"
        form = "".join('--%s\r\nContent-Disposition: form-data; name="%s"\r\n\r\n%s\r\n' % (bnd, k, v) for k, v in (("act", "login"), ("cppwd", pw))) + "--%s--\r\n" % bnd
        op.open(urllib.request.Request(base + "/", data=form.encode("utf-8"), headers={"Content-Type": "multipart/form-data; boundary=" + bnd}), timeout=20).read()
        req = urllib.request.Request(base + "/media/?srch", data=json.dumps({"q": "name like *", "n": 1}).encode("utf-8"), headers={"Content-Type": "text/plain"})
        try:
            op.open(req, timeout=30).read()
            return "ok"
        except urllib.error.HTTPError as ex:
            body = ex.read().decode("utf-8", "replace")
            return "broken" if "unable to open database" in body else "busy"
    except Exception:
        return "busy"


def settle_index():
    """Windows only. If a search reaches copyparty while it is still creating its index databases, it keeps a
    read-only handle that never works again until a restart. So: wait until the databases exist, then probe once."""
    last, stable = -1, 0
    for _ in range(120):
        n = len(index_dbs())
        stable = stable + 1 if (n == last and n > 0) else 0
        last = n
        if stable >= 6:
            break
        time.sleep(0.5)
    for _ in range(30):
        r = search_state()
        if r != "busy":
            return r
        time.sleep(1)
    return "ok"


def launch_cpp():
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    e = dict(os.environ, PATH=env_path(), PYTHONPATH=PYLIB, PYTHONIOENCODING="utf-8")
    kw = {"creationflags": NOWIN | 0x00000200} if WIN else {"start_new_session": True}  # + CREATE_NEW_PROCESS_GROUP
    with open(LOG, "wb") as lf:
        p = subprocess.Popen([PY, SFX, "-c", CONF], stdin=subprocess.DEVNULL, stdout=lf, stderr=lf,
                             cwd=tempfile.gettempdir(), env=e, **kw)
    wr("copyparty.pid", str(p.pid))
    for _ in range(180):
        if port_open(CPP_PORT):
            return
        if p.poll() is not None:
            raise RuntimeError("copyparty exited, see the log")
        time.sleep(0.5)
    raise RuntimeError("timeout")


def start_cpp():
    """Runs in a thread: installs Pillow if needed, writes the config, (re)starts copyparty."""
    j = job["start"]
    try:
        if not configured():
            raise RuntimeError("not configured")
        if not WIN and not have_pillow():  # the Windows package ships Pillow
            j.update(state="busy", msg="pillow")
            os.makedirs(PYLIB, exist_ok=True)
            subprocess.run([PY, "-m", "pip", "install", "-q", "--disable-pip-version-check", "--timeout", "10",
                            "--retries", "1", "--upgrade", "--target", PYLIB, "pillow"], capture_output=True, timeout=300)
        j.update(state="busy", msg="starting")
        stop_cpp()
        write_config()
        launch_cpp()
        if WIN:
            j.update(state="busy", msg="index")
            for _ in range(2):
                if settle_index() != "broken":
                    break
                stop_cpp()  # the databases exist now, so a fresh start opens them cleanly
                launch_cpp()
        wr("running-version", VERSION)
        j.update(state="done", msg="")
    except Exception as ex:
        j.update(state="error", msg=str(ex)[:200])


def download(url, dst, j, lo, hi):
    req = urllib.request.Request(url, headers={"User-Agent": "copyparty-media-wall"})
    with urllib.request.urlopen(req, timeout=30) as r, open(dst, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        got = 0
        while True:
            buf = r.read(262144)
            if not buf:
                break
            f.write(buf)
            got += len(buf)
            j.update(state="busy", pct=int(lo + (hi - lo) * (got / total if total else 0)))


def fetch_ffmpeg():
    j = job["ffmpeg"]
    try:
        os.makedirs(BIN, exist_ok=True)
        if MAC:
            arch = "arm64" if platform.machine() == "arm64" else "amd64"
            for i, name in enumerate(("ffmpeg", "ffprobe")):
                zp = os.path.join(BIN, name + ".zip")
                download(FF_MAC % (arch, name), zp, j, i * 50, i * 50 + 50)
                with zipfile.ZipFile(zp) as z:
                    z.extract(name, BIN)
                os.remove(zp)
                os.chmod(os.path.join(BIN, name), 0o755)
        elif WIN:
            zp = os.path.join(BIN, "ffmpeg.zip")
            download(FF_WIN, zp, j, 0, 95)
            with zipfile.ZipFile(zp) as z:
                for name in ("ffmpeg.exe", "ffprobe.exe"):
                    member = next(m for m in z.namelist() if m.endswith("/bin/" + name))
                    with z.open(member) as a, open(os.path.join(BIN, name), "wb") as b:
                        while True:
                            buf = a.read(1048576)
                            if not buf:
                                break
                            b.write(buf)
            os.remove(zp)
        else:
            raise RuntimeError("unsupported")
        for name in ("ffmpeg", "ffprobe"):
            subprocess.run([os.path.join(BIN, name + EXE), "-version"], capture_output=True, timeout=60, check=True, creationflags=NOWIN)
        j.update(state="done", pct=100, msg="")
    except Exception as ex:
        j.update(state="error", msg=str(ex)[:200])


def list_dir(path):
    home = os.path.expanduser("~")
    path = os.path.abspath(os.path.expanduser(path)) if path else home
    if not os.path.isdir(path):
        path = home
    try:
        names = sorted((n for n in os.listdir(path) if not n.startswith((".", "$")) and os.path.isdir(os.path.join(path, n))), key=str.lower)
        err = ""
    except OSError as ex:
        names, err = [], ("denied" if isinstance(ex, PermissionError) else "error")
    if MAC:
        names = [n for n in names if not n.endswith((".app", ".photoslibrary", ".bundle"))]
    quick = [{"k": "home", "p": home}]
    for k, d in (("movies", "Videos" if WIN else "Movies"), ("downloads", "Downloads"), ("desktop", "Desktop"),
                 ("documents", "Documents"), ("pictures", "Pictures"), ("music", "Music")):
        if os.path.isdir(os.path.join(home, d)):
            quick.append({"k": k, "p": os.path.join(home, d)})
    if WIN:
        for c in string.ascii_uppercase:
            if os.path.isdir(c + ":\\"):
                quick.append({"k": "drive", "p": c + ":\\", "n": c + ":"})
    elif os.path.isdir("/Volumes"):
        quick.append({"k": "disks", "p": "/Volumes"})
    parent = os.path.dirname(path)
    return {"path": path, "parent": parent if parent != path else "", "error": err, "quick": quick,
            "dirs": [{"n": n, "p": os.path.join(path, n)} for n in names]}


def status():
    acc = account()
    run = bool(cpp_pids()) and port_open(CPP_PORT)
    ip = lan_ip()
    return {"version": VERSION, "configured": configured(), "user": acc[0] if acc else "", "folders": folders(), "perm": perm(),
            "running": run, "stale": run and rd("running-version").strip() != VERSION,
            "local": "http://127.0.0.1:%d/" % CPP_PORT, "lan": ("http://%s:%d/" % (ip, CPP_PORT)) if ip else "",
            "ffmpeg": have_ffmpeg(), "ffmpeg_dl": FF, "ffmpeg_job": job["ffmpeg"], "start_job": job["start"],
            "os": "mac" if MAC else "win" if WIN else "other", "log": LOG, "python": platform.python_version()}


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
        p = os.path.normpath(os.path.abspath(str(p)))
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


DENIED = ("<!doctype html><meta charset=utf-8><title>Media Wall</title><body style='font:16px sans-serif;background:#0b0d12;"
          "color:#eef1f6;display:grid;place-items:center;height:100vh;margin:0'><div style='text-align:center'>"
          "请在这台电脑上重新打开影音库应用来进入此页面。<br><br>Open this page by starting the Media Wall app on this computer.</div>")


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
                return self.send(403, DENIED, "text/html")
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
            if not FF:
                return self.send(400, {"error": "unsupported"})
            with lock:
                if job["ffmpeg"]["state"] != "busy":
                    job["ffmpeg"].update(state="busy", pct=0, msg="")
                    threading.Thread(target=fetch_ffmpeg, daemon=True).start()
            return self.send(200, {"error": ""})
        self.send(404, {"error": "not found"})


def main():
    os.makedirs(CFG, exist_ok=True)
    token()
    wr("helper.pid", str(os.getpid()))
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    # after an update, or after a reboot, bring the service back without asking
    if configured() and (not cpp_pids() or rd("running-version").strip() != VERSION):
        job["start"].update(state="busy", msg="starting")
        threading.Thread(target=start_cpp, daemon=True).start()
    srv.serve_forever()


if __name__ == "__main__":
    main()
