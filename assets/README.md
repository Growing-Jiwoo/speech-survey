# assets

## forms/kodys-g1.pdf · forms/kodys-g2.pdf
담당자 배포 원본 검사지(초등 1·2학년). 결과지 PDF의 배경으로 그대로 쓴다.
**직접 편집하지 말 것** — 개정본을 받으면 이 파일을 교체하고
`node scripts/extract-form-layout.mjs <pdf> <의미 첫낱말> <무의미 첫낱말> [쓰기 의미] [쓰기 무의미]`를
다시 돌려 좌표(`lib/forms/*-layout.ts`)를 재생성한다.

⚠️ **kodys-g2.pdf는 아직 「가안」이다**(원본 파일명: 초등 2학년 선별검사 양식（가안）.pdf).
확정본을 받으면 파일 교체 + 좌표 재추출 + `tests/forms.test.ts`의 `SHEET_G2` 갱신이 함께 필요하다.

## fonts/NanumGothic.ttf · fonts/NanumGothicBold.ttf
스탬프용 한글 폰트. 원본 검사지와 같은 서체라 얹은 글자가 이질감이 없다.
둘 다 쓰는 이유는 검사지가 두 굵기를 섞어 쓰기 때문이다 —

- **Bold**: 점수와 O/X. 옆에 인쇄된 분모(`/ 7`)가 굵은 글꼴이라, 정체로 찍으면 같은 칸
  안에서 굵기가 어긋나 얹은 티가 난다.
- **Regular**: 머리글 인적사항(학교명·이름 등). 본문과 같은 굵기로 섞여야 자연스럽다.

SIL Open Font License 1.1 (OFL.txt). 아래 절차로 만들었다(변환 도구는 산출물만 남기고 지운다):

    npm i -D @fontsource/nanum-gothic wawoff2
    node -e "const w=require('wawoff2'),fs=require('fs');const d='node_modules/@fontsource/nanum-gothic/files/';\
    for (const [src,out] of [['korean-400','NanumGothic'],['korean-700','NanumGothicBold']])\
      w.decompress(fs.readFileSync(d+'nanum-gothic-'+src+'-normal.woff2'))\
       .then(t=>fs.writeFileSync('assets/fonts/'+out+'.ttf',Buffer.from(t)))"
    npm rm @fontsource/nanum-gothic wawoff2
