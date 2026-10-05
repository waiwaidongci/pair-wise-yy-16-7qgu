// 策展发布台 —— 类型定义
// 模拟「断网编辑 → 联网合并 → 裁决 → 裁图 → 发布快照」的策展工作流。

export type Role = 'chief' | 'collaborator'
export type Source = 'curator' | 'editor-b'
export type OpType = 'title' | 'caption' | 'order' | 'cover'
export type OnlineState = 'online' | 'offline'

// 离线操作：带操作号与来源（幂等键 = opNo）
export type Operation = {
  opNo: string
  source: Source
  batchId: string
  baseBaselineId: string
  type: OpType
  photoId: string
  field: string
  oldValue: string
  newValue: string
  at: number
}

// 冻结基线：一经创建不可变
export type Baseline = {
  id: string
  frozenAt: number
  photos: Record<
    string,
    { title: string; caption: string; order: number; cover: boolean }
  >
  crops: Record<string, { cropped: boolean; ratio: string }>
}

// 冲突：同一张照片同一字段被两边都改 → 保留双方待裁决
export type Conflict = {
  id: string
  photoId: string
  field: string
  versions: { source: Source; opNo: string; value: string }[]
  status: 'pending' | 'adjudicated'
  chosenSource: Source | null
}

// 派生结果：由基线 + 操作合并而来；基线或排序变化会令其失效
export type Derived = {
  hash: string
  valid: boolean
  content: Record<
    string,
    { title: string; caption: string; order: number; cover: boolean }
  >
  computedAt: number
}

export type Batch = {
  id: string
  baselineId: string
  status: 'editing' | 'merged' | 'published'
  ops: Operation[]
  conflicts: Conflict[]
  derived: Derived | null
  crops: Record<string, { cropped: boolean; ratio: string }>
  snapshotId: string | null
  createdAt: number
}

// 已发布快照：不可变，不可被新草稿回写
export type Snapshot = {
  id: string
  batchId: string
  baselineId: string
  publishedAt: number
  publishedBy: Role
  content: Record<
    string,
    { title: string; caption: string; order: number; cover: boolean }
  >
  crops: Record<string, { cropped: boolean; ratio: string }>
}

export type Notice = { kind: 'info' | 'success' | 'error'; text: string } | null

export type ConsoleState = {
  role: Role
  online: boolean
  batches: Batch[]
  snapshots: Snapshot[]
  baselines: Record<string, Baseline>
  currentBatchId: string | null
  opSeq: number
  baselineSeq: number
  batchSeq: number
  snapshotSeq: number
  conflictSeq: number
  // 幂等：opNo -> 首次提交结果（重复重试沿用首次结果）
  idempotency: Record<string, { resultId: string; at: number }>
  notice: Notice
}
