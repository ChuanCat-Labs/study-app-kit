package org.studyapp.kit;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/** Offline course shell. Only packaged content is loaded into the bridged WebView. */
public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/assets/index.html";
    private static final int EXPORT = 41, IMPORT = 42;
    private WebView web;
    private String pendingExport;
    private ValueCallback<Uri[]> fileCallback;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(0xfff7f7f2);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        // The system picker grants access to the single selected backup document.
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(true);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        web.addJavascriptInterface(new CourseBridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri uri = req.getUrl();
                if (!isLocal(uri) || !"GET".equals(req.getMethod())) return errorResponse();
                String path = uri.getPath().substring("/assets/".length());
                if (path.contains("..") || path.contains("\\") || path.isEmpty()) return errorResponse();
                try {
                    InputStream input = getAssets().open(path);
                    String encoding = path.endsWith(".jpg") || path.endsWith(".png") ? null : "UTF-8";
                    return new WebResourceResponse(mime(path), encoding, 200, "OK",
                        Collections.singletonMap("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'"), input);
                } catch (IOException e) { return errorResponse(); }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                if (isLocal(req.getUrl())) return false;
                if (req.isForMainFrame() && req.hasGesture()) openExternal(req.getUrl().toString());
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setTitle(BuildConfig.APP_LABEL).setMessage(message)
                    .setPositiveButton("继续", (dialog, which) -> result.confirm())
                    .setNegativeButton("取消", (dialog, which) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                try { startActivityForResult(intent, IMPORT); }
                catch (ActivityNotFoundException e) { fileCallback.onReceiveValue(null); fileCallback = null; tell("没有可用的文件选择器。"); }
                return true;
            }
        });
        web.loadUrl(HOME);
    }

    private static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPort() == -1
            && uri.getPath() != null && uri.getPath().startsWith("/assets/");
    }
    private static String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        return "text/plain";
    }
    private static WebResourceResponse errorResponse() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(),
            new ByteArrayInputStream(new byte[0]));
    }
    private void tell(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); }
    private void exportResult(boolean success) {
        web.evaluateJavascript("window.MemoryLab && window.MemoryLab.exportResult(" + success + ")", null);
    }
    private void openExternal(String value) {
        Uri uri = Uri.parse(value);
        if (!"https".equals(uri.getScheme()) && !"http".equals(uri.getScheme())) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
        catch (ActivityNotFoundException e) { tell("没有可打开资料链接的浏览器。"); }
    }
    private final class CourseBridge {
        @JavascriptInterface public void openExternal(String url) {
            runOnUiThread(() -> { if (HOME.equals(web.getUrl())) MainActivity.this.openExternal(url); });
        }
        @JavascriptInterface public void exportBackup(String json) {
            if (json == null || json.getBytes(StandardCharsets.UTF_8).length > 2000000) {
                runOnUiThread(() -> { tell("备份过大，未保存。"); exportResult(false); }); return;
            }
            try {
                JSONObject value = new JSONObject(json);
                if (!"memory-lab-course-backup".equals(value.optString("format"))
                    || !BuildConfig.COURSE_ID.equals(value.optString("courseId"))) throw new Exception();
            } catch (Exception e) { runOnUiThread(() -> exportResult(false)); return; }
            runOnUiThread(() -> {
                if (!HOME.equals(web.getUrl()) || pendingExport != null) return;
                pendingExport = json;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, BuildConfig.COURSE_ID + "-学习备份.json");
                try { startActivityForResult(intent, EXPORT); }
                catch (ActivityNotFoundException e) { pendingExport = null; exportResult(false); tell("没有可用的保存文件功能。"); }
            });
        }
    }
    @Override protected void onActivityResult(int request, int result, Intent intent) {
        super.onActivityResult(request, result, intent);
        if (request == IMPORT && fileCallback != null) {
            Uri chosen = result == RESULT_OK && intent != null ? intent.getData() : null;
            fileCallback.onReceiveValue(chosen == null ? null : new Uri[]{chosen}); fileCallback = null;
        }
        if (request == EXPORT) {
            String json = pendingExport; pendingExport = null;
            if (json == null || result != RESULT_OK || intent == null || intent.getData() == null) { exportResult(false); return; }
            Uri chosen = intent.getData();
            new Thread(() -> {
                boolean saved = false;
                try (OutputStream output = getContentResolver().openOutputStream(chosen, "wt")) {
                    if (output != null) { output.write(json.getBytes(StandardCharsets.UTF_8)); saved = true; }
                } catch (IOException e) { /* Report failure in the UI; keep the local course records. */ }
                final boolean success = saved; runOnUiThread(() -> exportResult(success));
            }).start();
        }
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("window.MemoryLab ? window.MemoryLab.back() : false", handled -> {
            if (!"true".equals(handled)) finish();
        });
    }
    @Override protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        web.removeJavascriptInterface("AndroidBridge"); web.destroy(); super.onDestroy();
    }
}
