# Codex Bridge

**공식 Codex CLI를 SillyTavern 대화에 연결하는 서버 플러그인입니다.**

기존 ChatGPT 로그인을 사용하며 별도 API 키는 필요하지 않습니다. [Codex Usage](https://github.com/STLoft/Codex-Usage)를 함께 설치하면 잔량·사용 기록을 확인하고 모델을 선택할 수 있습니다.

## 내 환경에 맞는 설치 안내

| 사용 환경 | 안내 |
| --- | --- |
| Windows PC | [데스크탑 설치](docs/DESKTOP.md) |
| macOS / Linux | [데스크탑 설치](docs/DESKTOP.md) |
| Android Termux에서 SillyTavern 실행 | [Termux 설치](docs/TERMUX.md) |
| 설치는 끝났고 연결만 설정하려는 경우 | [모델 선택·첫 연결](docs/CONNECTION.md) |

## 설치

처음 설치한다면 위의 단계별 안내를 따라 주세요. 아래는 설치 순서 요약입니다.

1. **Codex CLI 로그인 확인** — SillyTavern 서버를 실행하는 기기에서 `codex --version`과 `codex login status`를 확인합니다. 로그인 전이라면 `codex login`으로 ChatGPT 로그인을 완료하세요.
2. **SillyTavern 종료** — 브라우저뿐 아니라 서버도 종료합니다.
3. **두 구성요소 설치** — `server.js`와 `config.yaml`이 있는 SillyTavern 폴더에서 실행합니다.

```sh
git clone https://github.com/STLoft/Codex-Bridge.git plugins/Codex-Bridge
git clone https://github.com/STLoft/Codex-Usage.git public/scripts/extensions/third-party/Codex-Usage
```

4. **서버 플러그인 켜기** — `config.yaml`을 백업하고 `enableServerPlugins: true`로 설정합니다. 같은 항목을 중복해서 추가하지 마세요.
5. **다시 시작** — SillyTavern 서버를 켜고 브라우저를 새로고침합니다. 별도 브리지 서버나 추가 `npm install`은 필요 없습니다.

서버 플러그인은 CLI 연결을, 사용량 확장은 화면 표시를 담당하므로 **둘 다 필요합니다.** 사용량 확장을 확장 설치 창으로 이미 설치했다면 두 번째 Git 명령은 생략하세요.

## 대화 연결하기

1. 확장 설정의 **Codex Usage**를 엽니다.
2. 원하는 모델을 선택하고 **대화 연결에 입력**을 누릅니다.
3. SillyTavern API 화면에서 다음을 확인하고 **연결**을 누릅니다.

| 항목 | 값 |
| --- | --- |
| API | Chat Completion |
| Source | Custom (OpenAI-compatible) |
| URL | `http://127.0.0.1:7861/v1` |
| Model | 팝업에서 선택한 모델 |
| API Key | 비워 두기 |

자세한 모델·추론 설정은 [첫 연결 안내](docs/CONNECTION.md)를 참고하세요.

## 사용량·모델

- **계정 잔량** — 5시간·주간 잔량과 리셋 시각을 표시합니다. CLI가 제공하지 않은 항목은 `미제공`, 조회 실패는 `조회 불가`로 표시하며 실제 `0% 남음`과 구분합니다.
- **토큰 기록** — 이 브리지를 거친 요청의 사용량만 표시합니다. 같은 계정의 다른 Codex 사용은 계정 잔량에 영향을 줄 수 있습니다.
- **모델 목록** — 서버 시작 시 한 번 자동 조회하고, 이후에는 **모델 새로고침**을 눌렀을 때만 갱신합니다. 기존 선택은 유지합니다.

## 업데이트

서버를 종료한 뒤 SillyTavern 폴더에서 실행합니다.

```sh
git -C plugins/Codex-Bridge pull --ff-only
git -C public/scripts/extensions/third-party/Codex-Usage pull --ff-only
```

서버를 다시 켜고 브라우저도 새로고침하세요. 기존 사용 기록과 설정은 유지됩니다. 이전 개발용 ZIP을 설치했던 경우에는 [중복 설치 정리 안내](docs/TROUBLESHOOTING.md#이미-설치되어-있다고-나와요)를 먼저 확인하세요.

## 알아둘 점

- 텍스트 대화 전용이며 **Temperature·Top-p는 적용되지 않습니다. 최대 토큰은 길이 안내로만 전달됩니다.**
- Termux에서도 모델·잔량 조회를 시도합니다. 성공하면 표시하고 실패하면 조회 불가로 안내합니다. [사용 방법](docs/TERMUX.md#잔량모델-조회)을 확인하세요.
- 개발 베타입니다. **Windows·Android 에뮬레이터에서 연결 확인 · 실제 휴대폰 미검증**. macOS/Linux 실기기도 아직 검증하지 않았습니다.
- OpenAI 또는 SillyTavern의 공식 확장은 아닙니다. 로그인 정보는 설치된 CLI가 관리하고, 응답 생성 시 대화는 CLI를 통해 OpenAI로 전송됩니다.

막히는 부분이 있다면 [설치·연결 문제 해결](docs/TROUBLESHOOTING.md)을 확인하세요.

## 라이선스

[MIT](LICENSE)
