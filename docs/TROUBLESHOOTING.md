# 설치·연결 문제 해결

## 팝업 버튼이 없어요

사용량 확장 **Codex Usage**가 설치·활성화되어 있는지 확인하고 브라우저를 새로고침하세요. 서버 플러그인만 설치하면 브라우저에 팝업이 생기지 않습니다. [사용량 확장 설치 안내](https://github.com/STLoft/Codex-Usage#설치)를 확인하세요.

## 팝업에서 서버 플러그인을 설치하라고 해요

사용량 확장만 설치했을 수 있습니다. SillyTavern 서버가 실행되는 기기에 `plugins/Codex-Bridge/index.js`가 있어야 합니다. `config.yaml`의 `enableServerPlugins: true`도 확인하고 서버를 재시작하세요. 브라우저 새로고침만으로는 서버 플러그인이 로드되지 않습니다.

폴더 안에 `Codex-Bridge-main/Codex-Bridge-main/index.js`처럼 폴더가 한 겹 더 들어가 있지 않은지도 확인하세요. 올바른 위치는 `plugins/Codex-Bridge/index.js`입니다.

## Codex CLI를 찾지 못한다고 해요

**SillyTavern 서버를 실행하는 터미널·사용자 계정에서** `codex --version`을 실행하세요. 작동하지 않으면 CLI 설치와 PATH부터 확인합니다. 설치 후 터미널과 SillyTavern 서버를 다시 시작해 보세요.

Windows PowerShell에서 `codex.ps1` 실행 정책 오류가 난다면 `codex.cmd --version`과 `codex.cmd login status`로 확인할 수 있습니다. 확장은 npm 래퍼의 JS 진입점을 직접 실행하므로 PowerShell 실행 정책을 바꿀 필요가 없습니다.

PATH로 찾지 못하는 설치는 `ST_CODEX_CHAT_BIN`에 실제 `codex` 실행파일 또는 `codex.js` 절대 경로를 지정할 수 있습니다. [데스크탑](DESKTOP.md) · [Termux](TERMUX.md)에서 환경이 맞는지 확인하세요.

## 로그인 창이 열리지 않거나 완료되지 않아요

기본 로그인은 터미널에서 `codex login`입니다. 브라우저 자동 열기나 localhost 리디렉션이 어려운 환경에서는 CLI가 지원하면 다음을 사용합니다.

```sh
codex login --device-auth
```

터미널에 나온 주소를 브라우저로 열고 표시된 일회용 코드를 입력합니다. 해당 계정·워크스페이스에서 기기 코드 로그인이 허용되어 있어야 합니다. 자세한 조건은 [공식 인증 안내](https://learn.chatgpt.com/docs/auth?surface=cli#login-on-headless-devices)를 참고하세요.

완료 후 `codex login status`로 확인합니다. 이 확장에는 토큰 입력 칸이 없으며 인증 파일을 복사하는 방식도 안내하지 않습니다. Windows·WSL·컨테이너·Termux는 서로 다른 로그인 환경일 수 있습니다.

## 로그인했는데 팝업에서는 로그인 필요로 나와요

다른 계정·터미널 환경에서 로그인했는지, API 키 로그인인지 확인하세요. 이 연결은 기존 **ChatGPT 로그인**을 사용합니다. 같은 환경에서 `codex login status`를 확인하고 서버 재시작 후 팝업의 상단 **새로고침**을 누릅니다.

모델 목록도 비어 있다면 **모델 옆 새로고침 아이콘**을 따로 눌러 주세요. 서버 시작 시 모델 조회에 실패해도 자동 반복 조회하지 않습니다.

## 모델이 없거나 모델을 선택해도 오류가 나요

데스크탑은 CLI 로그인 확인 후 **모델 옆 새로고침 아이콘**을 누릅니다. CLI 목록은 카탈로그이므로 해당 계정에 모든 모델의 접근 권한이 있다는 뜻은 아닙니다. 다른 모델을 선택해 짧은 대화로 확인하세요.

Termux도 기본 app-server 연결로 조회합니다. 조회 실패 시 마지막 목록과 선택은 유지하며, CLI에서 작동하는 모델 ID를 직접 입력할 수 있습니다. 이전의 `codex-default` 선택은 CLI 기본 모델 별칭으로 계속 사용할 수 있습니다.

## 5시간 또는 주간 잔량이 미제공으로 나와요

CLI가 그 항목을 제공하지 않았거나 조회에 실패했다는 뜻입니다. **잔량이 0이라는 뜻이 아닙니다.** 실제 잔량이 0이면 `0%`으로 표시합니다. Termux도 같은 app-server 조회를 사용하며, 잔량 조회 실패가 대화 생성을 막지는 않습니다.

토큰 기록은 계정 잔량과 별개입니다. CLI가 대화 이벤트에 토큰을 주면 기록하고, 주지 않은 값은 `—`로 표시합니다.

## 모델을 눌렀는데 대화가 안 돼요

모델 행을 누르거나 상태 카드의 **연결**을 누르면 API 설정에 주소·모델이 입력됩니다. SillyTavern API 연결 화면에서도 **연결**을 눌렀는지 확인하세요. Chat Completion → Custom (OpenAI-compatible), URL의 끝이 `/v1`, 선택 모델 ID, 비어 있는 API Key를 확인합니다. [처음 연결 안내](CONNECTION.md)를 다시 따라 주세요.

## 포트가 이미 사용 중이라고 나와요

다른 브리지 인스턴스나 구형 설치가 같은 `7861` 포트를 쓰고 있는지 확인하세요. 기존 개발용 `ST-Codex-Bridge`와 새 `Codex-Bridge`를 함께 로드하지 마세요.

다른 프로그램이 포트를 사용한다면 SillyTavern 서버를 시작하기 전에 포트를 바꿀 수 있습니다. 예를 들어 `7862`를 쓰려면:

Windows PowerShell:

```powershell
$env:ST_CODEX_CHAT_PORT = '7862'
```

macOS/Linux/Termux:

```sh
export ST_CODEX_CHAT_PORT=7862
```

**변수를 설정한 같은 터미널에서** 평소 명령으로 SillyTavern을 시작하고, 팝업의 새 주소를 대화 연결에 다시 입력하세요. 다른 창에서 시작하면 이 설정을 받지 못할 수 있습니다.

## 이미 설치되어 있다고 나와요

`destination path ... already exists`는 같은 경로가 이미 있다는 뜻입니다. 정상 Git 설치라면 SillyTavern 서버를 종료한 뒤 루트 폴더에서 업데이트합니다.

```sh
git -C plugins/Codex-Bridge pull --ff-only
git -C public/scripts/extensions/third-party/Codex-Usage pull --ff-only
```

서버 재시작과 브라우저 새로고침을 모두 하세요. 직접 수정한 파일 때문에 업데이트가 거절되면 먼저 수정 내용을 백업·확인하세요. 파일을 강제로 초기화하거나 폴더를 지울 필요는 없습니다.

이전 ZIP의 `ST-Codex-Bridge` 폴더에서 옮기는 경우에는 서버 종료 후 `data/`를 백업하고 구형 폴더를 **SillyTavern의 plugins 폴더 밖으로** 옮긴 다음 새 저장소를 설치합니다. 사용량 확장도 구형 폴더를 extensions 폴더 밖에 보관해 중복 로드를 피하세요.

## 업데이트했는데 버전이 다르다고 나와요

서버 플러그인과 사용량 확장 중 한쪽만 업데이트했거나, 서버 재시작·브라우저 새로고침 중 하나가 빠졌을 수 있습니다. 두 저장소를 확인하고 둘 다 다시 시작·새로고침하세요.

## Temperature나 최대 토큰 설정이 예상대로 작동하지 않아요

현재 연결은 Temperature·Top-p를 CLI에 전달하지 않습니다. 최대 토큰은 답변 길이 지시로만 전달하며 강제 상한이 아닙니다. 추론은 팝업 **설정 → 연결 프로필별 추론 설정**에서 프로필을 고르고 **이 프로필에 저장**을 누르세요. 프로필 목록이 비어 있다면 Codex 주소·모델을 SillyTavern 연결 프로필로 먼저 저장하고 Connection Manager를 활성화하세요.

## 버그를 제보하려면

사용한 OS, SillyTavern 버전, `codex --version`, 브리지·확장 버전, 재현 순서와 오류 메시지를 알려 주세요. Termux는 Android·Termux 버전, proot 사용 여부와 CLI 빌드 정보도 도움이 됩니다. **API 키·토큰·인증 파일·개인 대화 원문은 올리지 마세요.**
