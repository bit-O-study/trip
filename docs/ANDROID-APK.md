# Trip Planner Android APK

- [APK 다운로드](https://github.com/bit-O-study/trip/raw/refs/heads/main/releases/apk/trip-planner-1.0.0-debug.apk)
- 실행하면 `https://trip-planner-tau-jade.vercel.app` 을 바로 연다(WebView). 화면은 웹 배포로 바뀌므로 화면 수정에는 APK 를 다시 만들 필요가 없다.
- SHA-256: `c842d86efe21d5ea879218a7cf3dd3c1f66876edecd3c36c6ae4ab5c11ac002e`
- 패키지 `kr.bito.trip`, Android 8 이상, target SDK 36, 개발용(debug) 서명 — 직접 설치용.

## 구성

- 관리자 앱(BOadmin)과 같은 WebView 껍데기. 로그인 쿠키 유지, 같은 사이트 밖 링크는 외부 브라우저로 연다, HTTP·파일 접근·혼합 콘텐츠 불허.
- 아이콘: 앱 로고(두 정거장을 잇는 노선)를 짙은 남색 바탕에 얹은 적응형 아이콘.
- 알려진 제한: 구글·카카오 로그인은 외부 브라우저로 넘어가 앱으로 돌아오지 않는다(구글이 WebView 안 로그인을 막는다). 이메일·비밀번호 로그인은 앱 안에서 된다.

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

assembleDebug, apksigner verify, aapt(이름 Trip Planner·패키지 kr.bito.trip·버전 1.0.0) 확인. 실제 휴대폰 설치는 미검증.
