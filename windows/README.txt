Media Wall (copyparty-media-wall) for Windows
影音库 Windows 版
=============================================

English
-------

1. Unzip the whole folder somewhere you want to keep it (for example Documents).
   Do not run it from inside the zip.
2. Double-click "Media Wall.bat".
   Windows may show "Windows protected your PC" because the package is not
   code-signed: click "More info", then "Run anyway".
3. Your browser opens a setup page. Follow the steps: create the login, add your
   media folders, choose read-only or read-write, optionally download FFmpeg
   (needed for video covers, about 140 MB).
4. When Windows Firewall asks whether to allow Python on your networks, allow it
   on private networks. Otherwise other devices cannot connect.

Afterwards:
- Double-click "Media Wall.bat" again to open the control page: open the
  library, copy the address for other devices, add or remove folders, change
  the password, stop or restart.
- The control page only opens on this computer.
- After a restart of the computer, double-click "Media Wall.bat" once to bring
  the library back.
- Nothing is installed. To remove it, stop the service on the control page,
  delete this folder, and delete %APPDATA%\copyparty-media-wall (settings,
  thumbnails, watch history).

Needs 64-bit Windows 10 or 11. No Python installation is required; the folder
contains the official embeddable Python.

Connections are plain HTTP: use it on networks you trust.


中文
----

1. 把整个文件夹解压到一个固定的位置（比如「文档」）。不要在压缩包里直接运行。
2. 双击「Media Wall.bat」。
   因为程序没有代码签名，Windows 可能提示「Windows 已保护你的电脑」：
   点「更多信息」，再点「仍要运行」。
3. 浏览器会自动打开设置页面。按步骤操作：设置登录账号、添加媒体文件夹、
   选择只读或可读写，还可以下载 FFmpeg（显示视频封面需要它，约 140 MB）。
4. Windows 防火墙询问是否允许 Python 访问网络时，请在「专用网络」上允许，
   否则其他设备连不上。

之后：
- 再次双击「Media Wall.bat」打开管理页面：打开影音库、复制给其他设备用的
  地址、添加或移除文件夹、修改密码、停止或重启。
- 管理页面只能在这台电脑上打开。
- 电脑重启后，双击一次「Media Wall.bat」即可恢复。
- 不会往系统里安装任何东西。要卸载：先在管理页面停止服务，删除这个文件夹，
  再删除 %APPDATA%\copyparty-media-wall（设置、缩略图、播放记录）。

需要 64 位 Windows 10 或 11。不需要安装 Python，文件夹里自带官方的
嵌入式 Python。

连接是明文 HTTP，请只在可信的网络里使用。
