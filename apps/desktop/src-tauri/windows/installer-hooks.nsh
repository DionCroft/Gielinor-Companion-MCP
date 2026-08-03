; Tauri's interactive uninstaller owns the Delete app data checkbox. Version 1.1
; stores its SQLite data outside Tauri's standard bundle-id directories, so
; honour that same explicit choice for the compatibility data directory too.
; Silent uninstall leaves the checkbox unset and upgrades set UpdateMode.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    RmDir /r "$PROFILE\.gielinor-companion"
  ${EndIf}
!macroend
