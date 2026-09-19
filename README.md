# 토익 답안지 채점 프로그램

토익(TOEIC) 정답지를 등록하고 답안을 마킹해 채점 및 오답노트를 만드는 프로그램입니다. 같은 채점 로직을 세 가지 방식으로 실행할 수 있습니다.

- **tkinter GUI**: 데스크톱 환경(디스플레이 있음)에서 실행
- **CLI**: tkinter/디스플레이가 없는 환경에서 자동으로 실행되는 터미널 버전
- **웹(React + Vite)**: 브라우저에서 실행되는 버전 (`web/` 폴더)

정답지는 문항 수 제한 없이, 입력한 정답 개수만큼 채점합니다.

## 실행 방법

### tkinter GUI / CLI

```bash
python3 main.py
```

tkinter와 디스플레이를 사용할 수 있으면 GUI 창이 뜨고, 그렇지 않으면 자동으로 터미널 CLI 모드로 실행됩니다.

테스트 실행:

```bash
python3 -m unittest discover -s tests -v
```

### 웹

```bash
cd web
npm install
npm run dev -- --port 3045
```

브라우저에서 `http://localhost:3045` 로 접속합니다.

## 폴더 구조

```
toic/
├── main.py                      # tkinter GUI / CLI 진입점
├── app/
│   ├── constants.py               # 공통 상수 (보기 옵션, 저장 파일명 등)
│   ├── grading.py                  # 검증/채점/결과텍스트 생성 순수 로직
│   ├── storage.py                  # 정답지 프리셋 JSON 저장/불러오기
│   ├── cli.py                       # 터미널 버전 (tkinter 없을 때 자동 실행)
│   └── gui/                         # tkinter 위젯들
│       ├── answer_key_panel.py
│       ├── marking_panel.py
│       ├── result_window.py
│       └── main_window.py
├── tests/                         # app/ 순수 로직에 대한 unittest
└── web/                            # React + Vite 웹 버전
    └── src/
        ├── App.jsx                  # 정답지 관리 + 마킹 + 채점 + 결과 (단일 컴포넌트)
        └── grading.js                # app/grading.py와 동일한 로직의 JS 버전
```

## 주요 기능

- 정답지 문자열 입력(예: `ABCDA...`) → 적용 / 이름 붙여 저장 / 불러오기
- 입력한 정답 개수만큼 답안 마킹 그리드 생성
- 채점 후 오답 문항별 메모 작성
- 결과를 텍스트 파일로 저장(GUI/CLI) 또는 다운로드(웹)
