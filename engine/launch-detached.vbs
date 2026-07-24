' 미르한 무콘솔 런처.
' cmd 콘솔을 공유하면 Ctrl+C가 그룹 전체에 전파되어 러너·뷰어·터널이 함께 죽는다.
' WScript.Shell.Run(창숨김=0, 대기안함=False)으로 띄우면 콘솔이 붙지 않아 전파가 끊긴다.
' 사용: wscript //nologo engine\launch-detached.vbs "전체경로\스크립트.cmd" ["인자"]
Dim sh, cmdLine, i
Set sh = CreateObject("WScript.Shell")
If WScript.Arguments.Count = 0 Then WScript.Quit 1
cmdLine = """" & WScript.Arguments(0) & """"
For i = 1 To WScript.Arguments.Count - 1
  cmdLine = cmdLine & " " & WScript.Arguments(i)
Next
sh.Run cmdLine, 0, False
