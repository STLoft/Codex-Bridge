# 데스크탑 설치: Windows · macOS · Linux

PC에서 SillyTavern 서버를 실행하는 경우의 설치 안내입니다.

Windows의 실제 Codex CLI 0.169.0 연결을 검증했습니다. macOS/Linux 실기기에서는 아직 검증하지 않았습니다.

## 1. 준비물 확인하기

다음 항목이 필요합니다.

| 준비물 | 확인 방법 |
| --- | --- |
| 정상적으로 켜지는 SillyTavern | 평소 사용하는 주소로 접속할 수 있는지 확인 |
| Node.js 20 이상 | 터미널에서 `node --version` |
| Git | 터미널에서 `git --version` |
| 공식 Codex CLI | 터미널에서 `codex --version` |
| Codex를 사용할 수 있는 ChatGPT 계정 | 아래 로그인 단계에서 사용 |

**터미널**은 명령어를 입력하는 창입니다. Windows에서는 PowerShell 또는 명령 프롬프트, macOS에서는 터미널 앱, Linux에서는 사용 중인 터미널을 열면 됩니다. 명령은 SillyTavern 채팅 입력창이 아니라 이 창에 입력합니다.

Codex CLI가 없다면 [OpenAI 공식 설치 안내](https://learn.chatgpt.com/docs/codex/cli)를 참고하세요. Node/npm이 이미 설치된 PC에서는 npm으로 설치할 수 있습니다.

```sh
npm install -g @openai/codex
codex --version
```

설치 후 명령을 찾지 못하면 터미널을 닫고 다시 열어 보세요. 이 확장이 실제 검증한 버전은 **0.169.0**이며, 다른 CLI 버전에서 오류가 나면 오류 메시지와 버전을 함께 확인하세요. 이미 CLI가 정상 작동한다면 다시 설치할 필요가 없습니다.

## 2. Codex CLI에 ChatGPT로 로그인하기

같은 터미널에서 실행합니다.

```sh
codex login status
```

이미 ChatGPT로 로그인되어 있으면 다음 단계로 넘어갑니다. 아직 로그인하지 않았거나 API 키 방식으로 로그인했다면 ChatGPT 로그인으로 연결하세요.

```sh
codex login
```

브라우저가 열리면 사용할 ChatGPT 계정으로 로그인을 완료합니다. 완료 후 다시 확인합니다.

```sh
codex login status
```

브라우저가 자동으로 열리지 않거나 로그인 후 터미널로 돌아오지 못하면 [로그인 문제 해결](TROUBLESHOOTING.md#로그인-창이-열리지-않거나-완료되지-않아요)을 참고하세요. **인증 파일이나 토큰을 복사·붙여넣는 절차는 없습니다.** 로그인은 [공식 CLI의 인증 기능](https://learn.chatgpt.com/docs/auth?surface=cli)을 사용합니다.

SillyTavern을 다른 운영체제 사용자, 관리자 계정, WSL 또는 컨테이너에서 실행한다면 그 환경의 CLI 로그인은 별개일 수 있습니다. **SillyTavern 서버를 실행하는 환경에서** 위 명령이 작동해야 합니다.

## 3. SillyTavern 서버 종료하기

브라우저 탭만 닫으면 서버가 계속 실행 중일 수 있습니다. SillyTavern을 실행한 터미널에서 `Ctrl+C`로 종료하거나 평소 사용하는 종료 방법을 이용하세요.

## 4. SillyTavern 폴더로 이동하기

`server.js`, `package.json`, `config.yaml`, `public`, `plugins`가 있는 폴더를 찾습니다. Windows에서는 보통 `Start.bat`도 보입니다. 이 폴더를 **SillyTavern 루트 폴더**라고 부릅니다.

Windows PowerShell의 예시입니다. 경로는 실제 설치 위치로 바꿔 주세요.

```powershell
cd "C:\SillyTavern"
```

macOS/Linux에서 홈 폴더에 설치했다면:

```sh
cd "$HOME/SillyTavern"
```

`config.yaml`이 없다면 SillyTavern을 한 번 정상 실행한 뒤 종료해서 설정 파일을 생성하세요. 다른 폴더에 같은 이름의 파일을 새로 만들지 마세요.

## 5. 두 구성요소 설치하기

SillyTavern 루트 폴더에 있는 터미널에서 다음 두 명령을 순서대로 실행합니다.

```sh
git clone https://github.com/STLoft/Codex-Bridge.git plugins/Codex-Bridge
git clone https://github.com/STLoft/Codex-Usage.git public/scripts/extensions/third-party/Codex-Usage
```

| 설치되는 것 | 하는 일 |
| --- | --- |
| `plugins/Codex-Bridge` | 서버에서 Codex CLI를 실행하고 대화를 연결 |
| `public/scripts/extensions/third-party/Codex-Usage` | 브라우저에 사용량 팝업·모델 선택 표시 |

복사가 끝나면 설치 완료입니다. **이 두 저장소에는 추가 `npm install`이 필요하지 않습니다.**

사용량 확장을 SillyTavern의 확장 설치 창으로 설치했다면 두 번째 명령은 실행하지 않아도 됩니다. 서버 플러그인은 그 창으로 설치되지 않으므로 첫 번째 설치는 필요합니다. 이미 폴더가 있다는 오류가 나면 [업데이트 방법](TROUBLESHOOTING.md#이미-설치되어-있다고-나와요)을 확인하세요.

## 6. 서버 플러그인 사용 켜기

SillyTavern 루트의 `config.yaml`을 복사해서 백업해 둡니다. 그다음 메모장이나 텍스트 편집기로 원본을 열고 `enableServerPlugins`를 찾습니다.

```yaml
enableServerPlugins: true
```

`false`라면 `true`로 바꾸고 저장합니다. 이미 `true`이면 그대로 둡니다. 같은 항목을 중복해서 추가하지 마세요. 기존 항목이 없을 때만 들여쓰기 없는 맨 바깥 줄에 한 번 추가합니다.

## 7. 서버 재시작하고 대화 연결하기

평소 사용하던 `Start.bat`, `start.sh` 또는 실행 명령으로 SillyTavern을 다시 시작합니다. 별도 브리지 터미널을 따로 켤 필요는 없습니다. 서버 로그에 다음과 비슷한 줄이 나오면 브리지가 시작된 것입니다.

```text
[Codex Bridge] v0.1.0 http://127.0.0.1:7861/v1
```

브라우저에서 SillyTavern을 새로고침하고 [처음 연결·모델 선택 안내](CONNECTION.md)에 따라 연결하세요.

## 업데이트할 때

SillyTavern 서버를 종료한 뒤 **루트 폴더**에서 실행합니다.

```sh
git -C plugins/Codex-Bridge pull --ff-only
git -C public/scripts/extensions/third-party/Codex-Usage pull --ff-only
```

서버를 다시 켜고 브라우저도 새로고침합니다. `plugins/Codex-Bridge/data/`의 사용 기록·설정은 Git 업데이트 대상이 아닙니다. 두 저장소는 호환되는 같은 버전 조합을 사용하세요.

문제가 생기면 [문제 해결 안내](TROUBLESHOOTING.md)에서 현재 표시와 같은 항목을 찾아보세요.
