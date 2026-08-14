export type Lang = 'zh' | 'en'

export const STRINGS = {
  // Generic
  'generic.working': { zh: '處理中…', en: 'Working…' },

  // Map overlay
  'overlay.collapse_panel': { zh: '收合面板', en: 'Collapse panel' },
  'overlay.expand_panel': { zh: '展開面板', en: 'Expand panel' },

  // History
  'history.title': { zh: '操作記錄', en: 'History' },
  'history.empty': { zh: '尚無記錄。', en: 'No history yet.' },
  'history.count': { zh: '筆記錄', en: 'entries' },

  // Favorites
  'favorites.title': { zh: '我的最愛', en: 'Favorites' },
  'favorites.empty': { zh: '尚無收藏。', en: 'No favorites yet.' },
  'favorites.empty_search': { zh: '沒有符合的結果', en: 'No matching favorites.' },
  'favorites.add': { zh: '加入最愛', en: 'Add to favorites' },
  'favorites.delete': { zh: '刪除', en: 'Delete' },
  'favorites.added': { zh: '已加入最愛', en: 'Added to favorites' },
  'favorites.name_title': { zh: '為此座標命名', en: 'Name this location' },
  'favorites.name_placeholder': { zh: '例如：台北 101、補給點', en: 'e.g. Taipei 101, Supply stop' },
  'favorites.rename': { zh: '重新命名', en: 'Rename' },
  'favorites.save': { zh: '儲存', en: 'Save' },
  'favorites.cancel': { zh: '取消', en: 'Cancel' },
  'favorites.search_placeholder': { zh: '搜尋最愛…', en: 'Search favorites…' },
  'favorites.sort.manual': { zh: '自訂排序', en: 'Custom order' },
  'favorites.sort.name': { zh: '依名稱', en: 'By name' },
  'favorites.sort.date': { zh: '依日期', en: 'By date' },
  'favorites.group_placeholder': { zh: '分組名稱（可留空）', en: 'Group name (optional)' },
  'favorites.notes_placeholder': { zh: '備忘說明（可留空）', en: 'Notes (optional)' },
  'favorites.ungrouped': { zh: '未分組', en: 'Ungrouped' },
  'favorites.new_group': { zh: '新增分組', en: 'New group' },
  'favorites.undo_delete': { zh: '已刪除', en: 'Deleted' },
  'favorites.undo': { zh: '復原', en: 'Undo' },
  'favorites.drag_hint': { zh: '拖曳調整順序', en: 'Drag to reorder' },
  'favorites.edit_title': { zh: '編輯最愛', en: 'Edit favorite' },
  'favorites.count': { zh: '個最愛', en: 'favorites' },

  // Search
  'search.placeholder': { zh: '搜尋地名關鍵字 (例如: 台北101, 駁二藝術特區)…', en: 'Search place keyword (e.g. Taipei 101)…' },
  'search.no_results': { zh: '未找到匹配的地點', en: 'No matching places found' },
  'search.title': { zh: '搜尋地點', en: 'Search Location' },

  // Shared panel hints
  'panel.hint.select_device': { zh: '請先選擇裝置。', en: 'Select a device above.' },
  'panel.hint.device_not_ready': { zh: '裝置尚未就緒。', en: 'Device is not ready yet.' },
  'panel.hint.teleporting': { zh: '裝置正在瞬移中。', en: 'Device is currently teleporting.' },
  'panel.pause_toggle': { zh: '每站暫停', en: 'Pause at each stop' },
  'panel.add_waypoint': { zh: '+ 新增路徑', en: '+ Add' },
  'panel.remove_waypoint': { zh: '移除路徑', en: 'Remove' },
  'panel.sec_label': { zh: '秒', en: 'Sec' },
  'panel.paused': { zh: '已暫停。', en: 'Paused.' },

  // Top bar
  'topbar.title': { zh: 'ArcWayfarer', en: 'ArcWayfarer' },

  // Version & Auto Update
  'version.title': { zh: '版本與更新', en: 'Version & Updates' },
  'version.current': { zh: '目前版本', en: 'Current Version' },
  'version.latest': { zh: '最新版本', en: 'Latest Version' },
  'version.up_to_date': { zh: '目前已是最新版本', en: 'You are using the latest version' },
  'version.new_available': { zh: '發現新版本！', en: 'New Version Available!' },
  'version.check_btn': { zh: '檢查更新', en: 'Check for Updates' },
  'version.checking': { zh: '檢查中…', en: 'Checking…' },
  'version.download_now': { zh: '下載新版本', en: 'Download New Version' },
  'version.download_for_env': { zh: '下載適用於您的系統之版本', en: 'Download installer for your system' },
  'version.all_platforms': { zh: '所有環境下載選項 (3 種架構)', en: 'All Environments Download Options (3 Architectures)' },
  'version.env.mac_arm64': { zh: 'macOS (Apple Silicon M1/M2/M3/M4)', en: 'macOS (Apple Silicon M1/M2/M3/M4)' },
  'version.env.mac_x64': { zh: 'macOS (Intel 晶片)', en: 'macOS (Intel Processor)' },
  'version.env.win_x64': { zh: 'Windows (64-位元)', en: 'Windows (64-bit)' },
  'version.release_notes': { zh: '更新說明 (Changelog)', en: 'Release Notes (Changelog)' },
  'version.view_github': { zh: '在 GitHub 查看 Release 頁面', en: 'View Release on GitHub' },


  // Dev menu
  'devmenu.title': { zh: '開發者模式選單', en: 'Developer Menu' },
  'devmenu.select_device_first': { zh: '請先連線裝置', en: 'Select a device first' },
  'devmenu.amfi_reveal': { zh: '顯示開發者模式選項 (AMFI)', en: 'Reveal Developer Mode option (AMFI)' },
  'devmenu.amfi_success': {
    zh: '已在裝置上顯示開發者模式選項，請至 設定→隱私權與安全性 手動開啟',
    en: 'Developer Mode option revealed on device. Enable it manually under Settings → Privacy & Security.',
  },
  'devmenu.amfi_failed': { zh: 'AMFI reveal 失敗', en: 'AMFI reveal failed' },
  'devmenu.lang_label': { zh: '語言', en: 'Language' },
  'devmenu.remote': { zh: '手機遙控', en: 'Mobile Remote' },
  'devmenu.sponsor': { zh: '支持開發者', en: 'Support the Developer' },

  // Mode selector
  'mode.teleport': { zh: '瞬移', en: 'Teleport' },
  'mode.navigate': { zh: '導航', en: 'Navigate' },
  'mode.route_loop': { zh: '路線循環', en: 'Route Loop' },
  'mode.multi_stop': { zh: '多點巡迴', en: 'Multi-stop' },
  'mode.random_walk': { zh: '隨機漫遊', en: 'Random Walk' },
  'mode.joystick': { zh: '搖桿', en: 'Joystick' },

  // Nav mode select
  'navmode.walk': { zh: '走路', en: 'Walk' },
  'navmode.bike': { zh: '騎車', en: 'Bike' },
  'navmode.drive': { zh: '開車', en: 'Drive' },

  // Playback controls
  'playback.start': { zh: '開始', en: 'Start' },
  'playback.pause': { zh: '暫停', en: 'Pause' },
  'playback.resume': { zh: '繼續', en: 'Resume' },
  'playback.stop': { zh: '停止', en: 'Stop' },

  // Device selector
  'device.searching': { zh: '搜尋裝置中…', en: 'Searching for devices…' },
  'device.none': { zh: '無裝置連線', en: 'No device connected' },
  'device.select': { zh: '選擇裝置', en: 'Select a device' },
  'device.status.mounting': { zh: '（掛載開發者映像中…）', en: ' (mounting developer image…)' },
  'device.status.tunnel_required': { zh: '（需要 tunnel）', en: ' (tunnel required)' },
  'device.status.error': { zh: '（錯誤）', en: ' (error)' },
  'device.rescan': { zh: '重新掃描裝置', en: 'Rescan for devices' },

  // Connection status
  'connection.connected': { zh: '後端已連線', en: 'Backend connected' },
  'connection.disconnected': { zh: '後端未連線', en: 'Backend disconnected' },

  // Status bar
  'statusbar.lat': { zh: '緯度', en: 'Lat' },
  'statusbar.lng': { zh: '經度', en: 'Lng' },
  'statusbar.speed': { zh: '速度', en: 'Speed' },

  // Teleport panel
  'teleport.title': { zh: '瞬移', en: 'Teleport' },
  'teleport.description': {
    zh: '點下方欄位，再點地圖 — 或直接輸入座標。',
    en: 'Click the field below, then click the map — or type coordinates directly.',
  },
  'teleport.hint.navigating': {
    zh: '裝置正在進行其他模式 — 設定或清除位置將會停止當前模式。',
    en: 'Device is currently running another mode — setting or clearing location will stop it.',
  },
  'teleport.action.preview': { zh: '預覽', en: 'Preview' },
  'teleport.action.set_location': { zh: '瞬移至此', en: 'Teleport here' },
  'teleport.action.clear': { zh: '還原定位', en: 'Restore location' },
  'teleport.mode.standard': { zh: '一般瞬移', en: 'Teleport' },
  'teleport.distance': { zh: '距離目前位置', en: 'Distance from current location' },
  'teleport.cooldown': { zh: '建議等待', en: 'Suggested wait' },
  'teleport.status.set_success': { zh: '位置已設定。', en: 'Location set.' },
  'teleport.status.set_failed': { zh: '設定位置失敗。', en: 'Failed to set location.' },
  'teleport.status.clear_success': { zh: '位置已清除。', en: 'Location cleared.' },
  'teleport.status.clear_failed': { zh: '清除位置失敗。', en: 'Failed to clear location.' },
  'teleport.goldditto.title': { zh: '拉金盆', en: 'Gold Ditto' },
  'teleport.goldditto.help': {
    zh: '在上方輸入座標點（例如金花點）後按下，系統會瞬移過去停留 2 秒，再自動清除、恢復真實位置。',
    en: 'Enter a coordinate above (e.g. a gold flower point), then press. It teleports there for 2 seconds, then auto-clears back to your real location.',
  },
  'teleport.goldditto.action': { zh: '拉金盆', en: 'Gold Ditto' },
  'teleport.goldditto.status.success': { zh: '拉金盆完成，已恢復真實位置。', en: 'Gold Ditto complete, restored to real location.' },
  'teleport.goldditto.status.failed': { zh: '拉金盆失敗。', en: 'Gold Ditto failed.' },

  // Navigate panel
  'navigate.title': { zh: '導航', en: 'Navigate' },
  'navigate.active_leg': { zh: '起點 → 終點', en: 'Start → destination' },
  'navigate.description': {
    zh: '沿著兩點間的路線走路、騎車或開車。',
    en: 'Walk, bike, or drive along a routed path between two points.',
  },
  'navigate.swap': { zh: '⇅ 交換', en: '⇅ Swap' },
  'navigate.status.running': { zh: '執行中', en: 'Running' },
  'navigate.status.failed_start': { zh: '導航啟動失敗。', en: 'Failed to start navigation.' },
  'navigate.status.failed_stop': { zh: '導航停止失敗。', en: 'Failed to stop navigation.' },
  'navigate.status.failed_update': { zh: '導航更新失敗。', en: 'Failed to update navigation.' },

  // Route loop panel
  'routeloop.title': { zh: '路線循環', en: 'Route Loop' },
  'routeloop.description': {
    zh: '沿著路徑點重複循環路線，直到停止。',
    en: 'Repeat a closed route through your waypoints until stopped.',
  },
  'routeloop.status.looping': { zh: '循環中', en: 'Looping' },
  'routeloop.status.failed_start': { zh: '路線循環啟動失敗。', en: 'Failed to start route loop.' },
  'routeloop.status.failed_stop': { zh: '路線循環停止失敗。', en: 'Failed to stop route loop.' },
  'routeloop.status.failed_update': { zh: '路線循環更新失敗。', en: 'Failed to update route loop.' },
  'routeloop.mode.manual': { zh: '手動路徑點', en: 'Manual Waypoints' },
  'routeloop.mode.circle': { zh: '圓形路徑', en: 'Circle Route' },
  'routeloop.circle.center': { zh: '中心點', en: 'Center Point' },
  'routeloop.circle.radius': { zh: '半徑 (公里)', en: 'Radius (km)' },
  'routeloop.circle.count': { zh: '段數 (點數)', en: 'Segments (points)' },
  'routeloop.circle.select_center_map': { zh: '點擊地圖選擇中心點', en: 'Click map to choose center' },
  'routeloop.circle.use_current_location': { zh: '帶入當前點', en: 'Use device location' },


  // Multi-stop panel
  'multistop.title': { zh: '多點巡迴', en: 'Multi-stop' },
  'multistop.description': { zh: '依序拜訪每個路徑點一次。', en: 'Visit each waypoint once, in order.' },
  'multistop.status.visiting': { zh: '巡迴中', en: 'Visiting' },
  'multistop.stop_progress': { zh: '已抵達第', en: 'At stop' },
  'multistop.status.failed_start': { zh: '多點巡迴啟動失敗。', en: 'Failed to start multi-stop.' },
  'multistop.status.failed_stop': { zh: '多點巡迴停止失敗。', en: 'Failed to stop multi-stop.' },
  'multistop.status.failed_update': { zh: '多點巡迴更新失敗。', en: 'Failed to update multi-stop.' },
  'multistop.straight_line': { zh: '直線順飛', en: 'Straight line' },
  'multistop.jump_mode': { zh: '瞬移前往', en: 'Jump mode (instant teleport)' },
  'multistop.jump_pre_delay': { zh: '站前延遲（秒）', en: 'Pre-arrival delay (sec)' },
  'multistop.jump_post_delay': { zh: '站後延遲（秒）', en: 'Post-arrival delay (sec)' },
  'multistop.custom_speed': { zh: '自訂速度 (km/h)', en: 'Custom speed (km/h)' },
  'multistop.import_gpx': { zh: '匯入 GPX', en: 'Import GPX' },
  'multistop.import_file': { zh: '匯入檔案', en: 'Import file' },
  'multistop.export_template': { zh: '匯出範本', en: 'Export JSON' },
  'multistop.import_template': { zh: '載入範本', en: 'Import JSON' },
  'multistop.import_template_success': { zh: '已成功載入 JSON 路線範本！', en: 'Loaded JSON route template successfully!' },
  'multistop.import_gpx_success': { zh: '已成功匯入 GPX 軌跡！', en: 'Imported GPX route successfully!' },
  'multistop.import_unrecognized_file': { zh: '無法識別的檔案內容，請提供有效的 .gpx 或 .json 檔案。', en: 'Unrecognized file content. Please provide a valid .gpx or .json file.' },
  'multistop.import_file_failed': { zh: '檔案讀取或解析失敗。', en: 'Failed to read or parse file.' },
  'multistop.paste_coords': { zh: '貼上座標', en: 'Paste coordinates' },
  'multistop.paste_placeholder': { zh: '每行一組座標，例如：\n25.033, 121.565\n25.041, 121.557', en: 'One coordinate per line, e.g.:\n25.033, 121.565\n25.041, 121.557' },
  'multistop.paste_submit': { zh: '套用', en: 'Apply' },
  'multistop.paste_cancel': { zh: '取消', en: 'Cancel' },
  'multistop.paste_empty': { zh: '沒有解析到任何有效座標。', en: 'No valid coordinates were found.' },
  'multistop.gpx_import_failed': { zh: 'GPX 匯入失敗，請確認檔案格式。', en: 'Failed to import GPX file.' },
  'multistop.gpx_no_points': { zh: 'GPX 檔案裡沒有可用的座標點。', en: 'The GPX file has no usable points.' },
  'multistop.import_partial': { zh: '已匯入，部分行數無法解析。', en: 'Imported, but some lines could not be parsed.' },

  // Context menu
  'contextmenu.teleport': { zh: '⚡ 瞬移至此點 (Teleport)', en: '⚡ Teleport to point' },
  'contextmenu.copy_coords': { zh: '📋 複製經緯度 (Copy)', en: '📋 Copy coordinates' },
  'contextmenu.delete_waypoint': { zh: '🗑️ 刪除此點位 (Remove)', en: '🗑️ Remove waypoint' },
  'contextmenu.set_start': { zh: '📍 設為路線起點', en: '📍 Set as start point' },
  'contextmenu.add_wp_here': { zh: '➕ 在此處新增路徑點', en: '➕ Add waypoint here' },
  'contextmenu.select_circle_center': { zh: '🎯 設為圓形路徑中心點', en: '🎯 Set as circle center' },
  'contextmenu.set_target': { zh: '🎯 設為目標點', en: '🎯 Set as target point' },
  'contextmenu.set_end': { zh: '🏁 設為導航終點', en: '🏁 Set as destination' },
  'contextmenu.set_random_center': { zh: '🎯 設為隨機漫步中心', en: '🎯 Set as random-walk center' },
  'contextmenu.set_joystick_anchor': { zh: '🎮 設為搖桿起點', en: '🎮 Set as joystick anchor' },
  'contextmenu.teleport_here': { zh: '⚡ 瞬移裝置至此', en: '⚡ Teleport device here' },
  'contextmenu.copy_coords_short': { zh: '📋 複製座標', en: '📋 Copy coordinates' },

  // Toast
  'toast.copied_coords': { zh: '已複製經緯度至剪貼簿 📋', en: 'Coordinates copied to clipboard 📋' },

  // Confirm dialogs
  'confirm.clear_all_title': { zh: '確認清空所有點位？', en: 'Clear all waypoints?' },
  'confirm.clear_all_desc': { zh: '此操作將清除目前設定的所有路徑點，無法復原。', en: 'This will clear all current waypoints. This action cannot be undone.' },
  'confirm.gpx_overwrite_title': { zh: '匯入 GPX 並覆蓋現有路線？', en: 'Overwrite current route with GPX?' },
  'confirm.gpx_overwrite_desc': { zh: '匯入 GPX 檔案將會替換現有的所有路徑點。', en: 'Importing a GPX file will replace all existing waypoints.' },
  'confirm.paste_overwrite_title': { zh: '貼上並覆蓋現有路線？', en: 'Overwrite current route with pasted coordinates?' },
  'confirm.paste_overwrite_desc': { zh: '套用貼上座標將會替換現有的所有路徑點。', en: 'Applying pasted coordinates will replace all existing waypoints.' },
  'confirm.confirm': { zh: '確認', en: 'Confirm' },
  'confirm.cancel': { zh: '取消', en: 'Cancel' },

  // Random walk panel
  'randomwalk.title': { zh: '隨機漫遊', en: 'Random Walk' },
  'randomwalk.description': {
    zh: '在半徑範圍內隨機漫遊，直到停止。',
    en: 'Wander to random points within a radius until stopped.',
  },
  'randomwalk.status.wandering': { zh: '漫遊中…', en: 'Wandering…' },
  'randomwalk.status.failed_start': { zh: '隨機漫遊啟動失敗。', en: 'Failed to start random walk.' },
  'randomwalk.status.failed_stop': { zh: '隨機漫遊停止失敗。', en: 'Failed to stop random walk.' },
  'randomwalk.status.failed_update': { zh: '隨機漫遊更新失敗。', en: 'Failed to update random walk.' },

  // Joystick panel
  'joystick.title': { zh: '搖桿', en: 'Joystick' },
  'joystick.description': {
    zh: '用 WASD 或畫面上的搖桿即時自由移動裝置。',
    en: 'Move the device freely in real time using WASD or an on-screen pad.',
  },
  'joystick.hint.need_anchor': {
    zh: '請先在地圖上選一個點，或先瞬移一次來設定起始位置。',
    en: 'Pick a point on the map or teleport once first, to anchor a starting position.',
  },
  'joystick.status.active': {
    zh: '搖桿已啟動 — 拖曳搖桿或使用 WASD/方向鍵。',
    en: 'Joystick active — drag the pad or use WASD/arrow keys.',
  },
  'joystick.status.failed_start': { zh: '搖桿啟動失敗。', en: 'Failed to start joystick.' },
  'joystick.status.failed_stop': { zh: '搖桿停止失敗。', en: 'Failed to stop joystick.' },
  'joystick.tab.basic': { zh: '固定速度', en: 'Fixed Speed' },
  'joystick.tab.dynamic': { zh: '動態模式', en: 'Dynamic Mode' },
  'joystick.dynamic.speed_range': { zh: '搖桿速度範圍', en: 'Joystick Speed Range' },
  'joystick.dynamic.description': {
    zh: '從中心的 0 km/h 開始，搖桿拉得越遠速度越快，拉至邊緣達到最高速度。',
    en: 'Speed starts at 0 km/h in the center and increases with stick distance, reaching maximum speed at the edge.',
  },
  'joystick.dynamic.toggle': { zh: '啟用動態變速模式', en: 'Enable Dynamic Speed' },
  'joystick.dynamic.curve_mode': { zh: '響應曲線模式', en: 'Response Curve' },
  'joystick.dynamic.curve.power': { zh: '指數曲線 (Power Curve)', en: 'Power Curve' },
  'joystick.dynamic.curve.progressive': { zh: '分段檔位 (Progressive Multi-Tier)', en: 'Progressive Multi-Tier' },
  'joystick.dynamic.exponent': { zh: '曲線指數 (p)', en: 'Exponent (p)' },
  'joystick.dynamic.keyboard_ramp': { zh: '鍵盤按住漸進加速', en: 'Keyboard Hold-to-Accelerate' },

  // Command Palette & HUD
  'cmdpalette.title': { zh: '快速指令 / 搜尋', en: 'Command Palette' },
  'cmdpalette.placeholder': { zh: '搜尋導航模式、地點、指令… (Cmd+K)', en: 'Search modes, locations, actions… (Cmd+K)' },
  'cmdpalette.no_results': { zh: '找不到符合的項目。', en: 'No matching items found.' },
  'cmdpalette.searching': { zh: '搜尋地點中…', en: 'Searching places…' },
  'cmdpalette.section.modes': { zh: '導航模式', en: 'Navigation Modes' },
  'cmdpalette.section.actions': { zh: '動作與快捷鍵', en: 'Actions & Shortcuts' },
  'cmdpalette.section.favorites': { zh: '最愛地點', en: 'Favorites' },
  'cmdpalette.section.history': { zh: '歷史記錄', en: 'History' },
  'cmdpalette.section.places': { zh: '搜尋地點結果', en: 'Place Search Results' },
  'statusbar.copied': { zh: '已複製座標！', en: 'Coordinates copied!' },

  // New Buttons & Preflight Labels
  'teleport.action.paste': { zh: '貼上剪貼簿', en: 'Paste' },
  'teleport.action.my_location': { zh: '帶入當前點', en: 'My Location' },
  'navigate.distance': { zh: '預估距離', en: 'Distance' },
  'navigate.est_time': { zh: '預估時間', en: 'Est. Time' },
  'navigate.minutes': { zh: '分', en: 'min' },
  'routeloop.action.reverse': { zh: '翻轉路線', en: 'Reverse Path' },
  'multistop.action.clear_all': { zh: '全清點位', en: 'Clear All' },
  'joystick.action.start': { zh: '啟動搖桿', en: 'Start Joystick' },
  'joystick.action.stop': { zh: '停止搖桿', en: 'Stop Joystick' },
  'topbar.search': { zh: '搜尋…', en: 'Search…' },
  'hud.current_leg': { zh: '當前航段', en: 'Current Leg' },
  'topbar.sponsor': { zh: '支持開發者', en: 'Support the Developer' },
  'sponsor.title': { zh: '支持開發者 ❤️', en: 'Support the Developer ❤️' },
  'sponsor.description': {
    zh: '如果 ArcWayfarer 對你有幫助，歡迎請作者喝杯咖啡！你的支持是持續開發的動力。',
    en: 'If ArcWayfarer has been useful to you, consider buying the author a coffee! Your support keeps development going.',
  },
  'sponsor.cta_tw': { zh: '信用卡贊助（台灣 & 海外）', en: 'Support via Credit Card (Taiwan & Worldwide)' },
  'sponsor.cta_intl': { zh: '海外用戶贊助（Ko-fi）', en: 'Support via Ko-fi (International)' },
  'sponsor.close': { zh: '關閉', en: 'Close' },
} as const satisfies Record<string, Record<Lang, string>>

export type StringKey = keyof typeof STRINGS
