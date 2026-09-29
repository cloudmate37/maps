# 서울 통계 지도 만들기

서울의 2025년 6월 기준 행정동 426개와 자치구 25개 경계에 CSV 값을 표시하고, 현재 지도를 단일 HTML 또는 투명 배경 PNG 파일로 저장하는 정적 웹사이트입니다. [GitHub Pages](https://cloudmate37.github.io/maps/)에서 사용할 수 있도록 구성했습니다.

## 사용

1. 공개 Google Drive **CSV 파일**의 공유 링크를 입력하거나 CSV 파일을 직접 선택합니다. Drive 폴더 링크와 Google Sheets 문서는 지원하지 않습니다.
2. 연도, 지표, 자치구/행정동을 선택합니다. 구별 지도에는 구별 CSV 값만 사용하며 행정동 값을 합산하지 않습니다.
3. `HTML 다운로드`로 대화형 지도를, `PNG 다운로드`로 투명 배경의 정적 지도를 저장합니다. 두 파일 모두 원본 CSV와 API 키에 다시 접근하지 않습니다. HTML은 지도 라이브러리를 온라인에서 불러옵니다.

입력은 UTF-8 또는 CP949 CSV를 지원합니다. `연도,지역코드,지표코드,값`의 4열 형식은 제목 행 유무와 관계없이 사용할 수 있습니다. 서울 전체나 서울 외 지역은 제외됩니다. 추가로 첫 열이 자치구명이고 나머지 열이 지표인 구별 가로형 CSV도 지원합니다. 가로형의 연도는 열 제목의 `22년` 또는 `2022년` 표기에서 추정하며 표기가 없으면 `연도 미상`으로 표시합니다. 자치구명 표기는 2025년 6월 코드표와 같아야 합니다.

## Drive API 설정

공개 링크를 브라우저에서 읽으려면 Google Cloud 프로젝트의 Drive API를 사용 설정하고 브라우저용 API 키를 [config.js](config.js)에 입력합니다. 키는 웹사이트에 공개되므로 **HTTP referrer를 `https://cloudmate37.github.io/maps/*`로, API를 Google Drive API로 제한**해야 합니다. 방문자는 로그인하거나 키를 입력할 필요가 없습니다. 키가 없을 때도 로컬 파일 선택과 예시 데이터는 작동합니다. 공개 파일이더라도 소유자가 다운로드를 막았거나 API 할당량을 초과하면 읽을 수 없습니다.

## 원본 데이터와 갱신

경계: 국가데이터처 SGIS `bnd_dong_00_2025_2Q`; 지역명: `adm_code.xls`의 2025년 6월; 지표명: `statistics_code.xls`. 원본 전국 파일은 저장소에 올리지 않고, 가공된 서울 경계만 `data/`에 포함합니다. 가공 스크립트는 프로젝트 밖의 원본 파일과 이 컴퓨터에 이미 설치된 Anaconda의 GeoPandas/Pandas를 사용합니다.

```sh
/opt/anaconda3/bin/python3 scripts/build_data.py
npm test
python3 -m http.server 8000
```

로컬 확인 주소는 `http://localhost:8000/`입니다. 별도 Python 패키지 설치는 필요하지 않습니다.
