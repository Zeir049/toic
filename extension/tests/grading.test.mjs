import { test } from 'node:test'
import assert from 'node:assert/strict'
import { grade, parseAnswerKey, partOf, range, reviewItems } from '../lib/grading.js'

test('순서 형식: 번호 없이 이어진 정답은 시작 번호부터 배정', () => {
  const r = parseAnswerKey('abcd ABCD', 101)
  assert.equal(r.mode, 'sequential')
  assert.equal(r.count, 8)
  assert.equal(r.answers[101], 'A')
  assert.equal(r.answers[108], 'D')
})

test('순서 형식: 구간 머리말 숫자와 단어는 무시', () => {
  const r = parseAnswerKey('Answer Key\n1-10: ABCDA BCDAB\n11-12: CC', 1)
  assert.equal(r.mode, 'sequential')
  assert.equal(r.count, 12)
  assert.equal(r.answers[10], 'B')
  assert.equal(r.answers[12], 'C')
})

test('번호 형식: 다양한 표기', () => {
  for (const text of [
    '101. (B) 102. (D) 103. (A)',
    '101 B\n102 D\n103 A',
    '101) b 102) d 103) a',
    '101번 B 102번 D 103번 A',
    '101:B, 102:D, 103:A',
    '101B102D103A',
  ]) {
    const r = parseAnswerKey(text, 1)
    assert.equal(r.mode, 'numbered', text)
    assert.deepEqual(r.answers, { 101: 'B', 102: 'D', 103: 'A' }, text)
  }
})

test('동그라미 숫자/전각 문자도 인식', () => {
  assert.deepEqual(parseAnswerKey('①②④③', 1).answers, { 1: 'A', 2: 'B', 3: 'D', 4: 'C' })
  assert.deepEqual(parseAnswerKey('1. Ⓒ 2. ⓓ', 1).answers, { 1: 'C', 2: 'D' })
})

test('번호 형식: 중복 번호는 경고', () => {
  const r = parseAnswerKey('1. A 2. B 1. C', 1)
  assert.equal(r.answers[1], 'C')
  assert.equal(r.issues.length, 1)
})

test('채점: 오답/미응답/정답없음/헷갈림/파트 집계', () => {
  const key = { 1: 'A', 2: 'B', 3: 'C', 101: 'D' }
  const marks = { 1: 'A', 2: 'C', 101: 'D' }
  const g = grade(marks, key, [1, 2, 3, 4, 101], { 1: true })
  assert.equal(g.correct, 2)
  assert.equal(g.total, 4)
  assert.deepEqual(g.wrong, [2])
  assert.deepEqual(g.blank, [3])
  assert.deepEqual(g.noKey, [4])
  assert.deepEqual(
    g.breakdown.map((b) => [b.name, b.correct, b.total]),
    [['LC', 1, 3], ['RC', 1, 1], ['Part 1', 1, 3], ['Part 5', 1, 1]],
  )
  assert.deepEqual(reviewItems(g).map((i) => i.q), [1, 2, 3])
})

test('파트 경계', () => {
  assert.equal(partOf(6).name, 'Part 1')
  assert.equal(partOf(7).name, 'Part 2')
  assert.equal(partOf(146).name, 'Part 6')
  assert.equal(partOf(200).name, 'Part 7')
  assert.equal(partOf(201), null)
  assert.deepEqual(range(101, 3), [101, 102, 103])
})
