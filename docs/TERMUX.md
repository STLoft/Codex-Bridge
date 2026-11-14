# Android 네이티브 터먹스 설치 안내 — 실기기 미검증

**Android/터먹스에서는 아직 실제 실행을 검증하지 않았습니다.** Windows에서 모의 CLI로 exec 인수, 표준입력, 응답·토큰 처리를 검증했습니다. 이 결과는 Android 바이너리 호환성, 샌드박스 작동, 실제 로그인·네트워크 연결 검증을 뜻하지 않습니다.

PC의 SillyTavern에 휴대폰 브라우저로 접속하는 경우에는 이 안내가 아니라 [서버 설치 안내](../README.md#설치)를 사용하세요. 이 안내는 SillyTavern 서버와 Codex CLI를 모두 Android 네이티브 터먹스에서 실행하는 경우입니다.

## 먼저 확인할 것

이미 작동하는 SillyTavern, Node.js 20 이상, Android 환경에서 실행 가능한 Codex CLI 빌드가 필요합니다. 일반 PC용 CLI 패키지가 네이티브 Android에서 작동한다고 가정하지 않습니다. CLI 바이너리 설치와 Android용 빌드 제공은 이 저장소에 포함하지 않습니다.

```sh
node --version
codex --version
codex exec --help
codex login status
```

CLI가 `exec --json`, `--ephemeral`, `--ignore-user-config`, `--ignore-rules`, `--sandbox read-only`, `--skip-git-repo-check`, `--cd`, 표준입력 프롬프트 `-`를 지원해야 합니다. 지원하지 않는 빌드에서는 오류를 그대로 표시하며, 샌드박스나 도구 제한을 풀어서 재시도하지 않습니다. 로그인은 같은 터먹스 사용자의 기존 CLI ChatGPT 로그인을 사용하세요. 필요하면 `codex login --help`에 표시된 해당 빌드의 로그인 방식을 사용합니다. 인증 파일을 가져오거나 토큰을 직접 입력하는 기능은 없습니다.

## 설치

SillyTavern 서버를 종료한 뒤 SillyTavern 루트에서 설치합니다.

```sh
git clone https://github.com/STLoft/Codex-Bridge.git plugins/Codex-Bridge
git clone https://github.com/STLoft/Codex-Usage.git public/scripts/extensions/third-party/Codex-Usage
```

`config.yaml`을 백업한 뒤 `enableServerPlugins: true`를 설정하세요. 별도 npm 의존성 설치는 필요 없습니다.

터먹스 Node가 Android 플랫폼을 보고하거나 `TERMUX_VERSION`, `PREFIX`가 터먹스를 나타내면 exec 경로를 자동 선택합니다. 컨테이너·proot 등 자동 감지가 맞지 않는 환경에서 네이티브 exec 경로를 의도적으로 선택하려면 서버 시작 전에 설정하세요.

```sh
export ST_CODEX_CHAT_TRANSPORT=exec
```

필요할 때 실행파일 절대 경로를 지정할 수 있습니다.

```sh
export ST_CODEX_CHAT_BIN="$HOME/bin/codex"
```

환경 변수 설정을 유지한 터미널에서 평소 방식으로 SillyTavern을 시작합니다. 브라우저 새로고침 → Codex Bridge 사용량 팝업 → `codex-default` 선택 또는 모델 ID 직접 입력 → **대화 연결에 입력** → API 화면 **연결**.

## PC와 다른 점

- `app-server` 대신 `codex exec -`를 사용하며 캐릭터 지시문과 대화를 표준입력으로 전달합니다.
- 공식 잔량 조회는 지원하지 않습니다. 팝업에 미지원 안내를 표시하며 `0%`로 표시하지 않습니다.
- 모델 자동 열거는 지원하지 않습니다. `codex-default`는 CLI 기본 모델을 의미하는 브리지용 별칭입니다. CLI가 지원하는 모델 ID를 직접 입력할 수 있습니다.
- CLI가 `turn.completed`에 토큰 수를 제공하면 사용량을 기록합니다. 제공하지 않으면 `—`와 미제공 건수로 표시합니다.
- exec의 완료 메시지를 SSE로 전달하므로 글자 단위로 부드럽게 출력되지 않을 수 있습니다.
- 모델 목록의 서버 시작/수동 갱신 규칙은 동일하지만 갱신 결과는 기본 모델 별칭입니다.

실기기 검증 때는 CLI 버전, Android·터먹스 버전, 선택 모델, 로그인 상태, 일반 응답·SSE·취소·토큰 수신 여부를 기록하세요. 로그인 정보·토큰·대화 원문은 보고용으로 공유하지 마세요.
