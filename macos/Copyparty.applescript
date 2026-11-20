property appVer : "wall-5"
property portNum : "3923"
property pageUrl : "http://127.0.0.1:3923/"
property procMark : "copyparty-sfx.py -c "

on sfxPath()
	return (POSIX path of (path to me)) & "Contents/Resources/copyparty-sfx.py"
end sfxPath

on findPython()
	try
		return do shell script "if /usr/bin/xcode-select -p >/dev/null 2>&1 && [ -x /usr/bin/python3 ]; then echo /usr/bin/python3; exit 0; fi; for p in /opt/homebrew/bin/python3 /usr/local/bin/python3 /Library/Frameworks/Python.framework/Versions/Current/bin/python3; do if [ -x $p ]; then echo $p; exit 0; fi; done; exit 1"
	end try
	return ""
end findPython

on cfgDir()
	return (POSIX path of (path to application support from user domain)) & "copyparty"
end cfgDir

on runningVer()
	try
		return do shell script "/bin/cat " & quoted form of (cfgDir() & "/running-version")
	end try
	return ""
end runningVer

on isRunning()
	try
		do shell script "/usr/bin/pgrep -f -- " & quoted form of procMark
		return true
	on error
		return false
	end try
end isRunning

-- write text to a file only the current user can read
on writePrivate(fp, txt)
	do shell script "/bin/mkdir -p " & quoted form of cfgDir() & " && umask 077 && : > " & quoted form of fp & " && /bin/chmod 600 " & quoted form of fp
	set fh to open for access (POSIX file fp) with write permission
	try
		set eof fh to 0
		write txt to fh as «class utf8»
		close access fh
	on error e
		close access fh
		error e
	end try
end writePrivate

on isAlnum(s)
	if s is "" then return false
	repeat with c in characters of s
		if "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" does not contain c then return false
	end repeat
	return true
end isAlnum

on loadAccount()
	try
		set t to read (POSIX file (cfgDir() & "/account.txt")) as «class utf8»
		set ps to paragraphs of t
		if (count of ps) ≥ 2 and item 1 of ps is not "" and item 2 of ps is not "" then return {item 1 of ps, item 2 of ps}
	end try
	return missing value
end loadAccount

on askAccount()
	repeat
		set r to display dialog "设置登录用户名（字母、数字、- 或 _）：" default answer "" buttons {"取消", "下一步"} default button "下一步" cancel button "取消" with title "copyparty"
		set u to text returned of r
		if isAlnum(u) then exit repeat
		display dialog "用户名只能包含字母、数字、- 和 _，且不能为空。" buttons {"好"} default button "好" with title "copyparty" with icon caution
	end repeat
	repeat
		set r to display dialog "设置登录密码（至少 8 位，不能含空格）：" default answer "" buttons {"取消", "下一步"} default button "下一步" cancel button "取消" with title "copyparty" with hidden answer
		set p to text returned of r
		if (length of p) < 8 or p contains " " or p contains tab then
			display dialog "密码至少 8 位，且不能包含空格。" buttons {"好"} default button "好" with title "copyparty" with icon caution
		else
			set r to display dialog "再输入一次密码：" default answer "" buttons {"取消", "确定"} default button "确定" cancel button "取消" with title "copyparty" with hidden answer
			if text returned of r is p then exit repeat
			display dialog "两次输入的密码不一致，请重新设置。" buttons {"好"} default button "好" with title "copyparty" with icon caution
		end if
	end repeat
	writePrivate(cfgDir() & "/account.txt", u & linefeed & p & linefeed)
	return {u, p}
end askAccount

on lanIP()
	try
		return do shell script "/sbin/ifconfig | /usr/bin/awk '/inet / && $2 !~ /^127\\./ && $2 !~ /^169\\.254\\./ {print $2; exit}'"
	end try
	return ""
end lanIP

on showAddress()
	set addr to lanIP()
	if addr is "" then
		set msg to "服务已启动，但没有检测到局域网地址（可能未连接网络）。" & return & return & "本机访问：" & pageUrl
	else
		set msg to "服务已启动。" & return & return & "局域网内其他设备访问：" & return & "http://" & addr & ":" & portNum & "/" & return & return & "本机访问：" & pageUrl & return & return & "打开后输入你设置的密码登录。"
	end if
	display dialog msg buttons {"好"} default button "好" with title "copyparty"
end showAddress

on loadFolders()
	set out to {}
	try
		set t to read (POSIX file (cfgDir() & "/folders.txt")) as «class utf8»
		repeat with ln in paragraphs of t
			set s to ln as text
			if s is not "" then
				try
					do shell script "/bin/test -d " & quoted form of s
					set end of out to s
				end try
			end if
		end repeat
	end try
	return out
end loadFolders

on saveFolders(fl)
	set t to ""
	repeat with s in fl
		set t to t & (s as text) & linefeed
	end repeat
	writePrivate(cfgDir() & "/folders.txt", t)
end saveFolders

on addFolders(fl)
	set picked to choose folder with prompt "选择要加入影音库的文件夹（按住 Command 可以一次选多个）：" with multiple selections allowed
	repeat with f in picked
		set s to POSIX path of f
		if s ends with "/" and s is not "/" then set s to text 1 thru -2 of s
		if fl does not contain s then set end of fl to s
	end repeat
	return fl
end addFolders

-- the list of shared folders is remembered between launches; this is where folders are added or removed
on manageFolders()
	set fl to loadFolders()
	if (count of fl) is 0 then set fl to addFolders(fl)
	repeat
		set msg to "影音库会扫描下面这些文件夹："
		set n to 0
		repeat with s in fl
			set n to n + 1
			set msg to msg & return & "  " & n & ". " & (s as text)
		end repeat
		if (count of fl) is 0 then set msg to "还没有添加任何文件夹。"
		set pick to choose from list {"下一步", "添加文件夹…", "移除文件夹…"} with prompt msg default items {"下一步"} with title "copyparty · 共享目录" OK button name "确定" cancel button name "取消"
		if pick is false then error number -128
		set b to item 1 of pick
		if b is "添加文件夹…" then
			try
				set fl to addFolders(fl)
			end try
		else if b is "移除文件夹…" then
			if (count of fl) > 0 then
				set gone to choose from list fl with prompt "选择要移除的文件夹（只是不再共享，不会删除任何文件）：" with title "copyparty · 共享目录" OK button name "移除" cancel button name "取消" with multiple selections allowed
				if gone is not false then
					set keep to {}
					repeat with s in fl
						if gone does not contain (s as text) then set end of keep to (s as text)
					end repeat
					set fl to keep
				end if
			end if
		else
			if (count of fl) > 0 then exit repeat
		end if
	end repeat
	saveFolders(fl)
	return fl
end manageFolders

-- one folder is mounted directly at /media; several are mounted side by side as /media/<folder name>
on volumeConfig(fl, perm, uname)
	set accs to "  accs:" & linefeed & "    " & perm & ": " & uname & linefeed & linefeed
	if (count of fl) is 1 then return "[/media]" & linefeed & "  " & (item 1 of fl) & linefeed & accs
	set out to "[/media]" & linefeed & "  " & cfgDir() & "/mediaroot" & linefeed & "  accs:" & linefeed & "    r: " & uname & linefeed & linefeed
	set used to {}
	repeat with s in fl
		set nm to do shell script "/usr/bin/basename " & quoted form of (s as text) & " | /usr/bin/sed 's/[][#:\\\\]/_/g'"
		if nm is "" or nm is "/" then set nm to "目录"
		set base to nm
		set k to 1
		repeat while used contains nm
			set k to k + 1
			set nm to base & " " & k
		end repeat
		set end of used to nm
		set out to out & "[/media/" & nm & "]" & linefeed & "  " & (s as text) & linefeed & accs
	end repeat
	return out
end volumeConfig

on run
	-- a service started by an older copy of this app keeps serving the old pages until it is restarted
	if isRunning() and runningVer() is not appVer then
		display dialog "检测到旧版本的服务还在后台运行。需要重新启动它，才能用上新的界面。" buttons {"取消", "重新启动"} default button "重新启动" cancel button "取消" with title "copyparty"
		do shell script "/usr/bin/pkill -f -- " & quoted form of procMark & "; /bin/sleep 2; exit 0"
	end if
	if isRunning() then
		set pick to choose from list {"打开页面", "查看访问地址", "管理共享目录（会重启服务）", "停止服务"} with prompt "copyparty 正在运行。" default items {"打开页面"} with title "copyparty" OK button name "确定" cancel button name "取消"
		if pick is false then return
		set b to item 1 of pick
		if b is "停止服务" then
			do shell script "/usr/bin/pkill -f -- " & quoted form of procMark
			display notification "服务已停止" with title "copyparty"
			return
		else if b is "查看访问地址" then
			showAddress()
			return
		else if b starts with "管理共享目录" then
			do shell script "/usr/bin/pkill -f -- " & quoted form of procMark & "; /bin/sleep 2; exit 0"
		else
			open location pageUrl
			return
		end if
	end if

	set py to findPython()
	if py is "" then
		set r to display dialog "这台电脑还没有安装 Python 3，copyparty 需要它才能运行。" & return & return & "点「安装」会打开苹果官方的「命令行开发者工具」安装窗口（免费，需要联网，约几分钟）。装完后再双击本程序。" buttons {"取消", "安装"} default button "安装" cancel button "取消" with title "copyparty"
		try
			do shell script "/usr/bin/xcode-select --install"
		end try
		return
	end if

	set acct to loadAccount()
	if acct is missing value then
		set acct to askAccount()
	else
		set r to display dialog "当前登录用户名：" & (item 1 of acct) buttons {"取消", "修改账号密码", "继续"} default button "继续" cancel button "取消" with title "copyparty"
		if button returned of r is "修改账号密码" then set acct to askAccount()
	end if

	set fl to manageFolders()
	set r to display dialog "选择登录后的权限：" buttons {"取消", "可上传和删除", "只读"} default button "只读" cancel button "取消" with title "copyparty"
	if button returned of r is "只读" then
		set perm to "r"
	else
		set perm to "rwmd"
	end if

	-- thumbnails need the Pillow library; keep a private copy next to the config
	set libDir to cfgDir() & "/pylib"
	try
		do shell script "PYTHONPATH=" & quoted form of libDir & " " & quoted form of py & " -c 'import PIL'"
	on error
		display notification "首次启动：正在安装图片缩略图组件，请稍候…" with title "copyparty"
		try
			do shell script "/bin/mkdir -p " & quoted form of libDir & " && " & quoted form of py & " -m pip install -q --disable-pip-version-check --timeout 10 --retries 1 --upgrade --target " & quoted form of libDir & " pillow > /dev/null 2>&1"
		end try
	end try
	
	-- video/audio covers need ffmpeg + ffprobe; use an installed copy, else offer a one-time download
	set binDir to cfgDir() & "/bin"
	set haveFF to true
	try
		do shell script "PATH=" & quoted form of binDir & ":/opt/homebrew/bin:/usr/local/bin:$PATH; command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null"
	on error
		set haveFF to false
	end try
	if not haveFF then
		set skipFF to true
		try
			do shell script "/bin/test -e " & quoted form of (cfgDir() & "/skip-ffmpeg")
		on error
			set skipFF to false
		end try
		if not skipFF then
			set r to display dialog "要显示视频和音乐的封面图，需要下载 FFmpeg 组件（约 60 MB，只需一次）。现在下载吗？下载期间请稍等，不要重复打开。" buttons {"以后不再问", "这次跳过", "下载"} default button "下载" with title "copyparty"
			if button returned of r is "下载" then
				try
					do shell script "a=$(/usr/bin/uname -m); [ \"$a\" = arm64 ] || a=amd64; /bin/mkdir -p " & quoted form of binDir & " && cd " & quoted form of binDir & " && for b in ffmpeg ffprobe; do /usr/bin/curl -fsSL --connect-timeout 15 -m 600 -o $b.zip https://ffmpeg.martin-riedl.de/redirect/latest/macos/$a/release/$b.zip && /usr/bin/unzip -oq $b.zip $b && /bin/rm -f $b.zip && /bin/chmod 755 $b || exit 1; done; ./ffmpeg -version >/dev/null && ./ffprobe -version >/dev/null"
				on error
					do shell script "/bin/rm -rf " & quoted form of binDir
					display dialog "FFmpeg 下载失败（可能是网络问题）。服务会照常启动，只是暂时没有视频封面，下次启动可以再试。" buttons {"好"} default button "好" with title "copyparty" with icon caution
				end try
			else if button returned of r is "以后不再问" then
				do shell script "/bin/mkdir -p " & quoted form of cfgDir() & " && /usr/bin/touch " & quoted form of (cfgDir() & "/skip-ffmpeg")
			end if
		end if
	end if
	
	set cfgPath to cfgDir() & "/copyparty.conf"
	-- the media-wall front end is served from a private copy; indexes, thumbnails and synced state live next to it
	set wallDir to cfgDir() & "/wall"
	do shell script "/bin/mkdir -p " & quoted form of (cfgDir() & "/state") & " " & quoted form of (cfgDir() & "/hist") & " " & quoted form of (cfgDir() & "/mediaroot") & " && /bin/rm -rf " & quoted form of wallDir & " && /bin/cp -R " & quoted form of ((POSIX path of (path to me)) & "Contents/Resources/wall") & " " & quoted form of wallDir
	set cfg to "[global]" & linefeed & "  i: 0.0.0.0" & linefeed & "  p: " & portNum & linefeed & "  q" & linefeed & "  grid" & linefeed & ¬
		"  e2dsa" & linefeed & "  e2ts" & linefeed & "  no-hash: ." & linefeed & "  re-maxage: 300" & linefeed & "  srch-hits: 200000" & linefeed & ¬
		"  hist: " & cfgDir() & "/hist" & linefeed & linefeed & ¬
		"[accounts]" & linefeed & "  " & (item 1 of acct) & ": " & (item 2 of acct) & linefeed & linefeed & ¬
		"[/]" & linefeed & "  " & wallDir & linefeed & "  accs:" & linefeed & "    h: *" & linefeed & "  flags:" & linefeed & "    d2d" & linefeed & linefeed & ¬
		volumeConfig(fl, perm, item 1 of acct) & ¬
		"[/.wallstate]" & linefeed & "  " & cfgDir() & "/state" & linefeed & "  accs:" & linefeed & "    rwd: " & (item 1 of acct) & linefeed & "  flags:" & linefeed & "    d2d" & linefeed
	writePrivate(cfgPath, cfg)

	set cmd to "(cd /tmp && PATH=" & quoted form of binDir & ":/opt/homebrew/bin:/usr/local/bin:$PATH PYTHONPATH=" & quoted form of libDir & " exec nohup " & quoted form of py & " " & quoted form of sfxPath() & " -c " & quoted form of cfgPath & " ) > \"$HOME/Library/Logs/copyparty.log\" 2>&1 < /dev/null & " & ¬
		"for i in $(/usr/bin/seq 1 80); do /usr/bin/curl -s -o /dev/null " & pageUrl & " && exit 0; /bin/sleep 0.5; done; exit 1"
	try
		do shell script cmd
	on error
		display dialog "启动失败，请查看日志：~/Library/Logs/copyparty.log" buttons {"好"} default button "好" with title "copyparty" with icon stop
		return
	end try
	do shell script "/usr/bin/printf %s " & quoted form of appVer & " > " & quoted form of (cfgDir() & "/running-version")
	showAddress()
	open location pageUrl
end run
