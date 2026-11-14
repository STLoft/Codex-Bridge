# Android Termux 설치 안내

**Windows·Android 에뮬레이터에서 연결 확인 · 실제 휴대폰 미검증**

아래는 **Termux에서 SillyTavern이 이미 작동하고 `codex --version`도 실행되는 환경**을 전제로 합니다. 이 저장소는 Codex CLI 바이너리나 Android 빌드를 제공하지 않습니다. 일반 PC용 npm 패키지가 Android에서 작동한다고 가정하지 않습니다. CLI 실행부터 실패한다면 확장 설치 전에 해당 빌드의 Android 지원을 먼저 확인하세요.

## 1. 같은 Termux에서 준비 상태 확인하기

CLI가 없다면 Termux 패키지 저장소에서 설치할 수 있습니다. 이미 필요한 패키지가 정상 작동한다면 다시 설치할 필요는 없습니다.

```sh
pkg update
pkg install nodejs-lts git codex
```

패키지를 찾지 못하면 Termux와 패키지 저장소를 먼저 확인하세요.

SillyTavern을 실행할 Termux 세션에서 한 줄씩 실행합니다.

```sh
node --version
git --version
codex --version
codex app-server --help
```

Node.js는 20 이상이 필요합니다. CLI가 없거나 바이너리 실행 오류가 나면 CLI 설치를 먼저 해결하세요. CLI 실행파일을 브리지 폴더에 복사해 넣을 필요는 없습니다.

Windows와 Android 에뮬레이터에서 확인한 CLI 버전은 **0.169.0**입니다. 다른 버전·기기에서는 호환성을 별도로 확인해야 합니다.

## 2. ChatGPT 로그인하기

```sh
codex login status
```

이미 ChatGPT 로그인 상태라면 다음 단계로 넘어갑니다. 아직 로그인하지 않았다면 같은 Termux에서 실행합니다.

```sh
codex login
```

브라우저 자동 열기나 localhost 콜백이 어려운 환경에서는 CLI가 지원하는 경우 기기 코드 로그인을 사용할 수 있습니다.

```sh
codex login --device-auth
```

터미널의 링크를 브라우저로 열고 일회용 코드를 입력합니다. 해당 계정·워크스페이스에서 이 방식이 허용되어 있어야 합니다. [공식 로그인 안내](https://learn.chatgpt.com/docs/auth?surface=cli#login-on-headless-devices)를 참고하세요.

완료 후 `codex login status`로 확인합니다. 이 확장은 **API 키 대신 기존 ChatGPT 로그인**을 사용합니다. PC에서 인증 파일을 가져오거나 토큰을 복사·붙여넣는 절차는 없습니다.

## 3. 서버를 종료하고 설치 폴더로 이동하기

서버 실행 터미널에서 `Ctrl+C`로 종료합니다. 브라우저만 닫으면 서버가 계속 실행 중일 수 있습니다.

SillyTavern이 홈 폴더에 있다면 아래처럼 이동합니다. 다른 위치라면 실제 경로로 바꾸세요.

```sh
cd "$HOME/SillyTavern"
```

이 폴더에 `server.js`, `package.json`, `config.yaml`, `public`, `plugins`가 있는지 확인합니다. `config.yaml`이 없다면 SillyTavern을 한 번 정상 실행하고 종료하세요.

## 4. 서버 플러그인과 사용량 확장 설치하기

SillyTavern 루트에서 실행합니다.

```sh
git clone https://github.com/STLoft/Codex-Bridge.git plugins/Codex-Bridge
git clone https://github.com/STLoft/Codex-Usage.git public/scripts/extensions/third-party/Codex-Usage
```

첫 번째는 서버와 CLI를, 두 번째는 브라우저 팝업을 연결합니다. **둘 다 필요합니다.** 사용량 확장을 확장 설치 창으로 이미 설치했다면 두 번째 명령은 생략하세요. 별도 npm 의존성 설치는 필요 없습니다.

## 5. 서버 플러그인 활성화하기

SillyTavern 루트의 `config.yaml`을 백업한 뒤 텍스트 편집기로 엽니다. `enableServerPlugins`를 찾아 다음처럼 설정합니다.

```yaml
enableServerPlugins: true
```

이미 항목이 있으면 값만 바꾸고 중복으로 추가하지 마세요. 항목이 없을 때만 들여쓰기 없는 맨 바깥 줄에 한 번 추가합니다.

## 6. 서버 시작하기

데스크탑과 Termux 모두 **app-server가 기본 연결**입니다. 별도 연결 방식 설정 없이 평소 방법으로 SillyTavern을 시작합니다. `start.sh`를 사용하고 있었다면:

```sh
bash start.sh
```

이전에 exec를 강제로 설정했다면 시작 전에 `unset ST_CODEX_CHAT_TRANSPORT`를 실행하고, 셸 시작 파일에 넣었던 설정도 제거하세요. 별도 브리지 서버를 켤 필요는 없습니다.

CLI가 PATH에 없을 때만 `ST_CODEX_CHAT_BIN`에 실제 실행파일 절대 경로를 지정합니다.

## 7. 브라우저에서 연결하기

1. 평소 SillyTavern 주소로 접속하고 새로고침합니다.
2. 확장 설정 **Codex Usage** 또는 마법봉 **Codex Usage**를 엽니다.
3. **모델** 목록에서 원하는 모델을 누릅니다. 연결 주소·모델이 즉시 입력됩니다. 조회에 실패하면 로그인과 CLI 상태를 확인하고 **모델 옆 새로고침 아이콘**을 누릅니다. 알고 있는 모델 ID를 직접 입력할 수도 있습니다.
4. 목록에 없는 모델 ID나 추론 단계는 **설정**에서 입력하고 **적용**을 누릅니다.
5. API 화면에서 Custom (OpenAI-compatible), URL `http://127.0.0.1:7861/v1`, 비어 있는 API Key를 확인하고 **연결**을 누릅니다.
6. 짧은 대화를 보내 보고 **요청별 토큰 기록**을 확인합니다.

추론 설정과 팝업 읽는 방법은 [처음 연결 안내](CONNECTION.md)를 참고하세요.

## 잔량·모델 조회

대화·스트리밍·모델 목록·잔량 조회를 모두 공식 CLI의 app-server로 처리합니다. 모델은 서버 시작 시 한 번, 이후 **모델 옆 새로고침 아이콘**을 눌렀을 때만 조회하며 기존 선택을 바꾸지 않습니다.

5시간·주간 잔량과 리셋 시각은 CLI가 제공한 값을 표시합니다. 조회 실패·미제공은 실제 `0%`과 구분합니다. 잔량 조회 실패로 대화 생성을 막지 않습니다. 요청별 토큰도 CLI가 제공한 값을 기록하며 미제공 항목은 `—`입니다.

Android 17 x86_64 에뮬레이터의 Termux에서 기본 연결, 모델 8개, 5시간·주간 잔량, 일반 응답·실시간 SSE·토큰 기록·생성 도중 취소를 확인했습니다. 실제 ARM 휴대폰과 proot 환경은 아직 검증하지 않았습니다.

## 호환 옵션: exec

설치된 CLI에서 app-server 대화가 작동하지 않고 exec는 작동하는 경우에만 수동으로 선택할 수 있습니다. 실패 시 자동 전환하지 않습니다.

```sh
export ST_CODEX_CHAT_TRANSPORT=exec
```

같은 터미널에서 서버를 시작하세요. 이 옵션은 대화를 `codex exec -`로 처리하고 완성된 메시지 단위로 응답합니다. 모델은 `codex debug models`로 먼저 조회하며 실패하면 app-server로 재시도합니다. 모두 실패하면 마지막 목록 또는 `codex-default`를 유지합니다. 잔량은 별도 app-server 조회가 성공할 때 표시합니다.

기본 연결로 돌아가려면 `unset ST_CODEX_CHAT_TRANSPORT` 실행 후 서버를 다시 시작합니다.

## 업데이트하기

서버 종료 후 SillyTavern 루트에서 실행합니다.

```sh
git -C plugins/Codex-Bridge pull --ff-only
git -C public/scripts/extensions/third-party/Codex-Usage pull --ff-only
```

서버를 다시 켜고 브라우저도 새로고침합니다. `data/`의 기록·설정은 Git 업데이트 대상이 아닙니다. 오류가 나면 [문제 해결](TROUBLESHOOTING.md)을 확인하세요.

제보할 때 Android·Termux·CLI 버전과 proot 사용 여부를 알려 주세요. 개인 대화와 인증 정보는 올리지 마세요.
