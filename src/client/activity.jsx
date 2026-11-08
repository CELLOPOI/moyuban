import { IconApiOutlineRegular, IconGlobeOutlineRegular, IconSparkleRegular, IconThinkOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'

const activities = [
  { title: '思考', icon: IconThinkOutlineRegular },
  { title: '已搜索网页', icon: IconGlobeOutlineRegular },
  { title: '执行了命令', icon: IconApiOutlineRegular },
  { title: '已调用工具', icon: IconSparkleRegular },
]

// 只决定阅读行的外观。筛选、续批或重开同一条记录均保留原来的图标和标签。
export function activityFor(key) {
  let hash = 2166136261
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  const mixed = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b)
  return activities[((mixed ^ (mixed >>> 13)) >>> 0) % activities.length]
}
