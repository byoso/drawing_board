import type { ToolDef, ToolSetId } from '@/board/types'
import { withCommonTools } from '@/toolSets/common'
import { DATABASE_TOOL_SET } from '@/toolSets/database'
import { TOOLS_TOOL_SET } from '@/toolSets/tools'

export const TOOL_SET_DEFINITIONS: Record<ToolSetId, ToolDef[]> = {
  tools: withCommonTools(TOOLS_TOOL_SET),
  database: withCommonTools(DATABASE_TOOL_SET),
}

export const TOOL_SET_OPTIONS: Array<{ id: ToolSetId; label: string }> = [
  { id: 'tools', label: 'Tools' },
  { id: 'database', label: 'Database' },
]
