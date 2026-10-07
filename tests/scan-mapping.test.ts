import { describe, expect, it } from 'vitest'
import { candidatesFor, isEligible, mappingStatus, proposeMapping, scanTargetState, type ScanTarget } from '@/lib/scan-mapping'

const TAG = '7c1e94a2'
const t = (childNo: number, state: ScanTarget['state']): ScanTarget =>
  ({ childNo, name: `아이${childNo}`, sessionId: `s${childNo}`, state })
const TARGETS = [t(1, 'screen'), t(2, 'uploaded'), t(3, 'wait'), t(4, 'wait'), t(5, 'wait'), t(6, 'scored'), t(7, 'unsubmitted')]
const qr = (childNo: number, tag = TAG) => ({ tag, childNo })

describe('proposeMapping', () => {
  it('순서가 섞여도 QR로 제 주인에게 붙는다(5번·3번·4번 순)', () => {
    const plans = proposeMapping([{ index: 0, qr: qr(5) }, { index: 1, qr: qr(3) }, { index: 2, qr: qr(4) }], TAG, TARGETS)
    expect(plans.map(p => p.choice)).toEqual([5, 3, 4])
    expect(plans.every(p => p.problem === null)).toBe(true)
  })

  it('QR을 못 읽은 쪽은 비워 둔다 — 선생님이 고른다', () => {
    const [p] = proposeMapping([{ index: 0, qr: null }], TAG, TARGETS)
    expect(p).toMatchObject({ problem: 'unreadable', choice: null, qrChildNo: null })
  })

  it('다른 반 기록지는 「올리지 않음」으로 둔다', () => {
    const [p] = proposeMapping([{ index: 0, qr: qr(3, 'deadbeef') }], TAG, TARGETS)
    expect(p).toMatchObject({ problem: 'otherClass', choice: 'skip' })
  })

  it('이 반에 그 번호의 검사가 없으면 올리지 않는다', () => {
    expect(proposeMapping([{ index: 0, qr: qr(40) }], TAG, TARGETS)[0]).toMatchObject({ problem: 'noChild', choice: 'skip' })
  })

  it('화면 입력·채점 끝·미제출 아이의 쪽은 올리지 않는다', () => {
    const plans = proposeMapping([{ index: 0, qr: qr(1) }, { index: 1, qr: qr(6) }, { index: 2, qr: qr(7) }], TAG, TARGETS)
    expect(plans.map(p => [p.problem, p.choice])).toEqual([['screen', 'skip'], ['scored', 'skip'], ['unsubmitted', 'skip']])
  })

  it('이미 올린 아이(담당자 채점 전)도 자동 연결한다 — 올리면 바뀐다(화면이 「바꿔요」로 알린다)', () => {
    expect(proposeMapping([{ index: 0, qr: qr(2) }], TAG, TARGETS)[0]).toMatchObject({ problem: null, choice: 2 })
  })

  it('두 쪽이 같은 아이면 앞 쪽만 자동 연결하고 뒤 쪽은 다시 고르게 한다', () => {
    const plans = proposeMapping([{ index: 0, qr: qr(3) }, { index: 1, qr: qr(3) }], TAG, TARGETS)
    expect(plans.map(p => [p.problem, p.choice])).toEqual([[null, 3], ['duplicate', null]])
  })

  it('[REGRESSION] 재검사한 아이는 자동으로 붙이지 않는다 — 앞 차수 기록지가 다른 차수에 조용히 붙지 않게', () => {
    const targets = [{ ...t(3, 'wait'), retest: true }, t(4, 'wait')]
    const plans = proposeMapping([{ index: 0, qr: qr(3) }, { index: 1, qr: qr(3) }, { index: 2, qr: qr(4) }], TAG, targets)
    // 두 쪽 모두 선생님이 확인한다(하나를 고르면 다른 쪽 후보에서 빠진다 — candidatesFor)
    expect(plans.map(p => [p.problem, p.choice, p.qrChildNo])).toEqual([['retest', null, 3], ['retest', null, 3], [null, 4, 4]])
  })

  it('재검사여도 올릴 수 없는 아이면 종전대로 올리지 않음 — 확인을 묻지 않는다', () => {
    const [p] = proposeMapping([{ index: 0, qr: qr(6) }], TAG, [{ ...t(6, 'scored'), retest: true }])
    expect(p).toMatchObject({ problem: 'scored', choice: 'skip' })
  })

  it('빈 쪽(QR 없음 · 거의 흰 쪽)은 「올리지 않음」 — 양면 스캔의 뒷면이 「골라 주세요」로 쌓이지 않게', () => {
    const plans = proposeMapping([{ index: 0, qr: null, blank: true }, { index: 1, qr: null, blank: false }], TAG, TARGETS)
    expect(plans.map(p => [p.problem, p.choice])).toEqual([['blank', 'skip'], ['unreadable', null]])
  })
})

describe('mappingStatus', () => {
  it('모든 쪽이 정해져야 올릴 수 있다', () => {
    expect(mappingStatus([5, 3, null], TARGETS)).toMatchObject({ canConfirm: false, undecided: 1 })
    expect(mappingStatus([5, 3, 4], TARGETS)).toMatchObject({ canConfirm: true, undecided: 0, uploading: 3 })
  })

  it('「올리지 않음」도 결정이지만, 올릴 쪽이 하나도 없으면 확정할 수 없다', () => {
    expect(mappingStatus(['skip', 3], TARGETS)).toMatchObject({ canConfirm: true, uploading: 1 })
    expect(mappingStatus(['skip', 'skip'], TARGETS)).toMatchObject({ canConfirm: false, uploading: 0 })
  })

  it('두 쪽이 같은 아이를 고르면 확정할 수 없다', () => {
    expect(mappingStatus([3, 3], TARGETS)).toMatchObject({ canConfirm: false, conflicts: [3] })
  })

  it('스캔 대기인데 이번 파일에 없는 아이를 알려 준다(이미 올린 아이는 빼고)', () => {
    expect(mappingStatus([5, 'skip'], TARGETS).missing.map(x => x.childNo)).toEqual([3, 4])
  })

  it('쪽이 없으면(빈 파일) 확정할 수 없다', () => {
    expect(mappingStatus([], TARGETS).canConfirm).toBe(false)
  })
})

describe('candidatesFor', () => {
  it('올릴 수 있는 아이(대기·올림)만, 다른 쪽이 이미 고른 아이는 빼고 번호순', () => {
    const choices = [5, null, 3]
    expect(candidatesFor(1, choices, TARGETS).map(x => x.childNo)).toEqual([2, 4])
  })

  it('자기 쪽이 고른 아이는 후보에 남는다(선택이 사라지지 않게)', () => {
    expect(candidatesFor(0, [5, null], TARGETS).map(x => x.childNo)).toContain(5)
  })
})

describe('scanTargetState — 검사 한 건의 쓰기 상태(서버 배지·결과지·확인 화면이 같은 규칙)', () => {
  const st = (over: Partial<Parameters<typeof scanTargetState>[0]>) =>
    scanTargetState({ submitted: true, mode: 'scan', hasScan: false, hasWriting: false, ...over })
  it('제출 전이면 방식과 무관하게 unsubmitted — 쓰기 방식은 제출 때 확정된다', () => {
    expect(st({ submitted: false })).toBe('unsubmitted')
    expect(st({ submitted: false, mode: 'screen', hasWriting: true })).toBe('unsubmitted')
  })
  it('화면 방식은 screen', () => {
    expect(st({ mode: 'screen' })).toBe('screen')
    expect(st({ mode: 'screen', hasScan: true })).toBe('screen')
  })
  it('스캔본 방식: 안 올림 wait · 올림 uploaded', () => {
    expect(st({})).toBe('wait')
    expect(st({ hasScan: true })).toBe('uploaded')
  })
  it('[핵심] 담당자가 쓰기를 **하나라도** 넣으면 scored — 스캔본이 없어도(종이를 따로 받아 채점)', () => {
    expect(st({ hasScan: true, hasWriting: true })).toBe('scored')
    expect(st({ hasWriting: true })).toBe('scored')
  })
  it('올릴 수 있는 것은 wait·uploaded뿐', () => {
    expect(['wait', 'uploaded', 'scored', 'screen', 'unsubmitted'].map(state => isEligible(t(1, state as ScanTarget['state']))))
      .toEqual([true, true, false, false, false])
  })
})

