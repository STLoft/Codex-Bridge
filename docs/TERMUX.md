# Android Termux 설치 안내

**Windows에서 연결 동작 확인 · Termux 실기기 미검증**

## 어떤 사용 방식인가요?

| 사용 방식 | 따라갈 안내 |
| --- | --- |
| PC에서 SillyTavern을 켜고 휴대폰 브라우저로 접속 | [데스크탑 설치](DESKTOP.md). 휴대폰에 CLI를 설치하지 않음 |
| Termux 안에서 SillyTavern과 Codex CLI를 모두 실행 | 이 안내 |
| proot·컨테이너 안에서 서버를 실행 | 해당 환경 안에서 CLI·로그인·실행 방식을 별도 확인. 현재 미검증 |

아래는 **Termux에서 SillyTavern이 이미 작동하고 `codex --version`도 실행되는 환경**을 전제로 합니다. 이 저장소는 Codex CLI 바이너리나 Android 빌드를 제공하지 않습니다. 일반 PC용 npm 패키지가 Android에서 작동한다고 가정하지 않습니다. CLI 실행부터 실패한다면 확장 설치 전에 해당 빌드의 Android 지원을 먼저 확인하세요.

## 1. 같은 Termux에서 준비 상태 확인하기

SillyTavern을 실행할 Termux 세션에서 한 줄씩 실행합니다.

```sh
node --version
git --version
codex --version
codex exec --help
```

Node.js는 20 이상이 필요합니다. CLI가 없거나 바이너리 실행 오류가 나면 CLI 설치를 먼저 해결하세요. CLI 실행파일을 브리지 폴더에 복사해 넣을 필요는 없습니다.

CLI는 `exec --json`, `--ephemeral`, `--ignore-user-config`, `--ignore-rules`, `--skip-git-repo-check`, `--sandbox read-only`, `--cd`, 표준입력 프롬프트 `-`를 지원해야 합니다. PC 검증 버전은 0.169.0이며 Android 빌드의 호환성은 별도로 확인해야 합니다. 지원하지 않는 옵션이 있으면 오류를 표시하며 도구·샌드박스 제한을 풀어서 재시도하지 않습니다.

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

## 6. exec 경로로 서버 시작하기

일반 Termux는 Android 플랫폼·`TERMUX_VERSION`·`PREFIX`를 보고 **exec 경로를 자동 선택**합니다.

자동 감지가 맞지 않는 환경에서 exec 경로를 직접 선택하려면 서버 시작 전에 설정합니다.

```sh
export ST_CODEX_CHAT_TRANSPORT=exec
```

**이 변수를 설정한 같은 터미널에서** 평소 방식으로 SillyTavern을 시작합니다. `start.sh`를 사용하고 있었다면:

```sh
bash start.sh
```

별도 브리지 서버를 따로 켤 필요는 없습니다. 환경 변수는 현재 터미널에 적용되므로 새 터미널에서도 강제 설정이 필요하면 다시 설정하세요.

CLI가 PATH에 없지만 실제 실행파일 위치를 알고 있다면 시작 전에 지정할 수 있습니다. 아래 경로는 실제 경로로 바꿔 주세요.

```sh
export ST_CODEX_CHAT_BIN="$HOME/bin/codex"
```

이 변수는 Android에서 실행 가능한 CLI 자체가 없는 문제를 해결하는 기능은 아닙니다.

## 7. 브라우저에서 연결하기

1. 평소 SillyTavern 주소로 접속하고 새로고침합니다.
2. 확장 설정 **Codex Usage** 또는 마법봉 **Codex Usage**를 엽니다.
3. **Codex CLI 기본 모델**(`codex-default`)을 선택하거나, CLI에서 작동하는 모델 ID를 직접 입력합니다.
4. **대화 연결에 입력**을 누릅니다.
5. API 화면에서 Custom (OpenAI-compatible), URL `http://127.0.0.1:7861/v1`, 비어 있는 API Key를 확인하고 **연결**을 누릅니다.
6. 짧은 대화를 보내 보고 **요청별 토큰 기록**을 확인합니다.

추론 설정과 팝업 읽는 방법은 [처음 연결 안내](CONNECTION.md)를 참고하세요.

## 잔량·모델 조회가 제한되는 이유

현재 확장은 Termux에서 대화 생성을 `codex exec`로 처리합니다. 공식 잔량과 모델 목록을 가져오는 조회 기능은 `codex app-server` 연결에만 구현되어 있어, 이 기본 연결에서는 조회를 건너뜁니다.

**현재 확장의 구현 범위에 따른 제한입니다.** 설치된 Termux용 CLI에서 app-server가 실행되고 조회 요청에 정상 응답한다면 잔량·모델 목록을 가져오는 방식도 검토할 수 있습니다. 실제 Termux에서의 동작은 아직 확인하지 않았습니다.

대화는 exec로 유지하고 조회만 별도 app-server로 처리하는 구조가 후보입니다. 이 분리 조회 기능은 현재 배포본에는 구현되어 있지 않습니다. 공식 조회 항목은 [OpenAI App Server 문서](https://learn.chatgpt.com/docs/app-server)의 `account/rateLimits/read`와 `model/list`입니다.

## Termux에서는 무엇이 다른가요?

| 항목 | Termux exec 경로 |
| --- | --- |
| 대화 생성 | `codex exec -`, 지시문·대화를 표준입력으로 전달 |
| 공식 5시간·주간 잔량 | 현재 exec 연결에서는 미지원. 미지원·미제공은 0%를 뜻하지 않음 |
| 자동 모델 목록 | 현재 exec 연결에서는 미지원. `codex-default` 또는 직접 입력 |
| 요청별 토큰 | CLI가 제공하면 기록. 미제공 항목은 `—` |
| 스트리밍 | 완료 메시지 단위로 전달되어 글자별로 부드럽게 나오지 않을 수 있음 |
| 모델 새로고침 | 기본 모델 별칭을 다시 제공하며 실제 계정 모델 목록은 열거하지 않음 |

## 업데이트하기

서버 종료 후 SillyTavern 루트에서 실행합니다.

```sh
git -C plugins/Codex-Bridge pull --ff-only
git -C public/scripts/extensions/third-party/Codex-Usage pull --ff-only
```

서버를 다시 켜고 브라우저도 새로고침합니다. `data/`의 기록·설정은 Git 업데이트 대상이 아닙니다. 오류가 나면 [문제 해결](TROUBLESHOOTING.md)을 확인하세요.

제보할 때 Android·Termux·CLI 버전과 proot 사용 여부를 알려 주세요. 개인 대화와 인증 정보는 올리지 마세요.
