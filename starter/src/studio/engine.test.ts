import { describe, expect, it, beforeEach } from 'vitest'
import rawData from '../data/photos.json'
import type { PhotoData } from '../data/photos'
import {
  initState,
  createInitialContent,
  freezeBaseline,
  submitOp,
  sync,
  adjudicate,
  recomputeDerived,
  evaluateGate,
  publish,
  setRole,
  newOpId,
  activeBatch,
  type StudioState,
  type Operation,
  type ContentState,
} from './engine'

const data = rawData as PhotoData
const SERIES = 'highland-pastoral'
const MEMBERS: Record<string, string[]> = {
  gaze: ['portrait-01', 'portrait-02', 'portrait-03', 'portrait-04', 'portrait-05'],
  wilderness: ['landscape-01', 'landscape-02', 'landscape-03', 'landscape-04', 'landscape-05'],
  'highland-pastoral': ['pastoral-01', 'pastoral-02', 'pastoral-03', 'pastoral-04'],
}

let clock = 1_000
const now = () => (clock += 1)

function freshState(): StudioState {
  return initState(createInitialContent(data))
}

function freeze(state: StudioState, seriesId = SERIES) {
  return freezeBaseline(state, seriesId, now())
}

function makeOp(
  state: StudioState,
  batchId: string,
  source: 'lead' | 'collaborator',
  partial: Partial<Operation> & Pick<Operation, 'kind'>,
  online?: boolean,
): { state: StudioState; outcome: ReturnType<typeof submitOp>['outcome']; op: Operation } {
  const op: Operation = {
    opId: newOpId(state.seq),
    batchId,
    source,
    ts: now(),
    online: online ?? state.online,
    ...partial,
  }
  const result = submitOp(state, op)
  return { state: result.state, outcome: result.outcome, op }
}

function cropAll(state: StudioState, source: 'lead' | 'collaborator' = 'lead'): StudioState {
  const batch = activeBatch(state)!
  let s = state
  for (const id of MEMBERS[batch.seriesId]) {
    const r = makeOp(s, batch.id, source, {
      kind: 'set-crop',
      entityId: id,
      value: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
    })
    s = r.state
  }
  return s
}

describe('策展发布台引擎', () => {
  beforeEach(() => {
    clock = 1_000
  })

  it('冻结基线：两侧工作副本从同一基线克隆，且基线内容与当前事实一致', () => {
    const { state, batchId } = freeze(freshState())
    const batch = state.batches[batchId]
    expect(batch.status).toBe('active')
    expect(batch.branches.lead.photos['pastoral-01'].title).toBe('独牛与木屋')
    expect(batch.branches.collaborator.photos['pastoral-01'].title).toBe(
      batch.baseline.photos['pastoral-01'].title,
    )
    // 新基线冻结后，旧派生结果立即标记失效
    expect(batch.derived.stale).toBe(true)
  })

  it('离线操作带操作号与来源，并在日志中保留 online=false 与 source', () => {
    let s = freeze(freshState()).state
    s = { ...s, online: false }
    const r = makeOp(s, s.activeBatchId!, 'lead', {
      kind: 'set-field',
      entity: 'photo',
      entityId: 'pastoral-01',
      field: 'caption',
      value: '离线改的说明',
    })
    expect(r.outcome.status).toBe('applied')
    const entry = r.state.log[0]
    expect(entry.online).toBe(false)
    expect(entry.source).toBe('lead')
    expect(entry.opId).toMatch(/^op-\d+-/)
    // 改的是 lead 的分支，collaborator 分支不动
    const batch = activeBatch(r.state)!
    expect(batch.branches.lead.photos['pastoral-01'].caption).toBe('离线改的说明')
    expect(batch.branches.collaborator.photos['pastoral-01'].caption).toBe('木屋比牛安静，牛比风安静。')
  })

  it('重复重试沿用首次结果：同 opId 第二次提交为 duplicate，分支内容只应用一次', () => {
    const frozen = freeze(freshState())
    const batchId = frozen.batchId
    const op: Operation = {
      opId: 'op-fixed-0001',
      batchId,
      source: 'lead',
      ts: now(),
      online: false,
      kind: 'set-field',
      entity: 'photo',
      entityId: 'pastoral-02',
      field: 'title',
      value: '坡地牛群（离线改）',
    }
    const first = submitOp(frozen.state, op)
    expect(first.outcome.status).toBe('applied')
    const second = submitOp(first.state, { ...op, ts: now(), value: '第二次想改成别的' })
    expect(second.outcome.status).toBe('duplicate')
    expect(second.outcome.firstStatus).toBe('applied')
    expect(activeBatch(second.state)!.branches.lead.photos['pastoral-02'].title).toBe(
      '坡地牛群（离线改）',
    )
    // 已发布批次上再提交操作被拒绝
  })

  it('已发布快照不能被新草稿回写：发布后批次拒绝编辑', () => {
    let s = freeze(freshState()).state
    s = cropAll(s)
    s = sync(s, now()).state
    s = recomputeDerived(s, MEMBERS, now())
    const pub = publish(s, MEMBERS, { force: false, by: 'lead' }, now())
    expect(pub.outcome.status).toBe('published')
    const publishedBatchId = pub.snapshot!.batchId
    const originalCaption = pub.snapshot!.content.photos['pastoral-01'].caption
    const op: Operation = {
      opId: 'op-after-publish',
      batchId: publishedBatchId,
      source: 'lead',
      ts: now(),
      online: true,
      kind: 'set-field',
      entity: 'photo',
      entityId: 'pastoral-01',
      field: 'caption',
      value: '想偷偷回写已发布快照',
    }
    const attempted = submitOp(pub.state, op)
    expect(attempted.outcome.status).toBe('rejected')
    expect(attempted.outcome.code).toBe(409)
    const snap = pub.state.snapshots.find(x => x.batchId === publishedBatchId)!
    expect(snap.content.photos['pastoral-01'].caption).toBe(originalCaption)
    expect(Object.isFrozen(snap.content.photos['pastoral-01'])).toBe(true)
  })

  it('逐字段合并：只有一边改的字段直接采纳，双方改成相同值也采纳', () => {
    let s = freeze(freshState()).state
    s = makeOp(s, s.activeBatchId!, 'lead', {
      kind: 'set-field', entity: 'photo', entityId: 'pastoral-01', field: 'title', value: '主策展人改的标题',
    }).state
    s = makeOp(s, s.activeBatchId!, 'collaborator', {
      kind: 'set-field', entity: 'photo', entityId: 'pastoral-02', field: 'caption', value: '协作者改的说明',
    }).state
    // 两边改同一张照片的不同字段：各自采纳，无冲突
    s = makeOp(s, s.activeBatchId!, 'lead', {
      kind: 'set-field', entity: 'series', entityId: SERIES, field: 'summary', value: 'lead summary',
    }).state
    const merged = sync(s, now())
    expect(merged.outcome.status).toBe('merged')
    const b = activeBatch(merged.state)!
    expect(b.merged!.photos['pastoral-01'].title).toBe('主策展人改的标题')
    expect(b.merged!.photos['pastoral-02'].caption).toBe('协作者改的说明')
    expect(b.merged!.series[SERIES].summary).toBe('lead summary')
    expect(b.conflicts).toHaveLength(0)
  })

  it('同一张照片两边都改同一字段且不一致：保留双方待裁决，未裁决不能发布', () => {
    let s = freeze(freshState()).state
    s = makeOp(s, s.activeBatchId!, 'lead', {
      kind: 'set-field', entity: 'photo', entityId: 'pastoral-03', field: 'caption', value: 'LEAD 版本',
    }).state
    s = makeOp(s, s.activeBatchId!, 'collaborator', {
      kind: 'set-field', entity: 'photo', entityId: 'pastoral-03', field: 'caption', value: 'COLLAB 版本',
    }).state
    const synced = sync(s, now())
    const batch = activeBatch(synced.state)!
    expect(batch.conflicts).toHaveLength(1)
    const c = batch.conflicts[0]
    expect(c.status).toBe('pending')
    expect(c.localValue).toBe('LEAD 版本')
    expect(c.remoteValue).toBe('COLLAB 版本')
    // 门禁：未合并/未裁切/未裁决都会拦
    s = cropAll(synced.state, 'lead')
    // 注意：cropAll 是在合并后继续对 lead 分支操作，会作废 merged；重新同步
    // 此时 lead 也裁了，collaborator 没裁（裁剪只 lead 侧改），同步会采纳 lead 裁剪
    let s2 = sync(s, now()).state
    s2 = recomputeDerived(s2, MEMBERS, now())
    const gate = evaluateGate(s2, MEMBERS)
    expect(gate.pass).toBe(false)
    expect(gate.pendingConflictKeys).toContain('photo:pastoral-03:caption')
    expect(gate.uncroppedPhotoIds).toHaveLength(0)
    // 裁决后再重算即可通过
    s2 = adjudicate(s2, 'photo:pastoral-03:caption', 'remote', 'lead', now()).state
    s2 = recomputeDerived(s2, MEMBERS, now())
    expect(evaluateGate(s2, MEMBERS).pass).toBe(true)
  })

  it('未裁完不能发布：缺一张裁切都被 blocked（422），裁切补齐后可发布', () => {
    let s = freeze(freshState()).state
    // 只裁 3 张
    const batch = activeBatch(s)!
    for (const id of MEMBERS[SERIES].slice(0, 3)) {
      s = makeOp(s, batch.id, 'lead', {
        kind: 'set-crop', entityId: id, value: { x: 0, y: 0, w: 1, h: 1 },
      }).state
    }
    s = sync(s, now()).state
    s = recomputeDerived(s, MEMBERS, now())
    const blocked = publish(s, MEMBERS, { force: false, by: 'lead' }, now())
    expect(blocked.outcome.status).toBe('blocked')
    expect(blocked.outcome.code).toBe(422)
    expect(blocked.snapshot).toBeNull()
    // 补齐最后一张
    s = makeOp(s, batch.id, 'lead', {
      kind: 'set-crop', entityId: MEMBERS[SERIES][3], value: { x: 0, y: 0, w: 1, h: 1 },
    }).state
    s = sync(s, now()).state
    s = recomputeDerived(s, MEMBERS, now())
    const ok = publish(s, MEMBERS, { force: false, by: 'lead' }, now())
    expect(ok.outcome.status).toBe('published')
  })

  it('基线变化让未发布派生结果失效重算', () => {
    let s = freeze(freshState()).state
    s = recomputeDerived(s, MEMBERS, now())
    expect(activeBatch(s)!.derived.stale).toBe(false)
    const boardHash = activeBatch(s)!.derived.board!.hash
    // 冻结新基线（新批次）
    const f2 = freezeBaseline(s, 'gaze', now())
    expect(activeBatch(f2.state)!.derived.stale).toBe(true)
    expect(activeBatch(f2.state)!.derived.board).toBeNull()
    s = recomputeDerived(f2.state, MEMBERS, now())
    expect(activeBatch(s)!.derived.stale).toBe(false)
    expect(activeBatch(s)!.derived.board!.total).toBe(5)
    // 第一个批次的看板未被改动
    expect(f2.state.batches[f2.state.batchOrder[0]].derived.board?.hash).toBe(boardHash)
  })

  it('排序变化让未发布派生结果失效；输入未变时重算沿用原哈希', () => {
    let s = freeze(freshState()).state
    s = cropAll(s)
    s = sync(s, now()).state
    s = recomputeDerived(s, MEMBERS, now())
    const hash1 = activeBatch(s)!.derived.board!.hash
    // 输入未变，重算沿用
    s = recomputeDerived(s, MEMBERS, now())
    expect(activeBatch(s)!.derived.board!.hash).toBe(hash1)
    // lead 重排
    const reordered = [...MEMBERS[SERIES]].reverse()
    s = makeOp(s, s.activeBatchId!, 'lead', {
      kind: 'reorder', seriesId: SERIES, orderedIds: reordered,
    }).state
    expect(activeBatch(s)!.derived.stale).toBe(true)
    // merged 也因分支编辑作废
    expect(activeBatch(s)!.merged).toBeNull()
    s = sync(s, now()).state
    s = recomputeDerived(s, MEMBERS, now())
    const board = activeBatch(s)!.derived.board!
    expect(board.items.map(i => i.photoId)).toEqual(reordered)
    expect(board.hash).not.toBe(hash1)
  })

  it('协作者强制发布返回 403，主策展人可强制发布（带警告且快照冻结）', () => {
    let s = setRole(freeze(freshState()).state, 'collaborator')
    // 未裁完：协作者即使强制也 403（权限优先于门禁）
    s = sync(s, now()).state
    s = recomputeDerived(s, MEMBERS, now())
    const collabForce = publish(s, MEMBERS, { force: true, by: 'collaborator' }, now())
    expect(collabForce.outcome.code).toBe(403)
    expect(collabForce.outcome.status).toBe('rejected')
    expect(collabForce.snapshot).toBeNull()
    // 协作者普通发布同样被门禁拦（blocked 而非 403）
    const collabNormal = publish(s, MEMBERS, { force: false, by: 'collaborator' }, now())
    expect(collabNormal.outcome.status).toBe('blocked')
    // 主策展人强制发布：跳过未裁/冲突门禁
    const leadForce = publish(s, MEMBERS, { force: true, by: 'lead' }, now())
    expect(leadForce.outcome.status).toBe('published')
    expect(leadForce.snapshot!.forced).toBe(true)
    expect(leadForce.snapshot!.warnings.length).toBeGreaterThan(0)
    expect(Object.isFrozen(leadForce.snapshot!)).toBe(true)
  })

  it('完整离线协同闭环：各自离线修改 → 回网合并 → 裁决 → 重算 → 发布 → 新批次基线已更新', () => {
    let s = freshState()
    // 第一批：裁完全部 + 改说明，发布，作为已上线版本
    let f = freeze(s, SERIES)
    s = f.state
    s = { ...s, online: false }
    for (const id of MEMBERS[SERIES]) {
      s = makeOp(s, s.activeBatchId!, 'lead', {
        kind: 'set-crop', entityId: id, value: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 },
      }, false).state
    }
    s = { ...s, online: true }
    s = sync(s, now()).state
    s = recomputeDerived(s, MEMBERS, now())
    const pub1 = publish(s, MEMBERS, { force: false, by: 'lead' }, now())
    expect(pub1.snapshot!.version).toBe(1)
    s = pub1.state

    // 第二批：冻结基线时，基线已含第一批的裁切
    f = freeze(s, SERIES)
    s = f.state
    expect(activeBatch(s)!.baseline.photos['pastoral-01'].crop).not.toBeNull()
    // 两边离线改同一字段 -> 冲突
    s = { ...s, online: false }
    s = makeOp(s, s.activeBatchId!, 'lead', {
      kind: 'set-field', entity: 'photo', entityId: 'pastoral-04', field: 'caption', value: 'lead 新文案',
    }, false).state
    s = makeOp(s, s.activeBatchId!, 'collaborator', {
      kind: 'set-field', entity: 'photo', entityId: 'pastoral-04', field: 'caption', value: 'collab 新文案',
    }, false).state
    s = { ...s, online: true }
    s = sync(s, now()).state
    s = adjudicate(s, 'photo:pastoral-04:caption', 'local', 'lead', now()).state
    s = recomputeDerived(s, MEMBERS, now())
    expect(evaluateGate(s, MEMBERS).pass).toBe(true)
    const pub2 = publish(s, MEMBERS, { force: false, by: 'lead' }, now())
    expect(pub2.snapshot!.version).toBe(2)
    expect(pub2.snapshot!.content.photos['pastoral-04'].caption).toBe('lead 新文案')
    // v1 快照不受 v2 影响
    const v1 = pub2.state.snapshots.find(x => x.version === 1)!
    expect(v1.content.photos['pastoral-04'].caption).toBe('牛群铺满了整片草原，像撒出去的一把种子。')
  })

  it('内容工具：初始内容严格来自 photos.json，未虚构字段', () => {
    const content: ContentState = createInitialContent(data)
    expect(Object.keys(content.photos)).toHaveLength(14)
    const p01 = data.photos.find(p => p.id === 'pastoral-01')!
    expect(content.photos['pastoral-01'].caption).toBe(p01.caption)
    expect(content.photos['pastoral-01'].crop).toBeNull()
    expect(content.series['gaze'].title).toBe('凝视')
  })
})
