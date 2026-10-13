'use client'
import { useEffect } from 'react'

/**
 * 화면 어디에 파일을 떨어뜨려도 브라우저가 그 파일을 열지 않게 막는다 — 열면 화면을 떠나 입력이 사라진다
 * (신청 화면의 명단·학교 정보, 결과지 화면의 스캔본 확인 창). 놓을 자리(점선 상자·스캔 카드)는 각자
 * drop을 받아 처리하고, 이 훅은 그 밖에 떨어진 파일만 버린다. 파일 끌기만 막고 글자 끌기는 건드리지 않는다.
 */
export function useFileDropGuard() {
  useEffect(() => {
    const block = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault() }
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => { window.removeEventListener('dragover', block); window.removeEventListener('drop', block) }
  }, [])
}
