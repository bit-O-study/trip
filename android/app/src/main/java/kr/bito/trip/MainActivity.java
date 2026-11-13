package kr.bito.trip;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.widget.LinearLayout;
import android.view.WindowInsets;

/**
 * Trip Planner 웹을 여는 WebView 껍데기. 화면은 웹 배포로 바뀌므로 화면을 고칠 때 APK 를 다시 만들 필요가 없다.
 * 로그인 쿠키를 유지하고, 다른 사이트 링크는 외부 브라우저로 열며, HTTP·파일 접근·혼합 콘텐츠는 허용하지 않는다.
 */
public final class MainActivity extends Activity {
    private WebView web;
    // 서버의 여행 도메인(Cloudflare 터널 → 서버 4102). 공개 HTTPS 라 Tailscale 없이 열린다.
    private static final String origin = "https://trip.helthssu.co.kr";
    private LinearLayout root;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets edges = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                view.setPadding(edges.left, edges.top, edges.right, edges.bottom);
            } else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            // 루트에서 이미 반영한 안전 영역이 WebView에 다시 적용되지 않게 소비한다.
            if (android.os.Build.VERSION.SDK_INT >= 30) return WindowInsets.CONSUMED;
            return insets.consumeSystemWindowInsets();
        });
        setContentView(root);
        if (android.os.Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> { if (web != null && web.canGoBack()) web.goBack(); else finish(); });
        open(state);
    }
    private void open(Bundle state) {
        root.removeAllViews();
        web = new WebView(this);
        root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        WebSettings config = web.getSettings();
        config.setJavaScriptEnabled(true); config.setDomStorageEnabled(true);
        config.setAllowFileAccess(false); config.setAllowContentAccess(false);
        config.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                Uri home = Uri.parse(origin);
                if (home.getScheme().equals(uri.getScheme()) && home.getHost().equals(uri.getHost()) && home.getPort() == uri.getPort()) return false;
                if (request.isForMainFrame() && ("https".equals(uri.getScheme()) || "mailto".equals(uri.getScheme()) || "tel".equals(uri.getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (android.content.ActivityNotFoundException ignored) { }
                }
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request.isForMainFrame()) new AlertDialog.Builder(MainActivity.this).setMessage("Trip Planner 에 연결할 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도하세요.").setPositiveButton("다시 시도", (dialog, which) -> view.loadUrl(origin)).setNegativeButton("닫기", null).show();
            }
        });
        if (state == null || web.restoreState(state) == null) web.loadUrl(origin);
    }
    @Override protected void onSaveInstanceState(Bundle state) { if (web != null) web.saveState(state); super.onSaveInstanceState(state); }
    @Override protected void onPause() { CookieManager.getInstance().flush(); super.onPause(); }
    @Override public void onBackPressed() { if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() { if (web != null) web.destroy(); super.onDestroy(); }
}
