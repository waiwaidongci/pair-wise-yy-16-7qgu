import { useMemo, useState } from 'react'
import {
  activeBatch,
  evaluateGate,
  type Batch,
  type Conflict,
  type CropRect,
  type Source,
} from '../studio/engine'
import { MEMBERS_BY_SERIES, useStudio, StudioProvider } from '../studio/useStudio'
import { photoData, seriesById } from '../data/photos'

const cropPreset = (variant: number): CropRect => ({
  x: 0.05 + variant * 0.02,
  y: 0.08,
  w: 0.72,
  h: 0.78,
})

function fmt(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

function json(v: unknown): string {
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

// ---------------------------------------------------------- 单侧编辑面板 --
function BranchEditor({ source, title, hint }: { source: Source; title: string; hint: string }) {
  const { state, dispatch, makeEdit } = useStudio()
  const batch = activeBatch(state)
  const [entityId, setEntityId] = useState('pastoral-01')
  const [field, setField] = useState('caption')
  const [value, setValue] = useState('离线改的说明')
  const [lastOpId, setLastOpId] = useState<string | null>(null)

  const disabled = !batch || batch.status === 'published'
  const seriesPhotos = batch
    ? (MEMBERS_BY_SERIES[batch.seriesId] ?? [])
    : photoData.photos.map(p => p.id)

  const submitField = () => {
    if (disabled) return
    const op = makeEdit(source, {
      kind: 'set-field',
      entity: 'photo',
      entityId,
      field,
      value: field === 'order' ? Number(value) : value,
    })
    setLastOpId(op.opId)
    dispatch({ type: 'op', op })
  }

  const cropOne = (id: string, variant: number) => {
    if (disabled) return
    const op = makeEdit(source, { kind: 'set-crop', entityId: id, value: cropPreset(variant) })
    setLastOpId(op.opId)
    dispatch({ type: 'op', op })
  }

  const cropAll = () => {
    if (disabled) return
    seriesPhotos.forEach((id, i) => {
      const op = makeEdit(source, { kind: 'set-crop', entityId: id, value: cropPreset(i) })
      dispatch({ type: 'op', op })
    })
    setLastOpId(null)
  }

  const reorder = (reverse: boolean) => {
    if (disabled || !batch) return
    const ids = [...seriesPhotos]
    if (reverse) ids.reverse()
    const op = makeEdit(source, {
      kind: 'reorder',
      seriesId: batch.seriesId,
      orderedIds: ids,
    })
    setLastOpId(op.opId)
    dispatch({ type: 'op', op })
  }

  const retryLast = () => {
    if (!lastOpId || !batch) return
    // 用完全相同的操作号重放：引擎返回 duplicate，沿用首次结果
    const op = makeEdit(source, {
      kind: 'set-field',
      entity: 'photo',
      entityId,
      field,
      value: `${value}（重试于 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}）`,
    }, lastOpId)
    dispatch({ type: 'op', op })
  }

  return (
    <section className="studio-card">
      <h3>
        <span className={`tag ${source}`}>{title}</span>
      </h3>
      <p className="sub">{hint}</p>

      {!batch && <p className="sub">先在上方冻结一个发布批次。</p>}
      {batch?.status === 'published' && <p className="sub">该批次已发布，快照不可变；请冻结新基线。</p>}

      <label className="field">
        照片
        <select value={entityId} onChange={e => setEntityId(e.target.value)} disabled={disabled}>
          {seriesPhotos.map(id => (
            <option key={id} value={id}>
              {id} · {photoData.photos.find(p => p.id === id)?.title}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        字段
        <select value={field} onChange={e => setField(e.target.value)} disabled={disabled}>
          <option value="caption">说明 caption</option>
          <option value="title">标题 title</option>
          <option value="altText">替代文字 altText</option>
          <option value="order">排序 order</option>
        </select>
      </label>
      <label className="field">
        新值
        <input value={value} onChange={e => setValue(e.target.value)} disabled={disabled} />
      </label>

      <div className="row">
        <button className="btn primary" onClick={submitField} disabled={disabled}>
          记录操作（操作号自动生成）
        </button>
        <button className="btn" onClick={retryLast} disabled={disabled || !lastOpId}>
          用同一操作号重试
        </button>
      </div>
      <div className="row">
        <button className="btn" onClick={() => cropOne(entityId, 0)} disabled={disabled}>
          裁切选中照片
        </button>
        <button className="btn" onClick={cropAll} disabled={disabled}>
          一键裁完本系列
        </button>
        <button className="btn" onClick={() => reorder(true)} disabled={disabled}>
          倒序重排
        </button>
        <button className="btn" onClick={() => reorder(false)} disabled={disabled}>
          恢复顺序
        </button>
      </div>
    </section>
  )
}

// --------------------------------------------------------------- 冲突面板 --
function ConflictRow({ conflict }: { conflict: Conflict }) {
  const { dispatch } = useStudio()
  const pending = conflict.status === 'pending'
  return (
    <div className={`conflict-item ${conflict.status}`}>
      <strong>{conflict.entity === 'photo' ? '照片' : '系列'} {conflict.entityId}</strong>
      {' · '}
      字段 <code>{conflict.field}</code>
      <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
        <span><span className="tag lead">主策展人</span> 值：{json(conflict.localValue)}</span>
        <span><span className="tag collaborator">协作者</span> 值：{json(conflict.remoteValue)}</span>
        {!pending && (
          <span className="fresh-note">
            已裁决，采用：{json(conflict.winner)}
          </span>
        )}
      </div>
      {pending && (
        <div className="choices">
          <button className="btn" onClick={() => dispatch({ type: 'adjudicate', key: conflict.key, choice: 'local', by: 'lead' })}>
            保留主策展人版本
          </button>
          <button className="btn" onClick={() => dispatch({ type: 'adjudicate', key: conflict.key, choice: 'remote', by: 'lead' })}>
            保留协作者版本
          </button>
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------- 派生动板 --
function DerivedPanel({ batch }: { batch: Batch | null }) {
  const { dispatch } = useStudio()
  if (!batch) return null
  const d = batch.derived
  return (
    <section className="studio-card">
      <h3>派生结果 · 发布预览看板</h3>
      <p className="sub">
        看板由基线/合并稿与排序派生。基线冻结或排序变化后自动标记失效，必须重算；输入未变时沿用原哈希。
      </p>
      {d.stale ? (
        <p className="stale-note derived-status">● 已失效：{d.reason}</p>
      ) : d.board ? (
        <p className="fresh-note derived-status">● 有效 · hash {d.board.hash} · 计算于 {fmt(d.board.computedAt)}</p>
      ) : (
        <p className="stale-note derived-status">● 尚未计算</p>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => dispatch({ type: 'recompute' })}>
          重算派生看板
        </button>
      </div>
      {d.board && (
        <ul className="board-list" style={{ marginTop: 12 }}>
          {d.board.items.map(item => (
            <li key={item.photoId}>
              <span>#{item.order} {item.photoId} · {item.title}</span>
              <span>{item.cropped ? '✓ 已裁切' : '✗ 未裁切'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ------------------------------------------------------------- 门禁与发布 --
function PublishPanel() {
  const { state, dispatch } = useStudio()
  const batch = activeBatch(state)
  const gate = useMemo(
    () => (batch ? evaluateGate(state, MEMBERS_BY_SERIES) : null),
    [batch, state],
  )

  if (!batch) {
    return (
      <section className="studio-card">
        <h3>发布门禁</h3>
        <p className="sub">冻结基线后在此检查「裁完 / 无待裁决 / 派生看板有效」三项。</p>
      </section>
    )
  }

  if (batch.status === 'published') {
    return (
      <section className="studio-card">
        <h3>发布门禁</h3>
        <p className="fresh-note">● 批次 {batch.id} 已发布，快照 {batch.snapshotId} 已冻结，新草稿无法回写。</p>
      </section>
    )
  }

  return (
    <section className="studio-card">
      <h3>发布门禁</h3>
      <p className="sub">未裁完、有冲突待裁决或派生看板失效时，普通发布一律被阻止。</p>
      <div className={`gate-report ${gate?.pass ? 'ok' : 'bad'}`}>
        {gate?.pass ? (
          <span className="fresh-note">● 三项门禁全部通过，可以发布。</span>
        ) : (
          <>
            <span className="stale-note">● 发布将被阻止：</span>
            <ul>
              {gate?.reasons.map(r => <li key={r}>{r}</li>)}
            </ul>
          </>
        )}
      </div>
      <div className="row">
        <button
          className="btn primary"
          disabled={!gate?.pass}
          onClick={() => dispatch({ type: 'publish', force: false, by: state.role })}
        >
          普通发布
        </button>
        <button
          className="btn danger"
          onClick={() => dispatch({ type: 'publish', force: true, by: state.role })}
        >
          强制发布（仅主策展人）
        </button>
      </div>
      <p className="sub" style={{ marginTop: 8 }}>
        当前身份：{state.role === 'lead' ? '主策展人' : '协作者'} ——
        协作者点「强制发布」会得到 403，并写入操作日志。
      </p>
    </section>
  )
}

// ----------------------------------------------------------------- 主页面 --
function StudioPageInner() {
  const { state, dispatch, lastToast, clearToast } = useStudio()
  const [seriesId, setSeriesId] = useState(photoData.series[0].id)
  const batch = activeBatch(state)

  const runDemoScenario = () => {
    const freezeSeries = 'highland-pastoral'
    setSeriesId(freezeSeries)
    dispatch({ type: 'demo', seriesId: freezeSeries })
  }

  return (
    <div className="container studio-page">
      <header style={{ marginBottom: 24 }}>
        <p className="eyebrow">Curator Console · 内部工具</p>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', marginTop: 10 }}>
          策展发布台
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginTop: 8, maxWidth: 720 }}>
          每批发布先冻结基线；断网期间的修改带操作号与来源暂存在各自工作副本；
          回网后按字段三方合并，双方都改的字段保留待裁决；未裁完不能发布；
          已发布快照不可回写；基线或排序变化令派生看板失效重算；重复重试沿用首次结果。
        </p>
      </header>

      {/* 会话控制 */}
      <div className="studio-topbar">
        <div className="studio-controls">
          <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            身份
            <select
              value={state.role}
              onChange={e => dispatch({ type: 'role', role: e.target.value as 'lead' | 'collaborator' })}
              style={{ marginLeft: 8 }}
            >
              <option value="lead">主策展人</option>
              <option value="collaborator">协作者</option>
            </select>
          </label>
          <span className={`pill ${state.online ? 'online' : 'offline'}`}>
            {state.online ? '● 在线' : '○ 断网（操作离线暂存）'}
          </span>
          <button
            className="btn"
            onClick={() => dispatch({ type: 'online', online: !state.online })}
          >
            切换{state.online ? '断网' : '回网'}
          </button>
          <button className="btn danger" onClick={() => { if (confirm('清空所有批次、日志与快照？')) dispatch({ type: 'reset' }) }}>
            重置全部
          </button>
          <button className="btn" onClick={runDemoScenario}>
            载入演示场景（双端离线+冲突）
          </button>
        </div>
      </div>

      {/* 冻结基线 */}
      <section className="studio-card" style={{ marginBottom: 20 }}>
        <h3>1 · 冻结发布基线</h3>
        <p className="sub">
          从当前已发布事实（canonical）克隆一份不可变基线，两侧工作副本从同一基线出发。
        </p>
        <div className="row">
          <select value={seriesId} onChange={e => setSeriesId(e.target.value)}>
            {photoData.series.map(s => (
              <option key={s.id} value={s.id}>{s.title}（{s.id}）</option>
            ))}
          </select>
          <button
            className="btn primary"
            disabled={!state.online}
            onClick={() => dispatch({ type: 'freeze', seriesId })}
          >
            为该系列冻结新基线
          </button>
          {!state.online && <span className="sub">请先恢复网络再冻结基线。</span>}
        </div>
        {batch && (
          <p className="sub" style={{ marginTop: 10 }}>
            进行中：批次 <code>{batch.id}</code> · 系列《{seriesById(batch.seriesId)?.title}》
            {' '}· 冻结于 {fmt(batch.frozenAt)} · {batch.status === 'active' ? '进行中' : '已发布'}
          </p>
        )}
      </section>

      {/* 双端离线操作 */}
      <div className="studio-grid">
        <BranchEditor
          source="lead"
          title="主策展人的设备"
          hint="断网时在这台设备上调整封面、顺序、说明与裁切；操作带 opId、source=lead、online=false 暂存。"
        />
        <BranchEditor
          source="collaborator"
          title="另一位编辑的设备"
          hint="同批次的另一条工作线：source=collaborator。回网后两侧日志一起参与逐字段合并。"
        />
      </div>

      {/* 合并与冲突 */}
      <div className="studio-grid">
        <section className="studio-card">
          <h3>2 · 回网同步 · 逐字段三方合并</h3>
          <p className="sub">
            以基线为共同祖先逐字段比较：单边修改直接采纳；双方改成相同值直接采纳；
            同一张照片两边都改且不一致，保留双方为待裁决项。
          </p>
          <div className="row">
            <button
              className="btn primary"
              disabled={!batch || batch.status === 'published'}
              onClick={() => dispatch({ type: 'sync' })}
            >
              执行回网合并
            </button>
            {batch?.syncedAt && (
              <span className="sub">上次合并：{fmt(batch.syncedAt)}（{batch.conflicts.length} 个冲突）</span>
            )}
          </div>
          <p className="sub" style={{ marginTop: 8 }}>
            注意：合并之后再做任何编辑，旧合并稿与裁决会作废，需要重新合并——不能拿过期合并稿发布。
          </p>
        </section>

        <section className="studio-card">
          <h3>待裁决冲突</h3>
          <p className="sub">主策展人逐字段选择保留哪一方；裁决后派生看板需重算。</p>
          {!batch || batch.conflicts.length === 0 ? (
            <p className="sub">暂无冲突。</p>
          ) : (
            batch.conflicts.map(c => <ConflictRow key={c.key} conflict={c} />)
          )}
        </section>
      </div>

      {/* 派生 + 发布 */}
      <div className="studio-grid">
        <DerivedPanel batch={batch} />
        <PublishPanel />
      </div>

      {/* 已发布快照 */}
      <section className="studio-card" style={{ marginBottom: 20 }}>
        <h3>已发布快照（不可变）</h3>
        <p className="sub">
          发布时对合并稿做深冻结。之后冻结的新基线产生新草稿，任何操作都回写不到这里。
        </p>
        {state.snapshots.length === 0 && <p className="sub">还没有发布过任何版本。</p>}
        {state.snapshots.map(snap => (
          <div key={snap.id} className="snapshot-card frozen">
            <strong>{snap.id}</strong> · 系列《{seriesById(snap.seriesId)?.title}》
            {' · '}v{snap.version} · {fmt(snap.publishedAt)} · by {snap.publishedBy}
            {snap.forced && <span className="tag rejected" style={{ marginLeft: 8 }}>强制发布</span>}
            {snap.warnings.length > 0 && (
              <ul style={{ margin: '8px 0 0 18px', color: 'var(--text-dim)' }}>
                {snap.warnings.map(w => <li key={w}>{w}</li>)}
              </ul>
            )}
          </div>
        ))}
      </section>

      {/* 操作日志 */}
      <section className="studio-card">
        <h3>操作日志（操作号 · 来源 · 在线状态 · 结果）</h3>
        <p className="sub">同一 opId 重放只会新增一条 duplicate 记录并沿用首次结果。</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="log-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>操作号</th>
                <th>来源</th>
                <th>联网</th>
                <th>动作</th>
                <th>结果</th>
              </tr>
            </thead>
            <tbody>
              {state.log.slice(0, 40).map(e => (
                <tr key={`${e.opId}-${e.ts}-${e.kind}-${e.detail}`}>
                  <td>{fmt(e.ts)}</td>
                  <td><code>{e.opId}</code></td>
                  <td>
                    {e.source === 'system' ? (
                      <span className="tag">系统</span>
                    ) : (
                      <span className={`tag ${e.source}`}>{e.source === 'lead' ? '主策展人' : '协作者'}</span>
                    )}
                  </td>
                  <td>{e.online ? '在线' : '离线'}</td>
                  <td>{e.detail}</td>
                  <td>
                    <span className={`tag ${e.outcome.status}`}>
                      {e.outcome.status}
                      {e.outcome.code ? ` ${e.outcome.code}` : ''}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {lastToast && (
        <div
          className={`toast ${lastToast.kind === 'error' ? 'error' : ''}`}
          role="status"
          onClick={clearToast}
        >
          {lastToast.text}
          <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--text-dim)' }}>点击关闭</div>
        </div>
      )}
    </div>
  )
}


export default function StudioPage() {
  return (
    <StudioProvider>
      <StudioPageInner />
    </StudioProvider>
  )
}
