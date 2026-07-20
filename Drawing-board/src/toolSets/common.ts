import type { ToolDef } from '@/board/types'

export const COMMON_TOOLS: ToolDef[] = [{ id: 'select', label: 'Select', shortcut: 'S' }]

export function withCommonTools(tools: ToolDef[]): ToolDef[] {
  const byId = new Set<string>()
  const merged: ToolDef[] = []

  for (const tool of [...COMMON_TOOLS, ...tools]) {
    if (byId.has(tool.id)) {
      continue
    }
    byId.add(tool.id)
    merged.push(tool)
  }

  return merged
}
