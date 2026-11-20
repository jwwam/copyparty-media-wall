# -*- coding: utf-8 -*-
"""Smoke test for a running copyparty-media-wall container.

    python docker/smoke_test.py --url http://127.0.0.1:3923 --password <pw> --media <host folder mounted at /media> [--readonly]

Expects the media folder to contain  照片 photos/picture.png  and  docs/note.txt  (and docs/clip.mp4 for the video check).
"""
from http.cookiejar import CookieJar
import argparse, json, os, sys, time, urllib.error, urllib.parse, urllib.request

ap = argparse.ArgumentParser()
ap.add_argument("--url", required=True)
ap.add_argument("--password", required=True)
ap.add_argument("--media", required=True)
ap.add_argument("--readonly", action="store_true")
A = ap.parse_args()
U = A.url.rstrip("/")
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


for _ in range(120):
    try:
        if call(U + "/")[0] == 200:
            break
    except Exception:
        pass
    time.sleep(0.5)

st, body, _ = call(U + "/")
check("library page is served", st == 200 and "影音库".encode("utf-8") in body)
st, body, _ = call(U + "/app.js")
check("front-end script is served", st == 200 and b"opShare" in body)
st, body, _ = call(U + "/media/?ls")
anon = json.loads(body.decode("utf-8")) if st == 200 and body[:1] == b"{" else {}
check("anonymous visitors cannot see any library content", st in (401, 403) or (not anon.get("dirs") and not anon.get("files")), st)
check("anonymous visitors cannot fetch files", call(U + "/media/docs/note.txt")[0] in (401, 403, 404))

cj = CookieJar()
bnd = "----smoke"
form = "".join('--%s\r\nContent-Disposition: form-data; name="%s"\r\n\r\n%s\r\n' % (bnd, k, v) for k, v in (("act", "login"), ("cppwd", A.password))) + "--%s--\r\n" % bnd
call(U + "/", data=form.encode(), headers={"Content-Type": "multipart/form-data; boundary=" + bnd}, jar=cj)
st, body, _ = call(U + "/media/?ls", jar=cj)
ls = json.loads(body.decode("utf-8")) if st == 200 else {}
names = sorted(urllib.parse.unquote(x["href"]) for x in ls.get("dirs", []))
check("login works and the library is listed", st == 200 and names == ["docs/", "照片 photos/"], names)
want = ["read", "get"] if A.readonly else ["read", "write", "move", "delete", "get"]
check("permission is %s" % ("read-only" if A.readonly else "read-write"), sorted(ls.get("perms", [])) == sorted(want), ls.get("perms"))

hits, last = [], ""
for _ in range(40):
    st, body, _ = call(U + "/media/?srch", data=json.dumps({"q": "name like *", "n": 999}).encode(), headers={"Content-Type": "text/plain"}, jar=cj)
    last = "%s %s" % (st, body[:200])
    hits = [urllib.parse.unquote(h["rp"]) for h in json.loads(body.decode("utf-8")).get("hits", [])] if st == 200 else []
    if any(h.endswith("picture.png") for h in hits):
        break
    time.sleep(1)
check("the index finds files, including non-ASCII names", any(h.endswith("picture.png") and "照片" in h for h in hits), hits or last)

st, body, hd = call(U + "/media/" + urllib.parse.quote("照片 photos/picture.png") + "?th=jf3", jar=cj)
check("image thumbnail is generated", st == 200 and "jpeg" in hd.get("Content-Type", ""), hd.get("Content-Type"))
if os.path.isfile(os.path.join(A.media, "docs", "clip.mp4")):
    st, body, hd = call(U + "/media/docs/clip.mp4?th=jf3", jar=cj)
    check("video cover is generated (FFmpeg in the image)", st == 200 and "jpeg" in hd.get("Content-Type", ""), hd.get("Content-Type"))
    dur = [h for h in json.loads(call(U + "/media/?srch", data=json.dumps({"q": "name like *.mp4", "n": 9}).encode(), headers={"Content-Type": "text/plain"}, jar=cj)[1].decode("utf-8")).get("hits", [])]
    check("video duration is read", bool(dur) and float(dur[0].get("tags", {}).get(".dur", 0)) > 0, dur[0].get("tags") if dur else "no hit")

st, body, _ = call(U + "/media/docs/uploaded.txt", data=b"uploaded by the smoke test", jar=cj, method="PUT")
if A.readonly:
    check("upload is refused in read-only mode", st in (401, 403, 405) and not os.path.isfile(os.path.join(A.media, "docs", "uploaded.txt")), st)
else:
    check("upload works in read-write mode", st in (200, 201) and os.path.isfile(os.path.join(A.media, "docs", "uploaded.txt")), st)

st, body, _ = call(U + "/?share", data=json.dumps({"k": "smokekey" + ("r" if A.readonly else "w"), "vp": ["/media/docs/note.txt"], "pw": "", "exp": "60", "perms": ["read"]}).encode(), headers={"Content-Type": "application/json"}, jar=cj)
check("share link is created", st == 201 and b"created share" in body, body[:120])
st, body, _ = call(U + "/share/smokekey" + ("r" if A.readonly else "w") + "/note.txt")
check("share link opens without login", st == 200 and body == b"hello from the smoke test", st)
st, body, _ = call(U + "/.wallstate/state.json", data=b'{"fav":{},"pos":{}}', headers={"Replace": "1"}, jar=cj, method="PUT")
check("watch state can be saved (also in read-only mode)", st in (200, 201), st)

print("\n%d failed" % len(fails) if fails else "\nall checks passed")
sys.exit(1 if fails else 0)
