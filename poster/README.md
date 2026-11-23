# 프로젝트 포스터 (A2)

`poster.pdf` — A2 세로(420 × 594 mm) 1쪽, 텍스트·도표는 벡터, 화면 캡처는 3배 해상도(인쇄 시 약 300 dpi).

## 이름·소속 넣고 다시 출력하기

1. `poster.html` 위쪽의 `window.POSTER` 에서 `author`, `affiliation` 값을 채웁니다.
2. 레포 루트에서 실행합니다 (Node 22+, 크롬 설치 필요, 인터넷 연결 — Pretendard 폰트·QR 라이브러리를 CDN에서 불러옴).

```
node poster/tools/build.mjs
```

`poster.pdf` 와 확인용 `poster-preview.png` 가 다시 만들어지고, 상자 안에서 넘치는 내용이 있으면 콘솔에 표시됩니다.

## 화면 캡처 다시 찍기

확장 프로그램 화면을 바꿨다면 먼저 캡처를 다시 찍습니다.

```
node poster/tools/shoot.mjs
```

`tools/demo-data.mjs` 의 가상 모의고사 3회분 데이터로 `extension/` 의 실제 페이지를 띄워 `assets/` 에 저장합니다.
AI 추천 화면의 답변 문안은 `tools/shoot.mjs` 안의 예시 텍스트입니다(실제 모델 응답 아님).

## 파일

| 파일 | 내용 |
| --- | --- |
| `poster.html`, `poster.css` | 포스터 레이아웃 (구조도·RAG 도표는 인라인 SVG) |
| `sample-test.html` | PDF 시험지 대신 보여주는 가상 시험지 (문항 직접 작성) |
| `assets/` | 확장 프로그램 화면 캡처, 예시 데이터 통계 |
| `tools/chrome.mjs` | 헤드리스 크롬 + 정적 서버 + CDP 클라이언트 (외부 패키지 없음) |
| `tools/shoot.mjs`, `tools/build.mjs` | 캡처, PDF 출력 |

## 인쇄소에 맡길 때

- 재단 여백(도련)이 필요하다고 하면 `poster.css` 의 `@page` 크기를 426 × 600 mm 로 늘리고 바깥 3 mm 까지 배경을 채워야 합니다.
- 파일은 RGB입니다. CMYK 변환이 필요하면 인쇄소에 요청하세요.
