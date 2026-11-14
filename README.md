# Codex Bridge for SillyTavern

공식 **Codex CLI**를 사용하는 비공식 SillyTavern 서버 플러그인입니다. 사용자의 컴퓨터에 설치된 CLI와 기존 ChatGPT 로그인을 이용해, Chat Completion의 Custom (OpenAI-compatible) 연결로 텍스트 롤플레잉 대화를 생성합니다.

**v0.1.0 개발 베타** · [사용량·모델 선택 확장 Codex Usage](https://github.com/STLoft/Codex-Usage)와 함께 사용하세요. OpenAI 또는 SillyTavern의 공식 확장이 아닙니다.

## 기능

- Windows/macOS/Linux: `codex app-server`의 표준입출력 JSONL RPC
- Android 네이티브 터먹스: `codex exec -`, 지시문·대화를 표준입력으로 전달
- 일반 응답·SSE, 전체 대화·캐릭터 지시문·메시지 이름·이어쓰기 전달
- 매 요청 독립 임시 세션, 실패·취소·stop 문자열 처리
- 셸·앱·MCP·에이전트·웹 검색 등 도구 비활성화와 읽기 전용 샌드박스
- CLI 공식 잔량과 브리지를 거친 요청별 토큰 기록
- 모델은 **서버 시작 때 한 번**, 이후에는 **사용자가 모델 새로고침을 눌렀을 때만** 조회

인증 토큰 파일을 직접 읽거나 복사하지 않으며 별도 API 키를 발급받을 필요가 없습니다. 로그인과 인증 갱신은 설치된 CLI가 담당합니다. 각 사용자가 자신의 컴퓨터에서 직접 실행하는 구조입니다.

## 준비

Node.js 20 이상, Git, 작동하는 SillyTavern과 [공식 Codex CLI](https://learn.chatgpt.com/docs/cli)가 필요합니다. 서버를 실행하는 사용자 계정의 터미널에서 확인하세요.

```sh
node --version
codex --version
codex login status
```

로그인하지 않았다면 `codex login`에서 ChatGPT 로그인을 완료하세요. 실제 검증한 CLI는 **0.169.0**입니다. 다른 버전은 프로토콜·플래그 호환성 확인이 필요합니다.

## 설치

1. SillyTavern 서버를 종료합니다.
2. SillyTavern 루트 폴더에서 다음을 실행합니다.

```sh
git clone https://github.com/STLoft/Codex-Bridge.git plugins/Codex-Bridge
git clone https://github.com/STLoft/Codex-Usage.git public/scripts/extensions/third-party/Codex-Usage
```

3. SillyTavern의 `config.yaml`에서 `enableServerPlugins: true`로 설정합니다. 먼저 설정 파일을 백업하세요.
4. SillyTavern을 재시작하고 브라우저를 새로고침합니다. 추가 `npm install`은 필요 없습니다.
5. 확장 설정의 **Codex Bridge · 사용량** → 모델 선택 → **대화 연결에 입력** → API 화면에서 **연결**을 누릅니다.

사용량 확장은 SillyTavern의 확장 설치 창에 `https://github.com/STLoft/Codex-Usage`를 입력해서 설치해도 됩니다. **서버 플러그인은 확장 설치 창만으로 설치되지 않습니다.**

수동 연결: **Chat Completion → Custom (OpenAI-compatible)**, URL `http://127.0.0.1:7861/v1`, 모델 ID는 사용량 팝업에서 확인합니다. API Key는 비우고 기존 Custom 연결의 추가 인증 헤더도 확인하세요. 휴대폰에서 PC의 SillyTavern에 접속할 때도 이 주소는 그대로 둡니다. 요청은 SillyTavern 서버가 로컬 브리지에 전송합니다.

개발용 ZIP 등으로 `plugins/ST-Codex-Bridge` 또는 `third-party/ST-Codex-Usage`를 설치했던 경우에는 서버를 종료하고 기존 플러그인의 `data/`를 백업한 뒤 해당 구형 폴더를 옮겨 두세요. 구형과 새 폴더를 함께 로드하면 포트·확장 중복이 발생할 수 있습니다. 기록을 이어 쓰려면 백업한 `data/`를 `plugins/Codex-Bridge/data/`에 복사합니다.

## 사용량·모델

5시간·주간 잔량과 각각의 리셋 시각은 CLI가 제공하는 공식 값을 표시합니다. 미제공·조회 실패를 실제 잔량 0%와 구분합니다. CLI 모델 목록은 카탈로그이며, 실제 계정의 접근 가능 여부는 대화 요청 때 확인됩니다.

`/v1/models`와 팝업 열기는 서버에 저장한 목록만 읽습니다. 주기적인 모델 재조회는 없습니다. 수동 갱신 실패·빈 응답에서는 마지막 정상 목록을 유지하며 기존 선택 모델은 바꾸지 않습니다.

잔량·토큰 화면은 최대 60초 간격으로 갱신하며, 서버 잔량 조회에는 30초 캐시가 있습니다. **이 갱신은 모델 목록을 조회하지 않습니다.**

`data/usage.json`에는 요청 시각·모델·완료/실패/취소·토큰 수를, `data/settings.json`에는 모델·추론 설정을 저장합니다. 대화 원문을 브리지 기록에 저장하지 않습니다. 입력·출력 합계에 캐시·생각 토큰을 다시 더하지 않습니다. 5시간·7일 합계는 최근 1,000건, 상세 표는 최근 200건 기준이며 전체 누적 합계는 별도 보존합니다. 토큰 미제공 요청은 합계에서 제외합니다.

## 제한

- **Temperature·Top-p는 CLI에 적용되지 않습니다.**
- **최대 토큰은 답변 길이 안내로만 전달하며 강제 상한이 아닙니다.**
- 텍스트 전용으로 이미지·오디오·파일과 도구 호출은 지원하지 않습니다.
- stop 이후 텍스트는 브리지에서 제거합니다. CLI 생성이 즉시 끝나는 것은 아니므로 추가 사용량이 발생할 수 있습니다.
- 네이티브 터먹스 exec 경로는 공식 잔량 조회와 모델 자동 열거를 지원하지 않습니다. `codex-default` 또는 직접 입력한 모델 ID를 사용합니다.
- 로컬 기록·모델·추론 설정은 같은 서버에서 공유하며 사용자별 분리는 지원하지 않습니다. 설정 저장은 서버 관리자에게만 허용합니다.
- 프롬프트는 응답 생성을 위해 CLI를 통해 OpenAI로 전송됩니다. CLI 사용량은 기존 계정 한도를 사용합니다.
- 로컬 포트는 `127.0.0.1`에만 열고 브라우저 Origin을 차단합니다. 같은 컴퓨터의 프로세스까지 인증하는 기능은 없습니다.

## 설정

| 환경 변수 | 용도 |
| --- | --- |
| `ST_CODEX_CHAT_PORT` | 기본 포트 `7861` 변경 |
| `ST_CODEX_CHAT_BIN` | `codex` 실행파일 또는 `codex.js` 절대 경로 |
| `ST_CODEX_CHAT_TRANSPORT` | `app-server` 또는 `exec`. 보통 자동 감지에 맡김 |

환경 변수 이름은 기존 호환성을 위해 유지합니다. 포트를 바꾸면 재시작 후 팝업에서 새 주소를 대화 연결에 입력하세요.

## 업데이트·제거

서버 종료 후 각 저장소 폴더에서 `git pull --ff-only`를 실행하고 서버 재시작·브라우저 새로고침을 모두 하세요. 서버와 사용량 확장은 같은 버전 조합을 사용하세요. `data/`와 `workspace/`는 Git에서 제외됩니다.

제거할 때는 서버 종료 후 설치한 두 폴더를 삭제합니다. 기록 보존이 필요하면 먼저 `data/`를 백업하세요. 다른 서버 플러그인이 있을 수 있으므로 `enableServerPlugins`는 임의로 끄지 마세요.

## 검증 상태

Windows CLI 0.169.0으로 기존 ChatGPT 로그인·모델 8개·공식 5시간/주간 잔량·한국어 역할극·실제 토큰 수신을 확인했습니다. 독립 브라우저 검증 페이지에서 PC 1200px·모바일 너비 390px 각각 19개 점검이 통과했습니다. 이 브라우저 검증은 모의 CLI와 SillyTavern과 같은 선택자를 가진 폼을 사용했습니다.

**실제 SillyTavern 전체 대화 흐름, macOS/Linux 실기기, Android 네이티브 터먹스는 미검증입니다.** 모바일 너비 검증은 실제 Android 실행을 뜻하지 않습니다.

```sh
npm test
```

모의 CLI를 쓰는 브리지 회귀 테스트 11개가 포함됩니다. 실제 로그인이나 API 키 없이 실행할 수 있습니다. [터먹스 안내](docs/TERMUX.md) · [공식 App Server 문서](https://learn.chatgpt.com/docs/app-server)

## 라이선스

MIT. 이 저장소 코드에 적용됩니다. Codex CLI·SillyTavern·연결 서비스의 라이선스와 이용 조건은 각각 따릅니다.
