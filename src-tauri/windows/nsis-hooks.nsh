; Hooks for Tauri NSIS bundle — see bundle.windows.nsis.installerHooks
; When the user opts to delete app data, optionally preserve the default songs folder
; under %LOCALAPPDATA%\${BUNDLEID}\songs by moving it aside before the bundled RmDir runs.

Var BsmPreserveSongs
Var BsmSongsBackup

!macro NSIS_HOOK_PREINSTALL
!macroend

!macro NSIS_HOOK_POSTINSTALL
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  StrCpy $BsmPreserveSongs 0

  ; Only when "delete app data" is checked and not an update uninstall
  StrCmp $DeleteAppDataCheckboxState "1" 0 bsm_after_ask
  StrCmp $UpdateMode "1" bsm_after_ask 0

  MessageBox MB_YESNO "是否保留已下载的曲包（songs 文件夹）？$\r$\n选择“是”将保留，重装本游戏后无需重新导入。" IDYES bsm_keep_songs IDNO bsm_after_ask
  bsm_keep_songs:
    StrCpy $BsmPreserveSongs 1
  bsm_after_ask:

  StrCmp $BsmPreserveSongs "1" 0 bsm_pre_end
    IfFileExists "$LOCALAPPDATA\${BUNDLEID}\songs" 0 bsm_pre_end
    StrCpy $BsmSongsBackup "$TEMP\BestStepMania_songs_backup_$PID"
    CreateDirectory "$BsmSongsBackup"
    Rename "$LOCALAPPDATA\${BUNDLEID}\songs" "$BsmSongsBackup\songs"
    IfFileExists "$LOCALAPPDATA\${BUNDLEID}\songs" 0 bsm_pre_end
    MessageBox MB_ICONEXCLAMATION "无法移动曲包目录，将随应用数据一并删除。"
    StrCpy $BsmPreserveSongs 0
  bsm_pre_end:
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  StrCmp $BsmPreserveSongs "1" 0 bsm_post_end
  IfFileExists "$BsmSongsBackup\songs" bsm_restore_try bsm_post_end
  bsm_restore_try:
    CreateDirectory "$LOCALAPPDATA\${BUNDLEID}"
    Rename "$BsmSongsBackup\songs" "$LOCALAPPDATA\${BUNDLEID}\songs"
    IfFileExists "$BsmSongsBackup\songs" bsm_restore_fail bsm_post_cleanup
  bsm_restore_fail:
    MessageBox MB_ICONEXCLAMATION "曲包未能恢复到原位置，请从临时目录手动复制：$\n$BsmSongsBackup\songs"
    Goto bsm_post_end
  bsm_post_cleanup:
    RMDir "$BsmSongsBackup"
  bsm_post_end:
!macroend
