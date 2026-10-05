import { useState } from 'react'
import Layout from '../components/Layout'
import { ConsoleProvider, useConsole } from './ConsoleContext'
import { useCurrentBatch } from './ConsoleContext'
import { photos } from '../data'
import type { OpType, Source, Operation } from './types'

const FIELD_LABELS: Record<OpType, string> = {
  title: '标题',
  caption: '说明',
  order: '顺序',
  cover: '封面',
}
const SOURCE_LABELS: Record<Source, string> = {
  curator: '策展人',
  'editor-b': '另一位编辑',
}

export default function Console() {
  return (
    <ConsoleProvider>
      <ConsoleInner />
    </ConsoleProvider>
  )
}

function ConsoleInner() {
  const { state } = useConsole()
  return (
    <Layout>
      <section className="console">
        <div className="section-head">
          <p className="eyebrow">策展发布台</p>
          <h2>策展发布台</h2>
          <div className="gold-rule" />
          <p style={{ color: 'var(--text-dim)', maxWidth: 640 }}>
            每批发布先冻结基线；断网时两位编辑各自调整封面、顺序与说明（操作带操作号与来源），
            恢复后逐字段合并；同一张照片两边都改则保留双方待裁决，未裁完不能发布。
            已发布快照不可回写；基线或排序变化令未发布派生结果失效重算，重复重试沿用首次结果。
          </p>
        </div>

        <TopBar />
        {state.notice && <NoticeBanner />}

        <div className="console-grid">
          <aside>
            <BatchesPanel />
            <SnapshotsPanel />
          </aside>
          <div>
            {state.currentBatchId ? (
              <>
                <BaselinePanel />
                <OpsPanel />
                <MergePanel />
                <ConflictsPanel />
                <CropsPanel />
                <PublishPanel />
              </>
            ) : (
              <div className="console-panel">
                <h3>开始</h3>
                <p className="console-empty">请先创建一个发布批次（将冻结当前基线）。</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </Layout>
  )
}

function TopBar() {
  const { state, setRole, setOnline, createBatch } = useConsole()
  return (
    <div className="console-topbar">
      <div className="group">
        <label>角色</label>
        <div className="role-switch">
          <button
            type="button"
            className={state.role === 'chief' ? 'active' : ''}
            onClick={() => setRole('chief')}
          >
            主策展人
          </button>
          <button
            type="button"
            className={state.role === 'collaborator' ? 'active' : ''}
            onClick={() => setRole('collaborator')}
          >
            协作者
          </button>
        </div>
        <span className={`status-pill ${state.online ? 'online' : 'offline'}`}>
          {state.online ? '在线' : '断网'}
        </span>
      </div>
      <div className="group">
        <button
          type="button"
          className="btn-small"
          onClick={() => setOnline(!state.online)}
        >
          {state.online ? '断网（离线编辑）' : '恢复在线'}
        </button>
        <button type="button" className="btn-small solid" onClick={createBatch}>
          新建发布批次
        </button>
      </div>
    </div>
  )
}

function NoticeBanner() {
  const { state, dismissNotice } = useConsole()
  const notice = state.notice!
  return (
    <div className={`console-banner ${notice.kind === 'error' ? 'danger' : notice.kind === 'success' ? 'success' : ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
        <span>{notice.text}</span>
        <button type="button" className="btn-small" onClick={dismissNotice}>
          知道了
        </button>
      </div>
    </div>
  )
}

function BatchesPanel() {
  const { state, selectBatch } = useConsole()
  return (
    <div className="console-panel">
      <h3>
        发布批次 <span className="tag">{state.batches.length}</span>
      </h3>
      {state.batches.length === 0 ? (
        <p className="console-empty">暂无批次。点击「新建发布批次」冻结基线。</p>
      ) : (
        <ul className="batch-list">
          {state.batches.map(b => (
            <li key={b.id}>
              <button
                type="button"
                className={b.id === state.currentBatchId ? 'active' : ''}
                onClick={() => selectBatch(b.id)}
              >
                {b.id}
                <span className="batch-meta">
                  基线 {b.baselineId} · {b.status === 'published' ? '已发布' : b.status === 'merged' ? '已合并' : '编辑中'}
                  {b.snapshotId ? ` · 快照 ${b.snapshotId}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SnapshotsPanel() {
  const { state, newBatchFromSnapshot, attemptSnapshotWrite } = useConsole()
  return (
    <div className="console-panel">
      <h3>
        已发布快照 <span className="tag">不可回写</span>
      </h3>
      {state.snapshots.length === 0 ? (
        <p className="console-empty">尚未发布快照。</p>
      ) : (
        <ul className="snapshot-list">
          {state.snapshots.map(s => (
            <li key={s.id}>
              <div className="snap-id">{s.id}</div>
              <div className="snap-meta">
                批次 {s.batchId} · 基线 {s.baselineId} · {new Date(s.publishedAt).toLocaleString('zh-CN')} · {s.publishedBy === 'chief' ? '主策展人' : '协作者'}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn-small" onClick={() => newBatchFromSnapshot(s.id)}>
                  从快照新建草稿
                </button>
                <button type="button" className="btn-small danger" onClick={() => attemptSnapshotWrite(s.id)}>
                  尝试回写
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function BaselinePanel() {
  const { state, refreezeBaseline } = useConsole()
  const batch = useCurrentBatch()
  if (!batch) return null
  const baseline = state.baselines[batch.baselineId]
  return (
    <div className="console-panel">
      <h3>
        冻结基线 <span className="tag">不可变</span>
      </h3>
      <p>
        基线 ID：<span className="mono">{batch.baselineId}</span>
      </p>
      <p>
        冻结时间：
        {baseline ? new Date(baseline.frozenAt).toLocaleString('zh-CN') : '—'}
      </p>
      <p style={{ marginTop: '0.5rem' }}>
        每批发布先冻结基线，作为离线编辑与合并的基准。基线一经冻结不可更改；
        重新冻结会令未发布派生结果失效。
      </p>
      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
        <button type="button" className="btn-small" onClick={refreezeBaseline}>
          重新冻结基线
        </button>
      </div>
    </div>
  )
}

function OpsPanel() {
  const batch = useCurrentBatch()
  const { state } = useConsole()
  if (!batch) return null
  return (
    <div className="console-panel">
      <h3>
        离线操作 <span className="tag">操作号 + 来源</span>
      </h3>
      {state.online && (
        <div className="console-banner" style={{ marginBottom: '1rem' }}>
          当前在线。离线操作需先「断网」再记录；恢复后到下方「逐字段合并」。
        </div>
      )}
      <div className="editor-cols">
        <EditorColumn source="curator" disabled={state.online} />
        <EditorColumn source="editor-b" disabled={state.online} />
      </div>
      <h4 style={{ marginTop: '1.25rem', fontSize: '0.78rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
        操作记录（{batch.ops.length}）
      </h4>
      {batch.ops.length === 0 ? (
        <p className="console-empty" style={{ marginTop: '0.5rem' }}>暂无离线操作。</p>
      ) : (
        <OpList ops={batch.ops} />
      )}
    </div>
  )
}

function EditorColumn({ source, disabled }: { source: Source; disabled: boolean }) {
  const { addOp, state } = useConsole()
  const batch = useCurrentBatch()
  const [photoId, setPhotoId] = useState(photos[0]?.id ?? '')
  const [field, setField] = useState<OpType>('caption')
  const [value, setValue] = useState('')

  if (!batch) return null

  const baseline = state.baselines[batch.baselineId]
  const current = baseline?.photos[photoId]
  const oldValue = current ? String(current[field === 'cover' ? 'cover' : field]) : ''

  const submit = () => {
    if (!photoId || value === '') return
    addOp(source, field, photoId, field, oldValue, value)
    setValue('')
  }

  return (
    <div className="editor-col">
      <h4>{SOURCE_LABELS[source]}</h4>
      <div className="field">
        <label>照片</label>
        <select value={photoId} onChange={e => setPhotoId(e.target.value)} disabled={disabled}>
          {photos.map(p => (
            <option key={p.id} value={p.id}>
              {p.id} · {p.title}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>字段</label>
        <select value={field} onChange={e => setField(e.target.value as OpType)} disabled={disabled}>
          <option value="title">标题</option>
          <option value="caption">说明</option>
          <option value="order">顺序</option>
          <option value="cover">封面</option>
        </select>
      </div>
      <div className="field">
        <label>新值（原值：{oldValue}）</label>
        {field === 'cover' ? (
          <select value={value} onChange={e => setValue(e.target.value)} disabled={disabled}>
            <option value="">选择…</option>
            <option value="true">是封面</option>
            <option value="false">非封面</option>
          </select>
        ) : field === 'order' ? (
          <input
            type="number"
            value={value}
            min={1}
            max={photos.length}
            onChange={e => setValue(e.target.value)}
            disabled={disabled}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            disabled={disabled}
            placeholder={field === 'title' ? '新标题' : '新说明'}
          />
        )}
      </div>
      <button type="button" className="btn-small solid" onClick={submit} disabled={disabled || value === ''}>
        记录离线操作
      </button>
    </div>
  )
}

function OpList({ ops }: { ops: Operation[] }) {
  const { retryOp } = useConsole()
  return (
    <ul className="op-list">
      {ops.map((op: Operation) => (
        <li key={op.opNo}>
          <span className="op-no">{op.opNo}</span>
          <span className="op-source">{SOURCE_LABELS[op.source]}</span>
          <span className="op-desc">
            {op.photoId} · {FIELD_LABELS[op.type]}：{op.oldValue} → <strong>{op.newValue}</strong>
          </span>
          <span>
            <button type="button" className="btn-small" style={{ marginTop: '0.35rem' }} onClick={() => retryOp(op.opNo)}>
              重试（沿用首次结果）
            </button>
          </span>
        </li>
      ))}
    </ul>
  )
}

function MergePanel() {
  const { state, merge, recompute } = useConsole()
  const batch = useCurrentBatch()
  if (!batch) return null
  const invalid = batch.derived && !batch.derived.valid
  return (
    <div className="console-panel">
      <h3>
        逐字段合并 <span className="tag">恢复后</span>
      </h3>
      {!state.online ? (
        <p className="console-empty">当前断网。恢复在线后即可合并两位编辑的离线操作。</p>
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn-small solid" onClick={merge}>
            逐字段合并
          </button>
          {invalid && (
            <button type="button" className="btn-small" onClick={recompute}>
              失效重算
            </button>
          )}
        </div>
      )}
      {invalid && (
        <div className="console-banner danger" style={{ marginTop: '0.75rem' }}>
          基线或排序已变化，未发布派生结果已失效（hash {batch.derived?.hash}）。恢复在线后请点击「失效重算」。
        </div>
      )}
      {batch.derived && batch.derived.valid && (
        <div className="derived-preview">
          <div className="dp-row">
            <span className="dp-field">派生 hash</span>
            <span className="dp-value mono">{batch.derived.hash}</span>
          </div>
          <div className="dp-row">
            <span className="dp-field">状态</span>
            <span className="dp-value">有效（未发布）</span>
          </div>
          <div className="dp-row">
            <span className="dp-field">照片数</span>
            <span className="dp-value">{Object.keys(batch.derived.content).length}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function ConflictsPanel() {
  const { adjudicate } = useConsole()
  const batch = useCurrentBatch()
  if (!batch) return null
  const conflicts = batch.conflicts
  return (
    <div className="console-panel">
      <h3>
        待裁决冲突 <span className="tag">双方版本保留</span>
      </h3>
      {conflicts.length === 0 ? (
        <p className="console-empty">合并后若同一张照片同一字段被两边都改，将在此保留双方待裁决。</p>
      ) : (
        <ul className="conflict-list">
          {conflicts.map(c => (
            <li key={c.id} className={`conflict-item ${c.status === 'adjudicated' ? 'resolved' : ''}`}>
              <div className="conflict-photo">{c.photoId}</div>
              <div className="conflict-field">字段 · {FIELD_LABELS[c.field as OpType] ?? c.field}</div>
              <div className="conflict-versions">
                {c.versions.map(v => (
                  <div
                    key={v.source}
                    className={`conflict-version ${c.status === 'adjudicated' && c.chosenSource === v.source ? 'selected' : ''}`}
                  >
                    <div className="cv-source">
                      {SOURCE_LABELS[v.source]} · {v.opNo}
                    </div>
                    <div className="cv-value">{v.value}</div>
                  </div>
                ))}
              </div>
              {c.status === 'pending' ? (
                <div className="conflict-actions">
                  <button type="button" className="btn-small" onClick={() => adjudicate(c.id, 'curator')}>
                    采用策展人版本
                  </button>
                  <button type="button" className="btn-small" onClick={() => adjudicate(c.id, 'editor-b')}>
                    采用另一位编辑版本
                  </button>
                </div>
              ) : (
                <p style={{ color: '#7fc98a', fontSize: '0.8rem' }}>
                  已裁决：采用{SOURCE_LABELS[c.chosenSource as Source]}版本
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CropsPanel() {
  const { crop } = useConsole()
  const batch = useCurrentBatch()
  if (!batch) return null
  return (
    <div className="console-panel">
      <h3>
        裁图清单 <span className="tag">未裁完不能发布</span>
      </h3>
      <ul className="crop-list">
        {photos.map(p => {
          const c = batch.crops[p.id]
          return (
            <li key={p.id}>
              <span>
                {p.id} · {p.title}
              </span>
              {c?.cropped ? (
                <span className="crop-done">已裁 · {c.ratio}</span>
              ) : (
                <span className="crop-pending">
                  未裁
                  <select
                    style={{ marginLeft: '0.5rem', fontSize: '0.78rem' }}
                    defaultValue=""
                    onChange={e => e.target.value && crop(p.id, e.target.value)}
                  >
                    <option value="">选择比例…</option>
                    <option value="3:2">3:2</option>
                    <option value="2:3">2:3</option>
                    <option value="1:1">1:1</option>
                    <option value="16:9">16:9</option>
                  </select>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function PublishPanel() {
  const { state, publish } = useConsole()
  const batch = useCurrentBatch()
  if (!batch) return null
  const pending = batch.conflicts.filter(c => c.status === 'pending').length
  const uncropped = photos.filter(p => !batch.crops[p.id]?.cropped).length
  // 按钮始终可点：协作者点击后由 reducer 返回 403（而非禁用），主策展人点击则走完整校验
  const canPublish = batch.status !== 'published'
  return (
    <div className="console-panel">
      <h3>
        发布 <span className="tag">{state.role === 'chief' ? '主策展人' : '协作者'}</span>
      </h3>
      {batch.status === 'published' ? (
        <div className="console-banner success">
          该批次已发布为快照 {batch.snapshotId}。已发布快照不可回写。
        </div>
      ) : (
        <>
          <p style={{ marginBottom: '0.75rem' }}>
            待裁决冲突：<strong style={{ color: pending ? '#e08a7a' : '#7fc98a' }}>{pending}</strong> 项 ·
            未裁照片：<strong style={{ color: uncropped ? '#d8b25a' : '#7fc98a' }}>{uncropped}</strong> 张
          </p>
          <div className="publish-actions">
            <button
              type="button"
              className="btn-small solid"
              disabled={!canPublish}
              onClick={() => publish(false)}
            >
              正式发布
            </button>
            <button
              type="button"
              className="btn-small danger"
              disabled={!canPublish}
              onClick={() => publish(true)}
            >
              强制发布（主策展人）
            </button>
          </div>
          {state.role !== 'chief' && (
            <p style={{ marginTop: '0.75rem', color: '#e08a7a', fontSize: '0.82rem' }}>
              协作者无权发布：点击将返回 403 Forbidden。
            </p>
          )}
        </>
      )}
    </div>
  )
}
