# assets

## 검사지 원본(kodys-g1.pdf · kodys-g2.pdf)은 여기 없다
담당자 배포 원본 검사지(초등 1·2학년, 문항·배점의 절대 기준)는 2026-10-20부터 **저장소에 두지 않는다** — 저장소가 공개라
누구나 검사지를 미리 볼 수 있었다. 개발자 PC의 `private/forms/`(git 제외)에 두고, 실제 문항은 암호문 `lib/forms/sealed.ts`로만
커밋한다(README 「문항 구성」 🔒). 2학년 PDF는 아직 「가안」이다.
두 PDF는 **1학기** 양식이고 1학기 문항은 바뀔 예정이다(담당자 2026-10-20). 1·2학년 **2학기** 문항은 PDF 없이 담당자 docx
(`1학년, 2학년 2학기 예비 문항.docx`, 2026-10-19)로 받았고, 그것도 `private/forms/`에 둔다.

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
