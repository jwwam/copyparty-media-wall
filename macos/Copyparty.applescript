-- Double-click launcher: starts the setup helper in the background and opens its page in the browser.
-- Everything else (password, folders, FFmpeg, start / stop) happens on that page.
property helperPort : "3924"
property helperVer : "helper-2"

on findPython()
	try
		return do shell script "if /usr/bin/xcode-select -p >/dev/null 2>&1 && [ -x /usr/bin/python3 ]; then echo /usr/bin/python3; exit 0; fi; for p in /opt/homebrew/bin/python3 /usr/local/bin/python3 /Library/Frameworks/Python.framework/Versions/Current/bin/python3; do if [ -x $p ]; then echo $p; exit 0; fi; done; exit 1"
	end try
	return ""
end findPython

on run
	set py to findPython()
	if py is "" then
		display dialog "这台电脑还没有安装 Python 3，影音库需要它才能运行。" & return & return & "点「安装」会打开苹果官方的「命令行开发者工具」安装窗口（免费，需要联网，约几分钟）。装完后再双击本程序。" & return & return & "Python 3 is required. Press Install to open Apple's Command Line Tools installer, then double-click this app again." buttons {"取消", "安装"} default button "安装" cancel button "取消" with title "copyparty"
		try
			do shell script "/usr/bin/xcode-select --install"
		end try
		return
	end if

	set res to (POSIX path of (path to me)) & "Contents/Resources/"
	set cfg to (POSIX path of (path to application support from user domain)) & "copyparty"
	set appDir to cfg & "/app"
	set pingCmd to "/usr/bin/curl -s -m 2 http://127.0.0.1:" & helperPort & "/api/ping"

	set helperUp to false
	try
		if (do shell script pingCmd) contains helperVer then set helperUp to true
	end try

	if not helperUp then
		-- run the helper from a private copy, so it keeps working after this app is moved or updated
		set cmd to "/bin/mkdir -p " & quoted form of (appDir & "/wall") & " && /bin/cp " & quoted form of (res & "wall-helper.py") & " " & quoted form of (res & "setup.html") & " " & quoted form of (res & "copyparty-sfx.py") & " " & quoted form of (appDir & "/") & " && /bin/cp " & quoted form of (res & "wall") & "/* " & quoted form of (appDir & "/wall/") & "; /usr/bin/pkill -f " & quoted form of (appDir & "/wall-helper.py") & "; /bin/sleep 0.5; " & ¬
			"(cd " & quoted form of appDir & " && exec /usr/bin/nohup " & quoted form of py & " " & quoted form of (appDir & "/wall-helper.py") & ") > \"$HOME/Library/Logs/copyparty-helper.log\" 2>&1 < /dev/null & " & ¬
			"for i in $(/usr/bin/seq 1 60); do " & pingCmd & " | /usr/bin/grep -q " & helperVer & " && exit 0; /bin/sleep 0.25; done; exit 1"
		try
			do shell script cmd
		on error
			display dialog "启动失败，请查看日志：~/Library/Logs/copyparty-helper.log" & return & return & "Could not start. See the log at ~/Library/Logs/copyparty-helper.log" buttons {"好"} default button "好" with title "copyparty" with icon stop
			return
		end try
	end if

	set tok to do shell script "/bin/cat " & quoted form of (cfg & "/helper-token")
	open location "http://127.0.0.1:" & helperPort & "/?t=" & tok
end run
