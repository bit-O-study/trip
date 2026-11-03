# Trip Planner Android APK

- [APK 다운로드](https://github.com/bit-O-study/trip/raw/refs/heads/main/releases/apk/trip-planner-1.1.0-debug.apk)
- 실행하면 서버(`http://100.97.115.109:4102`)를 바로 연다(WebView). 화면은 서버 배포로 바뀌므로 화면 수정에는 APK 를 다시 만들 필요가 없다.
- SHA-256: `e49c23068372bb9341264c042131757279efbf651b68dc1da57b40d595d913fc`
- 패키지 `kr.bito.trip`, 버전 1.1.0(versionCode 2), Android 8 이상, target SDK 36, 개발용(debug) 서명 — 직접 설치용.
- 1.0.0 은 Vercel 주소를 열었지만 Vercel 은 GitHub 푸시로 갱신되지 않아 예전 화면이 나와서 서버 주소로 바꿨다.

## 사용 조건

- 서버 주소는 Tailscale 안에서만 열린다. **휴대폰에 Tailscale 앱을 설치하고 같은 계정(tailnet)으로 연결**해야 한다. 연결이 안 되면 "서버에 연결할 수 없습니다" 안내가 뜬다.
- 평문(HTTP)은 서버 주소 하나에만 허용한다(`res/xml/network_security_config.xml`). 이 구간은 Tailscale(WireGuard)이 암호화한다. 다른 모든 주소는 HTTPS 만 쓴다.
- 공개 HTTPS 주소가 생기면 `MainActivity.java` 의 `origin` 과 network_security_config 를 바꾸고 다시 빌드한다.

## 구성

- 관리자 앱(BOadmin)과 같은 WebView 껍데기. 로그인 쿠키 유지, 같은 사이트 밖 링크는 외부 브라우저로 연다, 파일 접근·혼합 콘텐츠 불허.
- 아이콘: 앱 로고(두 정거장을 잇는 노선)를 짙은 남색 바탕에 얹은 적응형 아이콘.
- 알려진 제한: 구글·카카오 로그인은 외부 브라우저로 넘어가 앱으로 돌아오지 않는다(구글이 WebView 안 로그인을 막고, 로그인 후 돌아올 주소도 서버 주소여야 한다). 이메일·비밀번호 로그인은 앱 안에서 된다.

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

assembleDebug, apksigner verify, aapt(이름 Trip Planner·패키지 kr.bito.trip·버전 1.1.0)와 dex 안의 서버 주소, manifest 의 networkSecurityConfig 를 확인했다. 실제 휴대폰 설치·Tailscale 연결은 미검증.
