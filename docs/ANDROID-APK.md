# Trip Planner Android APK

- [APK 다운로드](https://github.com/bit-O-study/trip/raw/refs/heads/main/releases/apk/trip-planner-1.3.0-debug.apk)
- 실행하면 서버의 여행 도메인(`https://trip.helthssu.co.kr`, Cloudflare 터널 → 서버 4102)을 바로 연다(WebView). 화면은 서버 배포(GitHub Actions)로 바뀌므로 화면 수정에는 APK 를 다시 만들 필요가 없다.
- SHA-256: `8002b53c60f0417ea4f01fbacc05caf3e7d9c8585bc6f98df906d91a5a936723`
- 패키지 `kr.bito.trip`, 버전 1.3.0(versionCode 5), Android 8 이상, target SDK 36, 개발용(debug) 서명 — 직접 설치용.
- 1.3.0은 PDF·JPG 일정 저장을 지원한다. 웹 배포와 별도로 APK를 업데이트해야 앱의 저장 위치 선택창을 사용할 수 있다. 여행 도메인의 최상위 화면만 파일 저장을 요청할 수 있으며, PDF/JPG 형식과 20MB 크기 제한을 검사한다. 저장 취소·실패는 화면에 안내한다.
- 1.0.0 은 Vercel(GitHub 푸시로 갱신되지 않아 예전 화면), 1.1.0 은 Tailscale IP 를 열었다. 1.2.0 부터 공개 HTTPS 도메인을 연다.

## 사용 조건

- 공개 HTTPS 도메인이라 Tailscale 없이 인터넷만 되면 열린다. HTTP·파일 접근·혼합 콘텐츠는 허용하지 않는다.
- 도메인이 바뀌면 `MainActivity.java` 의 `origin` 을 바꾸고 다시 빌드한다(관리자 앱의 프로젝트 주소 목록 `project-sites.ts` 와 같은 값).

## 구성

- 관리자 앱(BOadmin)과 같은 WebView 껍데기. 로그인 쿠키 유지, 같은 사이트 밖 링크는 외부 브라우저로 연다.
- 아이콘: 앱 로고(두 정거장을 잇는 노선)를 짙은 남색 바탕에 얹은 적응형 아이콘.
- 알려진 제한: 구글·카카오 로그인은 외부 브라우저로 넘어가 앱으로 돌아오지 않는다(구글이 WebView 안 로그인을 막고, 로그인 후 돌아올 주소(redirect)도 여행 도메인으로 등록돼 있어야 한다). 이메일·비밀번호 로그인은 앱 안에서 된다.

## 빌드

JDK 21, Android SDK 36. `android/local.properties` 에 `sdk.dir` 작성(커밋하지 않는다).

```powershell
cd android
$env:JAVA_HOME="C:\Users\NB0075\.jdks\jdk-21.0.12.1+1"; $env:ANDROID_HOME="C:\Users\NB0075\android-sdk"
./gradlew.bat assembleDebug --no-daemon
```

결과물은 `android/app/build/outputs/apk/debug/app-debug.apk`. 보관본은 `releases/apk/` 에 이름을 붙여 둔다.
버전을 올릴 때는 `android/app/build.gradle` 의 versionCode·versionName 을 올리고, 같은 PC(같은 debug 서명)에서 빌드해야 기존 앱 위에 업데이트된다.

## 검증

1.3.0 assembleDebug 및 apksigner verify 통과. 웹브라우저에서 실제 대만 여행의 Day별 JPG/PDF와 전체 5페이지 PDF 다운로드 및 한글·중문 표시를 확인했다. 연결된 Android 기기가 없어 실제 기기의 저장 위치 선택·파일 쓰기는 미검증이다.
