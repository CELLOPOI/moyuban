import defaults from '../../reader-settings.json' with { type: 'json' }

export { defaults }
export const appearanceChoices = {
  model: ['DeepSeek-V4.1-Flash', 'DeepSeek-V4-Pro'],
  effort: ['Off', 'Low', 'High', 'Max'],
  permission: ['仅可查看', '工作区内修改', '完全权限'],
}
export function readingAppearance(value, settings = defaults) {
  const initial = { model: settings.defaultModel, effort: settings.defaultEffort, permission: settings.defaultPermission }
  return Object.fromEntries(Object.entries(initial).map(([key, fallback]) =>
    [key, appearanceChoices[key].includes(value?.[key]) ? value[key] : fallback]))
}
export const sections = [
  ['存储', [
    { key: 'cacheDirectory', label: '缓存目录', path: true },
    { key: 'boardDataDirectory', label: '版面数据目录', path: true },
    { key: 'mediaCacheMiB', label: '图片和表情缓存上限（MiB）', min: 0, max: 8192, hint: '填 0 时，图片由阅读端直接加载。' },
    { key: 'directoryCacheMinutes', label: '公开目录缓存时间（分钟）', min: 0, max: 10080 },
    { key: 'favoriteSyncMinutes', label: '收藏同步间隔（分钟）', min: 1, max: 1440 },
  ]],
  ['阅读显示', [
    { key: 'renderSmiles', label: '把表情显示为图片', hint: '关闭后显示表情名称。' },
    { key: 'foldImages', label: '把楼层配图折叠在思考行内', hint: '关闭后配图随正文显示。' },
    { key: 'showAuthorUid', label: '在作者名旁显示公开 UID' },
  ]],
  ['挑选版面', [
    { key: 'promoteOnPick', label: '将刚选的版面放在工作区最上方', hint: '保留全部收藏入口。关闭后由收藏版面占据置顶区。' },
    { key: 'openOnPick', label: '选好后直接打开版面', hint: '关闭后可以留在目录里连续挑选。' },
  ]],
  ['新阅读会话的默认值', [
    { key: 'defaultModel', label: '模型外观', choices: appearanceChoices.model },
    { key: 'defaultEffort', label: '思考强度外观', choices: appearanceChoices.effort },
    { key: 'defaultPermission', label: '权限外观', choices: appearanceChoices.permission },
  ]],
]
