# -*- coding: utf-8 -*-
"""Builds the Windows package: dist/copyparty-media-wall-windows.zip

Run on Windows with the same Python minor version as PY_VER (the Pillow wheels
are fetched for the interpreter that runs this script). The result needs no
installed Python: it carries the official embeddable distribution.
"""
import io, os, shutil, subprocess, sys, urllib.request, zipfile

PY_VER = "3.12.8"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAME = "copyparty-media-wall"
OUT = os.path.join(ROOT, "dist", "win")
TOP = os.path.join(OUT, NAME)
APP = os.path.join(TOP, "app")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "copyparty-media-wall-build"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def main():
    if sys.version_info[:2] != tuple(int(x) for x in PY_VER.split(".")[:2]) or os.name != "nt":
        sys.exit("run this on Windows with Python %s.x" % ".".join(PY_VER.split(".")[:2]))
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(os.path.join(APP, "wall"))

    # 1. the official embeddable Python (signed by the PSF), unmodified apart from its search path file
    pydir = os.path.join(APP, "python")
    zipfile.ZipFile(io.BytesIO(get("https://www.python.org/ftp/python/%s/python-%s-embed-amd64.zip" % (PY_VER, PY_VER)))).extractall(pydir)
    pth = [n for n in os.listdir(pydir) if n.endswith("._pth")][0]
    with open(os.path.join(pydir, pth), "w", encoding="ascii", newline="\r\n") as f:
        f.write("%s\n.\n..\\pylib\n" % pth.replace("._pth", ".zip"))

    # 2. Pillow for image thumbnails
    subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", "--only-binary=:all:",
                    "--target", os.path.join(APP, "pylib"), "pillow"], check=True)

    # 3. the official single-file copyparty release (MIT), unmodified
    with open(os.path.join(APP, "copyparty-sfx.py"), "wb") as f:
        f.write(get("https://github.com/9001/copyparty/releases/latest/download/copyparty-sfx.py"))

    # 4. this project
    for n in ("index.html", "app.js", "app.css"):
        shutil.copy(os.path.join(ROOT, "web", n), os.path.join(APP, "wall", n))
    for n in ("wall-helper.py", "setup.html", "launch.py"):
        shutil.copy(os.path.join(ROOT, "app", n), os.path.join(APP, n))
    with open(os.path.join(TOP, "Media Wall.bat"), "w", encoding="ascii", newline="\r\n") as f:
        f.write('@echo off\nstart "" "%~dp0app\\python\\pythonw.exe" "%~dp0app\\launch.py"\n')
    with open(os.path.join(ROOT, "windows", "README.txt"), encoding="utf-8") as a, open(os.path.join(TOP, "README.txt"), "w", encoding="utf-8-sig", newline="\r\n") as b:
        b.write(a.read())
    shutil.copy(os.path.join(ROOT, "LICENSE"), os.path.join(TOP, "LICENSE.txt"))

    zp = os.path.join(ROOT, "dist", NAME + "-windows.zip")
    if os.path.exists(zp):
        os.remove(zp)
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for base, _, files in os.walk(TOP):
            for n in files:
                full = os.path.join(base, n)
                z.write(full, os.path.relpath(full, OUT))
    print("built %s (%.1f MB)" % (zp, os.path.getsize(zp) / 1048576))


if __name__ == "__main__":
    main()
