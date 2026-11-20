# -*- coding: utf-8 -*-
"""Starts the setup helper if it is not already running, then opens its page in the browser.

Used by the Windows launcher (run with pythonw.exe, so there is no console window).
"""
import importlib.util, os, subprocess, sys, time, urllib.request, webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("wall_helper", os.path.join(HERE, "wall-helper.py"))
H = importlib.util.module_from_spec(spec)
spec.loader.exec_module(H)


def ping():
    try:
        with urllib.request.urlopen("http://127.0.0.1:%d/api/ping" % H.PORT, timeout=2) as r:
            return H.VERSION in r.read().decode("utf-8", "replace")
    except Exception:
        return False


def fail(msg):
    if H.WIN:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, msg, "Media Wall", 0x10)
    else:
        sys.stderr.write(msg + "\n")
    sys.exit(1)


def main():
    if not ping():
        old = H.rd("helper.pid").strip()  # a helper from an older version: replace it
        if old.isdigit() and H.pid_alive(int(old)):
            if H.WIN:
                subprocess.run(["taskkill", "/PID", old, "/F"], capture_output=True, creationflags=H.NOWIN)
            else:
                try:
                    os.kill(int(old), 15)
                except OSError:
                    pass
            time.sleep(0.5)
        os.makedirs(H.CFG, exist_ok=True)
        log = open(os.path.join(H.CFG, "helper.log"), "ab")
        kw = {"creationflags": 0x00000008 | 0x00000200 | H.NOWIN} if H.WIN else {"start_new_session": True}  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
        subprocess.Popen([sys.executable, os.path.join(HERE, "wall-helper.py")], cwd=HERE, stdin=subprocess.DEVNULL,
                         stdout=log, stderr=log, close_fds=True, **kw)
        for _ in range(80):
            if ping():
                break
            time.sleep(0.25)
        else:
            fail("影音库没有启动成功。日志在：\nMedia Wall could not start. See the log at:\n" + os.path.join(H.CFG, "helper.log"))
    webbrowser.open("http://127.0.0.1:%d/?t=%s" % (H.PORT, H.token()))


if __name__ == "__main__":
    main()
