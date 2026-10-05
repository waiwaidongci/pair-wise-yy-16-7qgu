import { useState, type FormEvent } from 'react'
import Layout from '../components/Layout'

type FormState = {
  name: string
  email: string
  message: string
}
type Errors = Partial<Record<keyof FormState, string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(values: FormState): Errors {
  const errors: Errors = {}
  if (!values.name.trim()) errors.name = '请填写姓名'
  if (!values.email.trim()) {
    errors.email = '请填写邮箱'
  } else if (!EMAIL_RE.test(values.email.trim())) {
    errors.email = '请输入有效的邮箱地址'
  }
  if (!values.message.trim()) errors.message = '请填写留言'
  return errors
}

export default function Contact() {
  const [values, setValues] = useState<FormState>({ name: '', email: '', message: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)

  const currentErrors = validate(values)
  const isValid = Object.keys(currentErrors).length === 0

  const setField = (key: keyof FormState, value: string) => {
    setValues(v => ({ ...v, [key]: value }))
  }

  const onBlur = (key: keyof FormState) => {
    setTouched(t => ({ ...t, [key]: true }))
    setErrors(validate(values))
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const allTouched = { name: true, email: true, message: true }
    setTouched(allTouched)
    const next = validate(values)
    setErrors(next)
    if (Object.keys(next).length > 0) return
    // 前端模拟提交：无真实后端，延时后进入成功态
    window.setTimeout(() => setSubmitted(true), 400)
  }

  const fieldError = (key: keyof FormState) => (touched[key] ? errors[key] : undefined)

  return (
    <Layout>
      <section className="contact">
        <div className="section-head">
          <p className="eyebrow">联系</p>
          <h2>让我们聊聊</h2>
          <div className="gold-rule" />
        </div>

        {submitted ? (
          <div className="contact-success" role="status">
            <p className="eyebrow">已发送</p>
            <h3>谢谢你的来信</h3>
            <p>
              我已收到你的留言，会尽快通过邮件回复。
              在此之前，不妨先看看三个系列的作品。
            </p>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setValues({ name: '', email: '', message: '' })
                setErrors({})
                setTouched({})
                setSubmitted(false)
              }}
            >
              再写一封
            </button>
          </div>
        ) : (
          <form className="contact-form" noValidate onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="contact-name">姓名</label>
              <input
                id="contact-name"
                type="text"
                name="name"
                autoComplete="name"
                value={values.name}
                onChange={e => setField('name', e.target.value)}
                onBlur={() => onBlur('name')}
                aria-invalid={Boolean(fieldError('name'))}
              />
              {fieldError('name') && <p className="field-error">{fieldError('name')}</p>}
            </div>

            <div className="field">
              <label htmlFor="contact-email">邮箱</label>
              <input
                id="contact-email"
                type="email"
                name="email"
                autoComplete="email"
                value={values.email}
                onChange={e => setField('email', e.target.value)}
                onBlur={() => onBlur('email')}
                aria-invalid={Boolean(fieldError('email'))}
              />
              {fieldError('email') && <p className="field-error">{fieldError('email')}</p>}
            </div>

            <div className="field">
              <label htmlFor="contact-message">留言</label>
              <textarea
                id="contact-message"
                name="message"
                rows={6}
                value={values.message}
                onChange={e => setField('message', e.target.value)}
                onBlur={() => onBlur('message')}
                aria-invalid={Boolean(fieldError('message'))}
              />
              {fieldError('message') && <p className="field-error">{fieldError('message')}</p>}
            </div>

            <button type="submit" className="btn btn-primary" disabled={!isValid}>
              发送消息
            </button>
          </form>
        )}
      </section>
    </Layout>
  )
}
