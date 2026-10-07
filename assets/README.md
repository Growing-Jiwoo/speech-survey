# assets

## forms/kodys-g1.pdf · forms/kodys-g2.pdf
담당자 배포 원본 검사지(초등 1·2학년). **문항·배점의 절대 기준**이다 — `lib/forms/g*.ts`는 이 파일을 옮겨
적은 사본이고, `tests/forms.test.ts`가 낱말을 글자 단위로 대조한다. 출력물의 배경으로는 더 쓰지 않는다
(2026-09-28부터 내려받는 PDF는 담당자 결과보고서 양식을 `lib/pdf/report.ts`가 그린다).
**직접 편집하지 말 것** — 개정본을 받으면 이 파일을 교체하고 `lib/forms/g*.ts`의 문항 배열과
`tests/forms.test.ts`의 `SHEET_G*`를 함께 갱신한다.

⚠️ **kodys-g2.pdf는 아직 「가안」이다**(원본 파일명: 초등 2학년 선별검사 양식（가안）.pdf).
담당자가 낱말·문장 문항을 학기별로 2026-10-02 통계 후 확정한다고 했다.

## fonts/NanumGothic.ttf · fonts/NanumGothicBold.ttf
결과보고서 PDF(`lib/pdf/report.ts`)의 글꼴. 양식이 쓰는 맑은 고딕은 Microsoft 전용이라 실을 수 없어
OFL인 나눔고딕으로 대체한다 — 정체는 본문(해석 문단·체크리스트 설명·꼬리말), 굵은체는 제목·라벨·값·판정.
줄 높이는 Word 출력 실측값, 줄바꿈은 맑은 고딕 진행 폭으로 계산하므로 글꼴을 바꿔도 배치는 양식과 같다(`lib/pdf/README.md`). 정체·굵은체의 글자 집합이 같아야 「?」 치환이 일관된다.

SIL Open Font License 1.1 (OFL.txt). 아래 절차로 만들었다(변환 도구는 산출물만 남기고 지운다):

    npm i -D @fontsource/nanum-gothic wawoff2
    node -e "const w=require('wawoff2'),fs=require('fs');const d='node_modules/@fontsource/nanum-gothic/files/';\
    for (const [src,out] of [['korean-400','NanumGothic'],['korean-700','NanumGothicBold']])\
      w.decompress(fs.readFileSync(d+'nanum-gothic-'+src+'-normal.woff2'))\
       .then(t=>fs.writeFileSync('assets/fonts/'+out+'.ttf',Buffer.from(t)))"
    npm rm @fontsource/nanum-gothic wawoff2
