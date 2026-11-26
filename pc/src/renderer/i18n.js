(function () {
  'use strict';

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const SKIP = [
    'script', 'style', '#langSeg', '[data-no-i18n]',
    '.txt', '.dText', '.noticeBody', '.noticeViewBody',
    '.avatar', '.bigAvatar', '.logoMark', '.brandName', '.nm'
  ].join(',');

  const EN = {
    /* 主界面 */
    '打开团队与成员': 'Open team & members',
    '我的任务': 'My Tasks',
    '创建 / 加入团队': 'Create / join a team',
    '固定在桌面最上层': 'Always on top',
    '最小化': 'Minimize',
    '关闭': 'Close',
    '团队通知': 'Team notices',
    '邀请同事加入这个团队': 'Invite teammates to this team',
    '🔗 邀请': '🔗 Invite',
    '＋ 发通知': '+ Post notice',
    '✎ 修改通知': '✎ Edit notice',
    '已完成': 'Completed',
    '这条任务发布到哪里': 'Where this task is posted',
    '发布到：个人': 'To: Personal',
    '发布给谁：全员 / 按角色 / 部分成员': 'Audience: everyone / roles / selected members',
    '👥 全员': '👥 Everyone',
    '🕒 截止 / 提醒': '🕒 Due / Remind',
    '新增任务': 'Add task',
    '添加网页链接': 'Add web link',
    '编辑网页链接': 'Edit web link',
    '添加本地路径': 'Add local path',
    '编辑本地路径': 'Edit local path',
    '网页链接': 'Web link',
    '本地路径': 'Local path',
    '任务链接': 'Task link',
    '未添加链接': 'No link added',
    '填写完整网址，发布后点任务上的地球图标打开': 'Enter a full URL. Click the globe icon on the task to open it.',
    '填写本机完整路径，发布后点任务上的电脑图标打开': 'Enter a full local path. Click the computer icon on the task to open it.',
    '/Users/.../文件或文件夹': '/Users/.../file or folder',
    'C:\\Users\\...\\文件或文件夹': 'C:\\Users\\...\\file or folder',
    '发布后点任务上的地球图标打开': 'Click the globe icon on the task to open',
    '清除': 'Clear',
    '清除链接': 'Clear link',
    '保存链接': 'Save link',
    '已清除链接': 'Link cleared',
    '只能填 http / https 网址': 'Only http / https URLs are allowed',
    '请填写完整路径': 'Enter a full path',
    '已添加网页链接': 'Web link added',
    '已添加本地路径': 'Local path added',
    '当前版本不支持打开本地路径': 'This version cannot open local paths',
    '打开路径失败': 'Could not open path',
    '打开本地路径': 'Open local path',
    '还没有团队通知。': 'No team notices yet.',
    '标记完成': 'Mark complete',
    '双击改内容': 'Double-click to edit',
    '只有任务发起人或管理员能改内容': 'Only the creator or an admin can edit',
    '截止时间，点一下可以改': 'Due time. Click to edit',
    '提醒设置，点一下可以改': 'Reminder. Click to edit',
    '指派给谁': 'Assign to',
    '指派': 'Assign',
    '未指派': 'Unassigned',
    '删除这条已完成记录': 'Delete this completed record',
    '关闭这条任务（记录会留在已完成）': 'Close this task (record stays in Completed)',
    '取消置顶': 'Unpin',
    '置顶到最前面': 'Pin to top',
    '任务已关闭，记录保留': 'Task closed. Record kept.',
    '双击恢复成未完成': 'Double-click to restore',
    '发起人或管理员关闭了这条任务，记录不会删除': 'Closed by the creator or an admin. The record is kept.',
    '在浏览器打开': 'Open in browser',
    '这条任务的发布范围': 'Audience for this task',
    '📌 置顶': '📌 Pinned',
    '置顶任务': 'Pinned task',
    '置顶': 'Pin',
    '已关闭': 'Closed',
    '完成': 'Done',
    '自己的任务': 'Personal task',
    '自己的任务清单，只在本机': 'Personal task list, on this device only',
    '我创建的团队': 'Team I created',
    '我加入的团队': 'Team I joined',
    '创建者': 'Owner',
    '管理员': 'Admin',
    '成员': 'Member',
    '在线': 'Online',
    '离线': 'Offline',
    '我': 'Me',
    '（我）': ' (me)',
    '还没有角色标签。先在团队面板给成员设置「角色标签」，再来按角色发布。': 'No role tags yet. Set role tags in the team panel first, then post by role.',
    '全员：团队里每个人都能看到这条任务。': 'Everyone: all team members can see this task.',
    '这条任务只发给': 'This task is sent to ',
    '这个团队还没有待办': 'No tasks in this team yet',
    '所有团队都没有待办了': 'All teams are caught up',
    '还没有任务': 'No tasks yet',
    '在下面写一条，Ctrl+Enter 发布': 'Write one below and press Ctrl+Enter to post',
    '没搜到相关任务': 'No matching tasks',
    '还没有已完成的任务': 'No completed tasks yet',
    '同网段暂时没扫到别的团队': 'No other teams found on this network yet',
    '等待创建者同意…': 'Waiting for the owner to approve…',

    /* 首次起名 */
    '先起个名字': 'Choose a name',
    '同事看到的就是这个头像和名字，之后也能改': 'This avatar and name are visible to teammates. You can change them later.',
    '我的名字': 'My name',
    '比如：小李': 'e.g. Alex',
    '进入': 'Continue',
    '进入后点右上角 ＋ 创建团队或申请加入，也可以先只记自己的任务。': 'After entering, tap + at top right to create or join a team, or just keep personal tasks.',

    /* 团队与设置 */
    '团队与设置': 'Teams & Settings',
    '我的资料': 'My profile',
    '名字': 'Name',
    '保存': 'Save',
    '修改团队名': 'Rename team',
    '团队名不能为空': 'Team name cannot be empty',
    '修改团队名失败': 'Could not rename team',
    '团队名已修改': 'Team name updated',
    '外观': 'Appearance',
    '深色': 'Dark',
    '浅色': 'Light',
    '跟随系统': 'System',
    '字号': 'Text size',
    '小': 'Small',
    '中': 'Medium',
    '大': 'Large',
    '语言': 'Language',
    '桌面行为': 'Desktop behavior',
    '开机自动启动': 'Launch at login',
    '新任务系统通知': 'New-task system notifications',
    '截止 / 提醒通知': 'Due / reminder notifications',
    '系统通知只在应用运行（含收到托盘）时有效。首次加入或第一次同步团队时只提示一条汇总，不会把历史任务逐条弹出来。': 'System notifications work while the app is running, including in the tray. The first join or first team sync shows one summary instead of notifying every past task.',
    '鼠标移开便签会收成只显示任务的小条，移回来展开。点右上角 ✕ 是收到托盘（不是退出），右键托盘图标可以退出。': 'Move the pointer away and the note collapses to a task strip; move back to expand. The top-right ✕ sends it to the tray, not quit. Right-click the tray icon to quit.',
    '数据与备份': 'Data & backup',
    '导出备份': 'Export backup',
    '导入备份': 'Import backup',
    '导出会包含团队、任务、设置和登录令牌，请妥善保管。自动备份保存在数据目录的 backups 文件夹，最近 7 天保留。': 'The export includes teams, tasks, settings and access tokens, so keep it safe. Auto backups stay in the backups folder of the data directory for the last 7 days.',
    '导入会覆盖当前所有数据并自动重启；导入前会先保留一份当前备份。': 'Import replaces all current data and restarts the app. A safety backup is created first.',
    '导入会覆盖当前所有团队、任务和设置，并自动重启。导入前会先保留一份当前数据备份。继续？': 'Import replaces all teams, tasks and settings, then restarts the app. A safety backup is created first. Continue?',
    '继续导入': 'Import anyway',
    '备份已导出': 'Backup exported',
    '导入成功，正在重启…': 'Imported. Restarting…',
    '导出失败': 'Export failed',
    '导入失败': 'Import failed',
    '不是有效的 TDLVV 备份文件': 'Not a valid TDLVV backup file',
    '备份文件太大': 'The backup file is too large',
    '读取备份文件失败': 'Could not read the backup file',
    '备份里没有个人清单': 'The backup has no personal task list',
    '当前数据备份失败，已取消导入': 'Could not back up current data; import cancelled',
    '写入备份数据失败，当前数据未被替换': 'Could not write the imported data; current data was left unchanged',
    '备份文件内容为空': 'The backup file is empty',
    '备份里没有团队数据': 'The backup has no team data',
    '团队数据缺少 id': 'Team data is missing an id',
    '团队类型无效': 'Invalid team type',
    '团队状态不完整': 'Incomplete team state',
    '数据文件损坏，已从最近自动备份恢复': 'The data file was damaged; restored from the latest auto backup',
    '数据文件损坏，且没有可用的自动备份': 'The data file is damaged and no auto backup is available',
    '我的团队': 'My teams',
    '创建新团队': 'Create a new team',
    '团队 / 清单名字': 'Team / list name',
    '创建': 'Create',
    '文件存放位置（创建者电脑）': 'File location (on host computer)',
    '文件存放位置': 'File location',
    '默认目录': 'Default folder',
    '选择': 'Choose',
    '修改位置': 'Change location',
    '打开文件夹': 'Open folder',
    '我的文件副本': 'My file copy',
    '上传文件': 'Upload file',
    '提交我的文件': 'Submit my file',
    '提交当前文件': 'Submit this file',
    '提交选择的文件': 'Submit selected file',
    '换一个文件': 'Choose another file',
    '可以直接提交你刚编辑的这一版；也可以换一个文件。提交只更新你的副本，不会覆盖创建者原文件。': 'Submit the version you just edited, or choose another file. This only updates your own copy and never overwrites the creator original.',
    '点文件名可以先打开看内容；提交时默认就是这一版。': 'Click the file name to check the content first. The submit uses this version by default.',
    '已提交你的文件，你的部分记为 100%': 'Your file was submitted. Your part is marked 100%.',
    '先选择一个文件': 'Choose a file first',
    '只有任务发起人或管理员能指派任务': 'Only the task creator or an admin can assign it',
    '指派对象不存在': 'That member does not exist',
    '这个成员看不到这条任务': 'That member cannot see this task',
    '保存我的副本': 'Save my copy',
    '更新我的副本': 'Update my copy',
    '更换原文件': 'Replace original file',
    '默认放在 TDLVV 的 task-files 目录；也可以选 NAS、共享盘或已同步的云盘文件夹。': 'The default is the task-files folder inside TDLVV. You can also choose a NAS, shared drive, or a locally synced cloud folder.',
    '用邀请码申请加入': 'Join with an invite code',
    '6 位邀请码': '6-digit invite code',
    '申请加入': 'Request to join',
    '找不到？填创建者给的地址（可留空）': 'Cannot find it? Enter the host address (optional)',
    '第二台电脑 / 手机设备登录': 'Second computer / phone login',
    '粘贴创建者发的设备登录链接': 'Paste the device login link from the host',
    '第二台电脑用同一成员身份登录时，粘贴创建者生成的链接；手机直接打开同一个链接即可，只查看当前任务和发布任务。': 'On a second computer, paste the link generated by the host to sign in as the same member. On a phone, open the same link to view current tasks and publish tasks only.',
    '手机 / 第二台设备': 'Phone / second device',
    '生成登录链接': 'Generate login link',
    '还没有生成登录链接': 'No login link yet',
    '复制链接': 'Copy link',
    '登录': 'Log in',
    '重置': 'Reset',
    '每个成员一个长期设备码；只有创建者能查看、编辑、重置。设备码登录的是这位成员本人，不会新增成员。': 'Each member has one long-term device code. Only the creator can view, edit, or reset it. The code signs in as that member and does not create a new member.',
    '设备码长期有效；只有创建者能看和改，重置后旧码立即失效。': 'The device code does not expire. Only the creator can view or edit it; resetting invalidates the old code immediately.',
    '同一网络里的团队': 'Teams on this network',
    '发现不等于加入：点「申请加入」还是会先向创建者发申请，同意后才进来。': 'Finding a team does not join it. A request still needs the owner to approve.',
    '邀请码': 'Invite code',
    '复制邀请码': 'Copy invite code',
    '重新生成': 'Regenerate',
    '加入申请': 'Join requests',
    '退出这个团队': 'Leave this team',
    '退出并解散这个团队': 'Leave and dissolve this team',
    '邀请同事加入': 'Invite teammates',
    '查看任务数量': 'View task counts',
    '目前待办': 'Open now',
    '本团队待完成': 'Open in this team',
    '只统计未完成和未关闭': 'Unfinished and unclosed only',
    '等待成员客户端上报': 'Waiting for the member’s client',
    '只同步待办数量，不同步任务内容；打开面板会拉取最新数据。': 'Only open counts are synced, not task content. Opening the panel pulls the latest data.',
    '成员进度': 'Member progress',
    '未完成': 'Open',
    '未上报': 'Not reported',
    '暂无任务': 'No tasks',
    '人': 'people',
    '总任务': 'Total tasks',
    '所有团队合计': 'Across all teams',
    '本团队任务': 'Team tasks',
    '待办': 'Open',
    '已完成/关闭': 'Done/closed',
    '对方客户端尚未上报': 'Not reported yet',
    '总任务由成员自己的客户端汇总所有团队后上报；这里只同步数量，不同步任务内容。': 'Totals are reported by the member’s own client across all teams. Only counts are synced, not task content.',
    '把邀请码发给同事，对方填码申请，你同意后就进来。': 'Send this code to a teammate. They request to join, and you approve.',
    '不要求在同一网络：对方在家、你在公司，只要填这个码就能申请。': 'No need to be on the same network. They can request from anywhere with this code.',
    '自己的清单只有你一个人。': 'Your personal list has only you.',
    '点名字下面的虚线框可以加备注；点名字旁的「＋角色」可以给自己和成员设角色标签；创建者可以任命管理员、移交团队。': 'Click the dashed box under a name to add a note. Click + Role to set role tags. The creator can appoint admins and transfer the team.',
    '成员信息由创建者维护。': 'Member info is managed by the creator.',
    '同意': 'Approve',
    '拒绝': 'Decline',
    '＋角色': '+ Role',
    '角色标签，如 设计': 'Role tag, e.g. Design',
    '角色标签': 'Role tag',
    '设置角色标签（发布任务时可按角色发）': 'Set a role tag (used for posting by role)',
    '加备注，比如 市场部-小李': 'Add a note, e.g. Marketing - Alex',
    '设为管理员': 'Make admin',
    '取消管理员': 'Remove admin',
    '移交': 'Transfer',
    '把创建者身份交给 TA': 'Transfer ownership to this member',
    '移除': 'Remove',
    '公网通道已开': 'Public channel is on',
    '公网通道启动中…': 'Public channel starting…',
    '公网通道未就绪': 'Public channel not ready',
    '暂时连不上创建者': 'Cannot reach the creator right now.',
    '已连上创建者': 'Connected to the creator',
    '约半分钟；这期间同网段仍可申请。': 'About 30 seconds. Local-network requests still work.',
    '现在只有同网段能申请。': 'Only local-network requests work right now.',
    '好，不同网络的同事也能加入。': 'Teammates on other networks can join.',
    '会一直自动重连，期间只显示本地缓存。': 'Reconnecting automatically; local cache is shown meanwhile.',
    '任务修改实时同步。': 'Task changes sync in real time.',

    /* 已完成 */
    '搜任务内容、人名、团队': 'Search tasks, people, teams',
    '按完成时间倒序；双击已完成的一条可以恢复成未完成。标着「已关闭」的由发起人或管理员关掉，只留记录、不能恢复；发起人双击可彻底删除这条记录。': 'Newest first. Double-click a completed item to restore it. Closed items were closed by the creator or an admin; they are records only. The creator can double-click to delete them permanently.',

    /* 通知 */
    '发团队通知': 'Post team notice',
    '修改团队通知': 'Edit team notice',
    '通知内容（网页链接会自动变成可点链接）': 'Notice (web links become clickable)',
    '比如：下周一投放口径调整，细则见 https://example.com/doc': 'e.g. Campaign rules change next Monday. Details: https://example.com/doc',
    '发出': 'Post',
    '保存修改': 'Save changes',
    '只有创建者和管理员能发；通知只在这个团队的界面出现，个人清单里看不到，成员同步后都能看到。': 'Only the creator and admins can post. Notices appear only in this team and are visible to all members after sync.',
    '删除这条通知': 'Delete this notice',

    /* 截止 / 提醒 */
    '截止时间与提醒': 'Due time and reminder',
    '截止时间（可留空）': 'Due time (optional)',
    '不设截止时间': 'No due time',
    '提前提醒': 'Remind early',
    '不提醒': 'No reminder',
    '滚动选 1–48 小时…': 'Scroll to choose 1–48 hours…',
    '选择截止时间': 'Select due time',
    '返回': 'Back',
    '确定': 'OK',
    '确认': 'Confirm',
    '时': 'Hour',
    '分': 'Minute',
    '删除任务？': 'Delete task?',
    '关闭任务？': 'Close task?',
    '删除已完成记录？': 'Delete completed record?',
    '重新生成邀请码？': 'Regenerate invite code?',
    '移交创建者？': 'Transfer ownership?',
    '移出成员？': 'Remove member?',
    '移出': 'Remove',
    '退出并解散团队？': 'Exit and dissolve team?',
    '退出并解散': 'Exit and dissolve',
    '退出这个团队？': 'Leave this team?',
    '退出': 'Leave',

    /* 申请等待 */
    '已提交加入申请': 'Join request sent',
    '创建者会在他的 App 里看到你的头像和名字，同意后自动进入。': 'The owner will see your avatar and name. You join automatically after approval.',
    '取消申请': 'Cancel request',

    /* 状态与提示 */
    '今天': 'Today',
    '明天': 'Tomorrow',
    '昨天': 'Yesterday',
    '已设置开机自动启动': 'Launch at login enabled',
    '已关闭开机自动启动': 'Launch at login disabled',
    '已开启新任务系统通知': 'New-task notifications enabled',
    '已关闭新任务系统通知': 'New-task notifications disabled',
    '已开启截止 / 提醒通知': 'Due / reminder notifications enabled',
    '已关闭截止 / 提醒通知': 'Due / reminder notifications disabled',
    '通知设置保存失败': 'Could not save notification settings',
    '邀请码已复制': 'Invite code copied',
    '重新生成后旧邀请码立即失效，已加入的成员不受影响。继续？': 'The old code stops working immediately. Existing members are unaffected. Continue?',
    '已生成新的邀请码': 'New invite code generated',
    '先写点通知内容': 'Write something first',
    '个人清单不发团队通知': 'Personal lists cannot post team notices',
    '已保存': 'Saved',
    '创建失败': 'Could not create',
    '已取消申请': 'Request canceled',
    '退出失败': 'Could not leave',
    '已退出，任务已转存到「我的任务」': 'Left the team. Tasks were moved to My Tasks.',
    '操作失败': 'Action failed',
    '设置失败': 'Could not save setting',
    '只有任务发起人或管理员能改截止与提醒': 'Only the creator or an admin can change the due time and reminder',
    '只有任务发起人（或管理员）能关闭这条任务': 'Only the creator (or an admin) can close this task',
    '只有任务发起人（或管理员）能改任务内容': 'Only the creator (or an admin) can edit this task',
    '从已完成记录里彻底删掉这条？': 'Delete this from Completed permanently?',
    '删除这条任务？': 'Delete this task?',
    '关闭这条任务？团队里的人会在「已完成」里看到它，并标着「已关闭」。': 'Close this task? Teammates will see it in Completed marked Closed.',
    '先创建或加入一个团队': 'Create or join a team first',
    '当前离线，连上创建者后再加': 'Offline. Connect to the creator first.',
    '正在找…': 'Searching…',
    '加入失败': 'Could not join',
    '这条任务已被关闭，记录保留在这里': 'This task is closed. The record stays here.',
    '彻底删除这条「已关闭」记录？删了就不在已完成里了。': 'Delete this Closed record? It will disappear from Completed.',
    '等待': 'Waiting for',
    '同意你加入': 'to approve your request to join',
    '团队': 'team',
    '还没': 'No',
    '还没有': 'No',
    '收起': 'Collapse',
    '展开': 'Expand',
    '取消': 'Cancel',
    '任务模板': 'Task templates',
    '模板里的每一行是一个字段名和默认值；发布任务时可以调用，之后再改。': 'Each row is a field name and default value. Use it when posting, then edit as needed.',
    '模板名称': 'Template name',
    '比如：客户需求 / 设计交付': 'e.g. Client request / Design delivery',
    '＋ 新增一行字段': '+ Add a field',
    '已保存模板': 'Saved templates',
    '＋ 新建模板': '+ New template',
    '＋ 模板': '+ Template',
    '本机地址：': 'Local address: ',
    '现在只有同网段能申请。': 'Only devices on the same network can request to join right now.',
    '这是创建者电脑上的路径。修改后可以复制全部文件到新位置；NAS、共享盘或云盘请先确保这台电脑能正常读写。': 'This path lives on the owner’s computer. Changing it can move every file to the new location; for NAS, shared drives or cloud folders, make sure this computer can read and write there first.',
    '任务详情 · 创建者/管理员': 'Task detail · Owner / admin',
    '任务详情 · 成员': 'Task detail · Member',
    '编辑任务': 'Edit task',
    '任务进度（拖到 100% 并保存即完成）': 'Progress (drag to 100% and save to complete)',
    '任务总进度': 'Overall progress',
    '我的进度': 'My progress',
    '总进度': 'Overall',
    '任务内容（可以多行，保存后按原样显示）': 'Task text (multiple lines allowed, saved as written)',
    '任务文件': 'Task file',
    '还没有任务文件': 'No task file yet',
    '打开 / 编辑': 'Open / edit',
    '上传文件': 'Upload file',
    '上传新版本': 'Upload new version',
    '保存我的副本': 'Save my copy',
    '更换原文件': 'Replace original',
    '更新我的副本': 'Update my copy',
    '可以把桌面或微信里的文件拖进来，或点按钮选择文件。': 'Drag a file in from the desktop or WeChat, or click the button to pick one.',
    '总进度按这条任务的指派对象平均计算；成员可自己推进度。': 'Overall progress averages the assignees; each member advances their own.',
    '这条任务还没有明确的指派对象。': 'No assignees on this task yet.',
    '你可以拖动自己的进度；任务内容由创建者或管理员修改。': 'You can drag your own progress; the task text is edited by the owner or an admin.',
    '拖到 100% 再点保存，这条任务会直接进入已完成。': 'Drag to 100% and save — the task moves straight to Completed.',
    '完成并提交给创建者': 'Complete and submit',
    '模板字段': 'Template fields',
    '当前使用模板，点击更换或编辑': 'Using a template — click to change or edit',
    '调用或新建任务模板': 'Use or create a task template',
    '还没有保存过模板': 'No saved templates yet',
    '调用': 'Use',
    '编辑': 'Edit',
    '删除': 'Delete',
    '保存模板': 'Save template',
    '新建一个任务模板': 'Create a new task template',
    '最多保存 5 个模板，先删除一个': 'You can save up to 5 templates. Delete one first.',
    '最多保存 5 个模板，先删除一个再新建': 'You can save up to 5 templates. Delete one before creating another.',
    '已经有同名模板，换个名字': 'A template with this name already exists. Choose another name.',
    '通知已清空': 'Notice cleared',
    '加入': 'Join',
    '角色': 'Role',
    '全员': 'Everyone',
    '按角色': 'By role',
    '部分成员': 'Selected members'
  };

  const RULES = [
    [/^发布到：团队 · (.+)$/, (m) => `To: Team · ${m[1]}`],
    [/^(.+) · 通知$/, (m) => `${m[1]} · Notices`],
    [/^(.+) · (.+) · 已修改$/, (m) => `${m[1]} · ${m[2]} · Edited`],
    [/^(.+) · 已修改$/, (m) => `${m[1]} · Edited`],
    [/^(.+) 置顶$/, (m) => `Pinned by ${m[1]}`],
    [/^(.+) · 已加入$/, (m) => `${m[1]} joined`],
    [/^邀请加入「(.+)」$/, (m) => `Invite people to “${m[1]}”`],
    [/^按角色：(.+)$/, (m) => `Roles: ${m[1]}`],
    [/^角色 (.+)$/, (m) => `Roles ${m[1]}`],
    [/^部分 (\d+) 人$/, (m) => `${m[1]} ${m[1] === '1' ? 'person' : 'people'}`],
    [/^ · (创建者|管理员|成员) · (\d+) 人$/, (m) => ` · ${roleEn(m[1])} · ${m[2]} ${m[2] === '1' ? 'member' : 'members'}`],
    [/^(创建者|管理员|成员) · (\d+) 人$/, (m) => `${roleEn(m[1])} · ${m[2]} ${m[2] === '1' ? 'member' : 'members'}`],
    [/^(\d+) 个申请$/, (m) => `${m[1]} request${m[1] === '1' ? '' : 's'}`],
    [/^(\d+) 月 (\d+) 日(.*)$/, (m) => `${MONTHS[Number(m[1]) - 1] || m[1]} ${m[2]}${m[3] || ''}`],
    [/^今天(?: (.+))?$/, (m) => `Today${m[1] ? ` ${m[1]}` : ''}`],
    [/^明天(?: (.+))?$/, (m) => `Tomorrow${m[1] ? ` ${m[1]}` : ''}`],
    [/^昨天(?: (.+))?$/, (m) => `Yesterday${m[1] ? ` ${m[1]}` : ''}`],
    [/^(\d{2})-(\d{2}) (.+)$/, (m) => `${m[1]}/${m[2]} ${m[3]}`],
    [/^(\d+) 小时$/, (m) => `${m[1]} h`],
    [/^提前 (\d+) 小时提醒$/, (m) => `Remind ${m[1]} h before`],
    [/^提前 (\d+) 小时提醒（从现在算）$/, (m) => `Remind in ${m[1]} h`],
    [/^🔔提前(\d+)h$/, (m) => `🔔${m[1]}h before`],
    [/^🕒 提前(\d+)h$/, (m) => `🕒 ${m[1]}h before`],
    [/^来自「(.+)」$/, (m) => `From “${m[1]}”`],
    [/^来自「(.+)」·已退出$/, (m) => `From “${m[1]}” · left`],
    [/^我加入的团队 · (创建者|管理员|成员) · (\d+) 人(?: ·)?$/, (m) => `Team I joined · ${roleEn(m[1])} · ${m[2]} ${m[2] === '1' ? 'member' : 'members'}`],
    [/^我创建的团队 · (创建者|管理员|成员) · (\d+) 人(?: ·)?$/, (m) => `Team I created · ${roleEn(m[1])} · ${m[2]} ${m[2] === '1' ? 'member' : 'members'}`],
    [/^自己的任务清单，只在本机 · (创建者|管理员|成员) · (\d+) 人(?: ·)?$/, (m) => `Personal task list · ${roleEn(m[1])} · ${m[2]} ${m[2] === '1' ? 'member' : 'members'}`],
    [/^👥 按角色：(.+)$/, (m) => `👥 Roles: ${m[1]}`],
    [/^👥 部分 (\d+) 人$/, (m) => `👥 ${m[1]} ${m[1] === '1' ? 'person' : 'people'}`],
    [/^来自自己$/, () => 'From me'],
    [/^等待 (.+) 同意你加入「(.+)」…$/, (m) => `Waiting for ${m[1]} to approve your request to join “${m[2]}”…`],
    [/^把团队「(.+)」的创建者身份移交给「(.+)」？你会变成管理员。$/, (m) => `Transfer ownership of “${m[1]}” to “${m[2]}”? You become an admin.`],
    [/^把「(.+)」移出团队？对方会立刻失去访问权限。$/, (m) => `Remove “${m[1]}” from the team? They lose access immediately.`],
    [/^退出会解散「(.+)」：同事将连不上这个团队。已接收 \/ 已完成的任务会转存到「我的任务」里，可以手动删。继续？$/, (m) => `Leaving dissolves “${m[1]}”; teammates lose access. Received and completed tasks move to My Tasks, where you can delete them. Continue?`],
    [/^退出「(.+)」？已接收和已完成的任务会转存到「我的任务」里（不会自动删除），可以手动删。$/, (m) => `Leave “${m[1]}”? Received and completed tasks move to My Tasks; nothing is deleted automatically.`],
    [/^公网地址：(.+)$/, (m) => `Public address: ${m[1]}`],
    [/^本机地址：(.+)$/, (m) => `Local address: ${m[1]}`],
    [/^备注：(.+)$/, (m) => `Note: ${m[1]}`],
    [/^有效时间 (.+)$/, (m) => `Valid for ${m[1]}`],
    [/^(.*)（创建者）$/, (m) => `${m[1]} (owner)`],
    [/^(.*)（管理员）$/, (m) => `${m[1]} (admin)`]

  ];

  function roleEn(role) {
    return role === '创建者' ? 'Owner' : role === '管理员' ? 'Admin' : 'Member';
  }

  let lang = 'zh';
  let observer = null;
  let scheduled = false;
  let applying = false;

  function coreEn(core, node) {
    if (core === '成员' && node && node.parentElement && node.parentElement.closest('h3')) return 'Members';
    if (EN[core]) return EN[core];
    for (let i = 0; i < RULES.length; i++) {
      const m = core.match(RULES[i][0]);
      if (m) return RULES[i][1](m);
    }
    return core;
  }

  function translate(value, node) {
    if (!value || !/[\u4e00-\u9fff]/.test(value)) return value;
    const lead = (value.match(/^\s*/) || [''])[0];
    const trail = (value.match(/\s*$/) || [''])[0];
    const core = value.slice(lead.length, value.length - trail.length);
    if (!core) return value;
    const en = coreEn(core, node);
    return en === core ? value : lead + en + trail;
  }

  function skip(node) {
    const p = node && node.nodeType === 1 ? node : node && node.parentElement;
    return !p || !p.closest || !!p.closest(SKIP);
  }

  function textNodes(root) {
    const list = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || skip(n)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) list.push(walker.currentNode);
    return list;
  }

  function applyText(node) {
    if (lang === 'zh') {
      if (node.__tdlvvZh !== undefined) {
        if (node.nodeValue !== node.__tdlvvZh) node.nodeValue = node.__tdlvvZh;
        node.__tdlvvEn = undefined;
      }
      return;
    }
    if (node.__tdlvvEn === undefined || node.nodeValue !== node.__tdlvvEn) {
      node.__tdlvvZh = node.nodeValue;
    }
    const en = translate(node.__tdlvvZh, node);
    node.__tdlvvEn = en;
    if (node.nodeValue !== en) node.nodeValue = en;
  }

  function attrKeys(el) {
    return ['title', 'placeholder'];
  }

  function applyAttrs(el) {
    const zh = el.__tdlvvZhAttr || (el.__tdlvvZhAttr = {});
    const en = el.__tdlvvEnAttr || (el.__tdlvvEnAttr = {});
    attrKeys(el).forEach((key) => {
      if (!el.hasAttribute(key)) return;
      const cur = el.getAttribute(key);
      if (lang === 'zh') {
        if (Object.prototype.hasOwnProperty.call(zh, key)) el.setAttribute(key, zh[key]);
        delete en[key];
        return;
      }
      if (en[key] === undefined || cur !== en[key]) zh[key] = cur;
      const next = translate(zh[key], el);
      en[key] = next;
      if (cur !== next) el.setAttribute(key, next);
    });
  }

  function apply(root) {
    if (applying) return;
    applying = true;
    try {
      const base = root && root.nodeType === 1 ? root : document.body;
      if (!base) return;
      textNodes(base).forEach(applyText);
      if (!skip(base)) applyAttrs(base);
      base.querySelectorAll('*').forEach((el) => {
        if (!skip(el)) applyAttrs(el);
      });
      document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    } finally {
      applying = false;
    }
  }

  function schedule() {
    if (lang !== 'en' || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      apply();
    });
  }

  function watch() {
    if (observer || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver(() => { if (lang === 'en') schedule(); });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['title', 'placeholder']
    });
  }

  function setLang(next) {
    const value = next === 'en' ? 'en' : 'zh';
    if (value === lang) {
      if (lang === 'en') { watch(); apply(); }
      return lang;
    }
    lang = value;
    if (lang === 'en') {
      apply();
      watch();
    } else {
      if (observer) { observer.disconnect(); observer = null; }
      apply();
    }
    return lang;
  }

  function tr(value) {
    const text = String(value == null ? '' : value);
    return lang === 'en' ? translate(text) : text;
  }

  window.TDLVV_I18N = {
    setLang,
    get lang() { return lang; },
    apply: () => apply(),
    refresh: schedule,
    tr
  };

  const nativeConfirm = window.confirm;
  window.confirm = (message) => nativeConfirm(tr(message));
})();
