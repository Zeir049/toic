import { useEffect, useState } from 'react'
import './App.css'
import {
  DEFAULT_QUESTION_COUNT,
  OPTIONS,
  buildResultText,
  grade,
  normalizeAnswerString,
  parseAnswerString,
  validateAnswerString,
} from './grading.js'

const PRESETS_KEY = 'toic-answer-key-presets'

function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function App() {
  const [savedKeys, setSavedKeys] = useState(loadPresets)
  const [answerKeyInput, setAnswerKeyInput] = useState('')
  const [answerKey, setAnswerKey] = useState(null)
  const [totalQuestions, setTotalQuestions] = useState(DEFAULT_QUESTION_COUNT)
  const [selectedPreset, setSelectedPreset] = useState('')
  const [userAnswers, setUserAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [notes, setNotes] = useState({})

  const questionNumbers = Array.from({ length: totalQuestions }, (_, i) => i + 1)

  useEffect(() => {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(savedKeys))
  }, [savedKeys])

  function handleRegister(rawInput) {
    const raw = normalizeAnswerString(rawInput ?? answerKeyInput)
    const error = validateAnswerString(raw)
    if (error) {
      window.alert(error)
      return
    }
    setAnswerKey(parseAnswerString(raw))
    setTotalQuestions(raw.length)
    setUserAnswers({})
    window.alert(`정답지가 적용되었습니다. (총 ${raw.length}문항)`)
  }

  function handleSavePreset() {
    const raw = normalizeAnswerString(answerKeyInput)
    const error = validateAnswerString(raw)
    if (error) {
      window.alert(error)
      return
    }
    const name = window.prompt('저장할 정답지 이름을 입력하세요 (예: 1,000회차 LC):')
    if (!name || !name.trim()) return

    const trimmed = name.trim()
    setSavedKeys((prev) => ({ ...prev, [trimmed]: raw }))
    setSelectedPreset(trimmed)
    window.alert(`'${trimmed}' 정답지가 저장되었습니다.`)
  }

  function handleLoadPreset() {
    if (!selectedPreset) {
      window.alert('불러올 정답지를 선택해주세요.')
      return
    }
    const raw = savedKeys[selectedPreset]
    setAnswerKeyInput(raw)
    handleRegister(raw)
  }

  function handleMark(q, opt) {
    setUserAnswers((prev) => ({ ...prev, [q]: opt }))
  }

  function handleResetMarking() {
    if (window.confirm('마킹한 모든 답안을 지우시겠습니까?')) {
      setUserAnswers({})
    }
  }

  function handleGrade() {
    if (!answerKey) {
      window.alert('상단에서 정답을 먼저 적용해주세요.')
      return
    }

    const unmarked = questionNumbers.filter((q) => !userAnswers[q])
    if (unmarked.length > 0) {
      window.alert(`안 푼 문항이 있습니다: ${unmarked.slice(0, 5).join(', ')}... (총 ${unmarked.length}개)`)
      return
    }

    const { correctCount, wrongQuestions } = grade(userAnswers, answerKey, totalQuestions)
    setResult({
      correctCount,
      wrongQuestions,
      total: totalQuestions,
      userAnswers: { ...userAnswers },
      answerKey: { ...answerKey },
    })
    setNotes({})
  }

  function handleDownloadResult() {
    const timestamp = new Date().toLocaleString('sv-SE').slice(0, 19)
    const text = buildResultText({
      timestamp,
      correctCount: result.correctCount,
      total: result.total,
      userAnswers: result.userAnswers,
      answerKey: result.answerKey,
      wrongQuestions: result.wrongQuestions,
      notes,
    })

    const filename = `toeic_result_${timestamp.replace(/[-:T ]/g, '')}.txt`
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const accuracy = result ? ((result.correctCount / result.total) * 100).toFixed(1) : 0

  return (
    <div className="page">
      <header className="page-header">
        <h1>토익 답안지 채점 프로그램</h1>
        <p>정답지를 등록하고 답안을 마킹한 뒤 채점해 보세요.</p>
      </header>

      <section className="panel">
        <h2>1. 정답지 관리</h2>
        <p className="field-hint">정답을 연달아 입력하세요 (예: ABCDA...). 입력한 글자 수만큼 채점됩니다.</p>
        <div className="key-input-row">
          <input
            type="text"
            value={answerKeyInput}
            onChange={(e) => setAnswerKeyInput(e.target.value)}
            placeholder="ABCDABCDAB..."
          />
          <button type="button" className="primary-button" onClick={() => handleRegister()}>
            정답 적용
          </button>
        </div>
        {answerKey && <p className="success-text">정답지가 적용되었습니다. (총 {totalQuestions}문항)</p>}

        <div className="preset-row">
          <span className="field-hint">저장된 정답지:</span>
          <select value={selectedPreset} onChange={(e) => setSelectedPreset(e.target.value)}>
            <option value="">선택...</option>
            {Object.keys(savedKeys).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleLoadPreset}>
            불러오기
          </button>
          <button type="button" className="save-preset-button" onClick={handleSavePreset}>
            현재 정답지 이름 붙여 저장
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>2. 답안 마킹 (1~{totalQuestions}번)</h2>
        <div className="marking-grid">
          {questionNumbers.map((q) => (
            <div className="question-row" key={q}>
              <span className="question-no">{String(q).padStart(3, '0')}</span>
              {OPTIONS.map((opt) => (
                <label key={opt} className="option-label">
                  <input
                    type="radio"
                    name={`q-${q}`}
                    value={opt}
                    checked={userAnswers[q] === opt}
                    onChange={() => handleMark(q, opt)}
                  />
                  {opt}
                </label>
              ))}
            </div>
          ))}
        </div>
      </section>

      <div className="action-row">
        <button type="button" className="secondary-button" onClick={handleResetMarking}>
          마킹 초기화
        </button>
        <button type="button" className="primary-button" onClick={handleGrade}>
          채점하기
        </button>
      </div>

      {result && (
        <div className="result-overlay" role="dialog" aria-modal="true">
          <div className="result-panel">
            <h2>채점 결과 및 오답 노트</h2>
            <p className="score-line">
              맞은 개수: {result.correctCount} / {result.total} ({accuracy}%)
            </p>

            <div className="note-list">
              {result.wrongQuestions.length === 0 ? (
                <p className="empty-message">만점입니다! 오답이 없습니다.</p>
              ) : (
                result.wrongQuestions.map((q) => (
                  <div className="note-row" key={q}>
                    <span className="note-info">
                      [{String(q).padStart(3, '0')}번] 제출: {result.userAnswers[q]} | 정답: {result.answerKey[q]}
                    </span>
                    <input
                      type="text"
                      placeholder="오답 이유 (선택)"
                      value={notes[q] || ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [q]: e.target.value }))}
                    />
                  </div>
                ))
              )}
            </div>

            <div className="result-actions">
              <button type="button" className="secondary-button" onClick={() => setResult(null)}>
                닫기
              </button>
              <button type="button" className="primary-button" onClick={handleDownloadResult}>
                결과 파일(.txt) 다운로드
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
