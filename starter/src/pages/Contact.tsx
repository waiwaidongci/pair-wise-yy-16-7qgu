import { useMemo, useState } from 'react'

type Fields = { name: string; email: string; message: string }
type Errors = Partial<Record<keyof Fields, string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(values: Fields): Errors {
  const errors: Errors = {}
  if (!values.name.trim()) errors.name = '请留下你的称呼'
  if (!values.email.trim()) {
    errors.email = '请填写邮箱'
  } else if (!EMAIL_RE.test(values.email.trim())) {
    errors.email = '请输入有效的邮箱地址'
  }
  if (!values.message.trim()) {
    errors.message = '留言不能为空'
  } else if (values.message.trim().length < 10) {
    errors.message = '再多写几个字吧（至少 10 个字）'
  }
  return errors
}

export default function Contact() {
  const [values, setValues] = useState<Fields>({ name: '', email: '', message: '' })
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const errors = useMemo(() => validate(values), [values])
  const isValid = Object.keys(errors).length === 0

  const showError = (field: keyof Fields) => (touched[field] ? errors[field] : undefined)

  const update = (field: keyof Fields, value: string) => {
    setValues(v => ({ ...v, [field]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || submitting) return
    setTouched({ name: true, email: true, message: true })
    setSubmitting(true)
    // 无后端：模拟发送延迟
    window.setTimeout(() => {
      setSubmitting(false)
      setSent(true)
    }, 900)
  }

  if (sent) {
    return (
      <div className="container" style={{ paddingTop: 'clamp(72px, 12vh, 130px)' }}>
        <div className="success-panel" role="status">
          <div className="check" aria-hidden="true" />
          <h2>谢谢你的来信</h2>
          <p>
            {values.name}，你的消息已经安静地落在我的桌上。
            高原上信号时有时无，但我会在两周内回信到 {values.email}。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="container contact-wrap">
      <section className="contact-intro">
        <p className="eyebrow">Contact · 联系</p>
        <h1>若你愿意让一次拍摄发生。</h1>
        <p>
          展览、出版、长期肖像合作，或只是想聊聊某道光——
          都可以写信。请尽量说明时间、地点与你心里的画面，
          这样回信时我们可以直接从要紧的事说起。
        </p>
        <div className="direct">
          <strong>工作室邮箱</strong>
          studio@linzhao.photo（每月一号集中回复）
        </div>
      </section>

      <form noValidate onSubmit={handleSubmit}>
        <div className={`form-field ${showError('name') ? 'invalid' : ''}`}>
          <label htmlFor="name">姓名</label>
          <input
            id="name"
            type="text"
            value={values.name}
            onChange={e => update('name', e.target.value)}
            onBlur={() => setTouched(t => ({ ...t, name: true }))}
            autoComplete="name"
          />
          {showError('name') && <span className="field-error">{errors.name}</span>}
        </div>

        <div className={`form-field ${showError('email') ? 'invalid' : ''}`}>
          <label htmlFor="email">邮箱</label>
          <input
            id="email"
            type="email"
            value={values.email}
            onChange={e => update('email', e.target.value)}
            onBlur={() => setTouched(t => ({ ...t, email: true }))}
            autoComplete="email"
          />
          {showError('email') && <span className="field-error">{errors.email}</span>}
        </div>

        <div className={`form-field ${showError('message') ? 'invalid' : ''}`}>
          <label htmlFor="message">留言</label>
          <textarea
            id="message"
            value={values.message}
            onChange={e => update('message', e.target.value)}
            onBlur={() => setTouched(t => ({ ...t, message: true }))}
          />
          {showError('message') && <span className="field-error">{errors.message}</span>}
        </div>

        <button
          type="submit"
          className="submit-btn"
          disabled={!isValid || submitting}
        >
          {submitting ? '正在送出…' : '发送消息'}
        </button>
      </form>
    </div>
  )
}
