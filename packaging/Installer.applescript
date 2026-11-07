on run
	set sourceRoot to POSIX path of (container of (path to me))
	set targetRoot to (system attribute "HOME") & "/Library/Application Support/FluentScreen"
	set extensionSource to sourceRoot & "Chrome Extension"
	set helperSource to sourceRoot & "FluentScreen Vision.app"
	set extensionTarget to targetRoot & "/Chrome Extension"
	set helperTarget to targetRoot & "/FluentScreen Vision.app"

	do shell script "/bin/mkdir -p " & quoted form of targetRoot
	do shell script "/usr/bin/ditto " & quoted form of extensionSource & " " & quoted form of extensionTarget
	do shell script "/usr/bin/ditto " & quoted form of helperSource & " " & quoted form of helperTarget
	do shell script "/bin/chmod +x " & quoted form of (extensionTarget & "/mac-helper/install-native-host.sh")
	do shell script quoted form of (extensionTarget & "/mac-helper/install-native-host.sh")

	do shell script "/usr/bin/open -a 'Google Chrome' 'chrome://extensions'"
	do shell script "/usr/bin/open -R " & quoted form of extensionTarget

	display dialog "FluentScreen 已安装。\n\n请在 Chrome 扩展页面打开“开发者模式”，点击“加载已解压的扩展程序”，选择 Finder 中显示的 Chrome Extension 文件夹。\n\nFluentScreen is installed. Enable Developer mode, click Load unpacked, and select the revealed Chrome Extension folder." buttons {"知道了 / Done"} default button 1 with title "FluentScreen"
end run

