// components/start/WritingSheets.tsx — 인쇄되는 쓰기 기록지(아이가 글씨를 쓰는 종이). A4 한 장에 한 아이.
//
// ⚠️ 담당자 확인 대기 — 확정 아님: 이 판은 **임시 양식**이다. 담당자가 기록지 양식을 따로 주기로 했다.
// 받을 것: 양식 파일(가능하면 PDF), 번호·이름을 적을 칸, QR을 얹을 빈 자리(오른쪽 위 3cm쯤 — 어려우면 아래 여백).
// 함께 물을 것: 아이가 **이름을 직접 쓰는 칸**을 둘지 — 다른 아이 종이에 쓰면 QR이 종이 주인에게 붙여 시스템은
// 가려낼 수 없다. 칸이 있으면 담당자가 인쇄된 이름과 대조할 수 있다(검사 화면은 「종이의 이름을 확인하고 건네 주세요」).
// 받으면 양식은 그대로 두고 **번호·이름·QR만** 정해진 자리에 얹는 방식으로 바꾼다. 그때 바뀌지 않는 것:
// · QR(lib/writing-sheet) — 스캔본을 아이와 맞추는 표시. 반 표시와 번호만 담는다(학급 코드·이름·주소 없음).
// · 목표 낱말·문장은 인쇄하지 않는다(받아쓰기).
// · 제목에 「난독」「검사」처럼 평가를 드러내는 말을 쓰지 않는다 — 아이가 손에 쥐는 종이다.
//
// 한 장이 A4 한 쪽이다 — 인쇄하는 동안 쪽 여백을 0으로 두고(WritingSheetDialog가 넣었다 빼는 @page, 브라우저 머리글·바닥글이 찍히지 않게)
// 여백 12mm·10mm는 이 종이 안쪽 padding으로 둔다. 높이는 297mm보다 조금 작게 — 딱 맞추면 반올림으로 빈 쪽이 생긴다.
import { encodeQr, qrSvgPath } from '@/lib/qr'
import { classLabel } from '@/lib/format'
import { sheetQrText, type SheetEntry, type SheetLayout } from '@/lib/writing-sheet'

export interface SheetClass { schoolName: string; grade: number; classNo: number }

function SheetQr({ text }: { text: string }) {
  const { d, viewBox } = qrSvgPath(encodeQr(text), 4)
  return (
    <svg viewBox={viewBox} width="26mm" height="26mm" shapeRendering="crispEdges" role="img" aria-label="스캔용 표시">
      <rect width="100%" height="100%" fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  )
}


export function WritingSheet({ cls, tag, layout, entry }: {
  cls: SheetClass; tag: string; layout: SheetLayout; entry: SheetEntry
}) {
  const cell = 'border border-[#b9c0cc] px-[3mm] py-[2mm]'
  const head = `${cell} bg-[#f3f5f9] font-bold text-[#3a4256] w-[22mm]`
  return (
    <section className="writing-sheet flex h-[296mm] w-[210mm] flex-col overflow-hidden bg-white px-[10mm] py-[12mm] text-[#0e1526]">
      <div className="flex items-start justify-between border-b-[0.6mm] border-[#0e1526] pb-[3mm]">
        <div>
          <h1 className="text-[24pt] font-bold leading-tight">{layout.kind === 'word' ? '낱말 쓰기' : '문장 쓰기'}</h1>
          <p className="mt-[1mm] text-[9pt] text-[#6e7994]">쓰기 기록지</p>
        </div>
        <SheetQr text={sheetQrText(tag, entry.childNo)} />
      </div>
      <table className="mt-[5mm] w-full border-collapse text-[11pt]">
        <tbody>
          <tr><td className={head}>학교</td><td className={`${cell} font-bold`}>{cls.schoolName}</td>
            <td className={head}>학년·반</td><td className={`${cell} font-bold`}>{classLabel(cls.grade, cls.classNo)}</td></tr>
          <tr><td className={head}>번호</td><td className={`${cell} font-bold`}>{entry.childNo}번</td>
            {/* 번호만 찍힌 기록지(명단에 없는 학생)는 이름을 손으로 쓴다 */}
            <td className={head}>이름</td><td className={`${cell} font-bold`}>{entry.name ?? ''}</td></tr>
        </tbody>
      </table>
      <div className={`mt-[7mm] grid gap-x-[5mm] gap-y-[4mm] ${layout.kind === 'word' ? 'grid-cols-2' : 'grid-cols-1'}`}
        style={layout.kind === 'word'
          // 낱말은 두 열 — 1~5번이 왼쪽 위에서 아래로, 6~10번이 오른쪽으로 이어진다(검사지 순서)
          ? { gridAutoFlow: 'column', gridTemplateRows: `repeat(${Math.ceil(layout.count / 2)}, 30mm)` }
          : { gridTemplateRows: `repeat(${layout.count}, 32mm)` }}>
        {Array.from({ length: layout.count }, (_, i) => (
          <div key={i} className="flex overflow-hidden rounded-[1.5mm] border-[0.5mm] border-[#8f99ad]">
            <span className="flex w-[11mm] flex-none items-center justify-center border-r-[0.5mm] border-[#8f99ad] bg-[#f3f5f9] text-[13pt] font-bold">
              {i + 1}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-auto flex justify-end border-t border-[#d6dbe5] pt-[2mm] text-[8pt] text-[#6e7994]">
        <span>채점이 끝날 때까지 보관해 주세요</span>
      </div>
    </section>
  )
}
