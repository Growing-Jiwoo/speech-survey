// lib/schools.ts — 지역(시도교육청) 상수와 학교 타입. 학교 목록 자체는 public/schools/<slug>.json (build:schools 생성물).
export interface RegionInfo { slug: string; name: string; short: string }

export const REGIONS: RegionInfo[] = [
  { slug: 'seoul', name: '서울특별시교육청', short: '서울' },
  { slug: 'busan', name: '부산광역시교육청', short: '부산' },
  { slug: 'daegu', name: '대구광역시교육청', short: '대구' },
  { slug: 'incheon', name: '인천광역시교육청', short: '인천' },
  { slug: 'gwangju', name: '광주광역시교육청', short: '광주' },
  { slug: 'daejeon', name: '대전광역시교육청', short: '대전' },
  { slug: 'ulsan', name: '울산광역시교육청', short: '울산' },
  { slug: 'sejong', name: '세종특별자치시교육청', short: '세종' },
  { slug: 'gyeonggi', name: '경기도교육청', short: '경기' },
  { slug: 'gangwon', name: '강원특별자치도교육청', short: '강원' },
  { slug: 'chungbuk', name: '충청북도교육청', short: '충북' },
  { slug: 'chungnam', name: '충청남도교육청', short: '충남' },
  { slug: 'jeonbuk', name: '전북특별자치도교육청', short: '전북' },
  { slug: 'jeonnam', name: '전라남도교육청', short: '전남' },
  { slug: 'gyeongbuk', name: '경상북도교육청', short: '경북' },
  { slug: 'gyeongnam', name: '경상남도교육청', short: '경남' },
  { slug: 'jeju', name: '제주특별자치도교육청', short: '제주' },
]

export const REGION_NAMES: string[] = REGIONS.map(r => r.name)

/** 지역별 학교 파일(public/schools/<slug>.json)의 원소 */
export interface School { id: string; name: string; addr: string }
