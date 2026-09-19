package com.scorebox.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Single-WebView shell. The app itself is app/src/main/assets/index.html (vanilla HTML/CSS/JS,
 * no build step). This class only wires the WebView up to two local "virtual hosts":
 *
 *  - https://appassets.androidplatform.net/...   served from assets/ (fromAssets)
 *  - https://site.api.espn.com/...                relayed natively so the page can call ESPN's
 *                                                  public scoreboard JSON without hitting CORS
 *                                                  restrictions a plain fetch() would run into
 *                                                  from a file:// or custom-scheme origin.
 *
 * Anything else (an outbound link tapped inside the page) is handed off to the system browser.
 */
public class MainActivity extends Activity {

    private static final String TAG = "ScoreBoxRelay";
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String API_HOST = "site.api.espn.com";
    private static final String START_URL = "https://appassets.androidplatform.net/index.html";
    private static final int BG = 0xFF0C1014; // Night Field
    private static final int TIMEOUT_MS = 20000;
    /* Sent on relay requests instead of this device's own WebView.getUserAgentString().
       On a tablet whose system WebView is frozen years out of date (common once a
       32-bit-only device stops getting WebView updates from Play Store), that string
       advertises a long-deprecated Chrome build -- which ESPN's edge/bot protection
       can and does reject outright ("Access Denied") even though the request is
       otherwise completely normal. A real browser on the same device/network isn't
       affected because it's a separately-updated app, not tied to system WebView.
       Spoofing a current UA here only affects this native relay call, not how the
       page itself renders. Will need bumping again someday as this string ages too,
       just far more slowly than a WebView that can't update at all. */
    private static final String RELAY_USER_AGENT =
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) "
        + "Chrome/128.0.0.0 Mobile Safari/537.36";

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setBackgroundColor(BG);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSaveFormData(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        web.setWebViewClient(new LocalClient());
        web.setWebChromeClient(new WebChromeClient());

        setContentView(web);
        web.loadUrl(START_URL);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            ViewGroup parent = (ViewGroup) web.getParent();
            if (parent != null) parent.removeView(web);
            web.setWebViewClient(new WebViewClient());
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    // ---------------------------------------------------------------------
    // asset + API-relay plumbing
    // ---------------------------------------------------------------------

    private WebResourceResponse fromAssets(String path) {
        if (path == null || path.isEmpty() || "/".equals(path)) {
            path = "/index.html";
        }
        if (path.startsWith("/")) {
            path = path.substring(1);
        }
        if (path.isEmpty()) {
            path = "index.html";
        }
        if (path.contains("..")) {
            return notFound();
        }
        try {
            InputStream in = getAssets().open(path);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            return new WebResourceResponse(mimeOf(path), "utf-8", 200, "OK", headers, in);
        } catch (IOException e) {
            return notFound();
        }
    }

    private static String mimeOf(String path) {
        String p = path.toLowerCase(Locale.US);
        if (p.endsWith(".html") || p.endsWith(".htm")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".ico")) return "image/x-icon";
        return "text/plain";
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
    }

    /** A same-origin (CORS-enabled) error response, so a relay failure surfaces to the
     *  page's fetch() as a normal non-ok response instead of falling through to a real
     *  cross-origin request that WebView would then block on CORS anyway — that fallback
     *  both wastes a whole extra timeout window and throws away the real failure reason. */
    private WebResourceResponse errorResponse(int code, String message, String detail) {
        Log.w(TAG, "relay: " + code + " " + message + " - " + detail);
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cache-Control", "no-cache");
        byte[] body = ("relay error: " + detail).getBytes(StandardCharsets.UTF_8);
        return new WebResourceResponse("text/plain", "utf-8", code, message, headers,
                new ByteArrayInputStream(body));
    }

    /** GETs an ESPN API URL server-side and hands the response back to the page, CORS-free. */
    private WebResourceResponse relay(String urlString) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(urlString).openConnection();
            conn.setRequestMethod("GET");
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);
            conn.setRequestProperty("Accept", "application/json, text/plain, */*");
            conn.setRequestProperty("User-Agent", RELAY_USER_AGENT);

            int code = conn.getResponseCode();
            if (code < 100 || code > 599 || (code >= 300 && code < 400)) {
                String detail = "unexpected upstream status " + code;
                conn.disconnect();
                return errorResponse(502, "Bad Gateway", detail);
            }

            String message = conn.getResponseMessage();
            if (message == null || message.isEmpty()) {
                message = (code == 200) ? "OK" : "Status";
            }

            InputStream body = (code < 400) ? conn.getInputStream() : conn.getErrorStream();
            if (body == null) {
                body = new ByteArrayInputStream(new byte[0]);
            }

            String mime = "application/json";
            String charset = "utf-8";
            String contentType = conn.getContentType();
            if (contentType != null && contentType.length() > 0) {
                int semi = contentType.indexOf(';');
                String rawMime = semi > 0 ? contentType.substring(0, semi) : contentType;
                rawMime = rawMime.trim();
                if (rawMime.length() > 0) mime = rawMime;

                int ci = contentType.toLowerCase(Locale.US).indexOf("charset=");
                if (ci >= 0) {
                    String rawCharset = contentType.substring(ci + 8).trim();
                    int cs = rawCharset.indexOf(';');
                    if (cs > 0) rawCharset = rawCharset.substring(0, cs);
                    rawCharset = rawCharset.replace("\"", "").trim();
                    if (rawCharset.length() > 0) charset = rawCharset;
                }
            }

            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "no-cache");
            return new WebResourceResponse(mime, charset, code, message, headers, body);
        } catch (Exception e) {
            if (conn != null) {
                try { conn.disconnect(); } catch (Exception ignored) {}
            }
            String detail = e.getClass().getSimpleName() + ": " + String.valueOf(e.getMessage());
            return errorResponse(502, "Bad Gateway", detail);
        }
    }

    private boolean openExternally(Uri uri) {
        if (uri == null) return false;
        if (APP_HOST.equals(uri.getHost())) return false;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception ignored) {}
        return true;
    }

    // ---------------------------------------------------------------------

    private final class LocalClient extends WebViewClient {

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            if (request == null) return null;
            Uri uri = request.getUrl();
            if (uri == null) return null;
            String host = uri.getHost();
            if (APP_HOST.equals(host)) {
                return fromAssets(uri.getPath());
            }
            if (API_HOST.equalsIgnoreCase(host) && "GET".equalsIgnoreCase(request.getMethod())) {
                return relay(uri.toString());
            }
            return null;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            if (url == null) return null;
            Uri uri = Uri.parse(url);
            if (APP_HOST.equals(uri.getHost())) {
                return fromAssets(uri.getPath());
            }
            return null;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return openExternally(request != null ? request.getUrl() : null);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return openExternally(url != null ? Uri.parse(url) : null);
        }
    }
}
