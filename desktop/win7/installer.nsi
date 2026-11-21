; Per-user installer for the Windows 7 / 8 / 8.1 (Electron-Legacy) edition.
; It wraps the already verified portable folder from package.py; it adds no
; files of its own besides shortcuts and an uninstaller, and never needs admin.
; Data stays in %APPDATA%\LLMHarbor-Win7 and is kept on uninstall.
;
;   makensis /DVERSION=1.0.0-preview.1 /DNUMVER=1.0.0.1 /DARCH=x64 ^
;            /DSRC=<extracted portable folder> /DICON=desktop\assets\tray.ico ^
;            /DLICENSE=LICENSE /DOUTFILE=<setup.exe> desktop\win7\installer.nsi

!ifndef VERSION | NUMVER | ARCH | SRC | ICON | LICENSE | OUTFILE
  !error "Define VERSION, NUMVER, ARCH, SRC, ICON, LICENSE and OUTFILE"
!endif

Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user
!include "MUI2.nsh"
!include "x64.nsh"

!define APP "LLMHarbor Legacy"
!define REGKEY "Software\LLMHarbor Legacy"
!define UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\LLMHarborLegacy"

Name "${APP}"
OutFile "${OUTFILE}"
; NSIS appends the last path component to a folder picked with Browse, so a
; user-chosen location still gets its own "LLMHarbor Legacy" subfolder.
InstallDir "$LOCALAPPDATA\Programs\${APP}"
InstallDirRegKey HKCU "${REGKEY}" "InstallDir"
BrandingText "LLMHarbor ${VERSION} for Windows 7, 8 and 8.1 (${ARCH})"

VIProductVersion "${NUMVER}"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "${APP} ${ARCH} setup"
VIAddVersionKey "CompanyName" "Zelvior Labs"
VIAddVersionKey "LegalCopyright" "MIT License"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\LLMHarbor.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Start LLMHarbor"
!insertmacro MUI_PAGE_LICENSE "${LICENSE}"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  !if "${ARCH}" == "x64"
    ${IfNot} ${RunningX64}
      MessageBox MB_ICONSTOP "This is the 64-bit installer. Use the x86 setup on 32-bit Windows."
      Abort
    ${EndIf}
  !endif
FunctionEnd

Section "LLMHarbor" Main
  SectionIn RO
  SetOutPath "$INSTDIR"
  File /r "${SRC}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortCut "$SMPROGRAMS\${APP}.lnk" "$INSTDIR\LLMHarbor.exe"
  CreateShortCut "$DESKTOP\${APP}.lnk" "$INSTDIR\LLMHarbor.exe"
  WriteRegStr HKCU "${REGKEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST}" "DisplayName" "${APP} (Windows 7/8/8.1, ${ARCH})"
  WriteRegStr HKCU "${UNINST}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST}" "Publisher" "Zelvior Labs"
  WriteRegStr HKCU "${UNINST}" "DisplayIcon" "$INSTDIR\LLMHarbor.exe"
  WriteRegStr HKCU "${UNINST}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINST}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINST}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\${APP}.lnk"
  Delete "$DESKTOP\${APP}.lnk"
  ; Only remove a folder that actually holds this app.
  IfFileExists "$INSTDIR\LLMHarbor.exe" 0 +2
    RMDir /r "$INSTDIR"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${UNINST}"
  DeleteRegKey HKCU "${REGKEY}"
SectionEnd
