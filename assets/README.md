# assets

## forms/kodys-g1.pdf
담당자 배포 원본 검사지(초등 1학년). 결과지 PDF의 배경으로 그대로 쓴다.
**직접 편집하지 말 것** — 개정본을 받으면 이 파일을 교체하고
`node scripts/extract-form-layout.mjs`를 다시 돌려 좌표를 재생성한다.

## fonts/NanumGothic.ttf
스탬프(점수·O/X·이름)용 한글 폰트. 원본 검사지와 같은 서체라 얹은 글자가 이질감이 없다.
SIL Open Font License 1.1 (OFL.txt). 아래 절차로 만들었다:

    npm i -D @fontsource/nanum-gothic wawoff2
    node -e "const w=require('wawoff2'),fs=require('fs');\
    w.decompress(fs.readFileSync('node_modules/@fontsource/nanum-gothic/files/nanum-gothic-korean-400-normal.woff2'))\
    .then(t=>fs.writeFileSync('assets/fonts/NanumGothic.ttf',Buffer.from(t)))"
    npm rm @fontsource/nanum-gothic wawoff2
