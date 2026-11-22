package com.thacklab.ninjacoach;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.Settings;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Hosts the Ninja Coach web app. Files are served from the APK's assets under a
 * secure https origin (so Web Workers, WebAssembly and IndexedDB all work
 * offline), and a small bridge covers what a WebView can't do on its own.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/index.html";
    private static final int FILE_REQUEST = 1;

    private WebView web;
    private boolean working;
    private ValueCallback<Uri[]> pendingFiles;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setTextZoom(100);
        web.setBackgroundColor(0xFF302E2B);
        web.setWebViewClient(new AssetClient());
        web.setWebChromeClient(new FileChooserClient());
        web.addJavascriptInterface(new Bridge(), "NinjaCoachAndroid");
        // Keep the page's process at full priority when the screen is off, so reviews carry on.
        if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        setContentView(web);
        if (state == null || web.restoreState(state) == null) web.loadUrl(START_URL);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_REQUEST || pendingFiles == null) return;
        pendingFiles.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
        pendingFiles = null;
    }

    private static String mimeOf(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".webmanifest")) return "application/manifest+json";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    private class AssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!HOST.equals(url.getHost())) return null;
            String path = url.getPath();
            if (path == null || path.isEmpty() || path.equals("/")) path = "/index.html";
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            headers.put("Access-Control-Allow-Origin", "*");
            try {
                InputStream in = getAssets().open("www" + path);
                String mime = mimeOf(path);
                String encoding = mime.startsWith("text/") || mime.endsWith("json") ? "utf-8" : null;
                WebResourceResponse res = new WebResourceResponse(mime, encoding, in);
                res.setResponseHeaders(headers);
                return res;
            } catch (IOException e) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers, new ByteArrayInputStream(new byte[0]));
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (HOST.equals(url.getHost())) return false;
            // Everything else (help links, chess.com pages...) opens in the browser.
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, url));
            } catch (ActivityNotFoundException ignored) {
                // No browser installed; ignore the click.
            }
            return true;
        }
    }

    private class FileChooserClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (pendingFiles != null) pendingFiles.onReceiveValue(null);
            pendingFiles = callback;
            // Accept attributes like ".pgn" are not MIME types, so let the user pick any file.
            Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            try {
                startActivityForResult(Intent.createChooser(intent, "Choose a file"), FILE_REQUEST);
            } catch (ActivityNotFoundException e) {
                pendingFiles = null;
                return false;
            }
            return true;
        }
    }

    /** Exposed to the page as window.NinjaCoachAndroid. */
    private class Bridge {
        @JavascriptInterface
        public String saveFile(String name, String mime, String content) {
            byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) return "";
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        if (os == null) return "";
                        os.write(bytes);
                    }
                    return "Downloads/" + name;
                }
                File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) return "";
                File file = new File(dir, name);
                try (FileOutputStream os = new FileOutputStream(file)) {
                    os.write(bytes);
                }
                return file.getAbsolutePath();
            } catch (Exception e) {
                return "";
            }
        }

        /** Writes Downloads/Ninja Coach/name, replacing the file if this app made it before. */
        @JavascriptInterface
        public String writeFile(String name, String mime, String content) {
            byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    String rel = Environment.DIRECTORY_DOWNLOADS + "/Ninja Coach/";
                    Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                    Uri uri = null;
                    String where = MediaStore.MediaColumns.DISPLAY_NAME + "=? AND " + MediaStore.MediaColumns.RELATIVE_PATH + "=?";
                    try (Cursor c = getContentResolver().query(collection, new String[] { MediaStore.MediaColumns._ID }, where, new String[] { name, rel }, null)) {
                        if (c != null && c.moveToFirst()) uri = ContentUris.withAppendedId(collection, c.getLong(0));
                    }
                    if (uri == null) {
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                        values.put(MediaStore.MediaColumns.RELATIVE_PATH, rel);
                        uri = getContentResolver().insert(collection, values);
                        if (uri == null) return "";
                    }
                    try (OutputStream os = getContentResolver().openOutputStream(uri, "wt")) {
                        if (os == null) return "";
                        os.write(bytes);
                    }
                    return "Downloads/Ninja Coach/" + name;
                }
                File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "Ninja Coach");
                if (!dir.exists() && !dir.mkdirs()) return "";
                File file = new File(dir, name);
                try (FileOutputStream os = new FileOutputStream(file, false)) {
                    os.write(bytes);
                }
                return file.getAbsolutePath();
            } catch (Exception e) {
                return "";
            }
        }

        /** Starts or stops the background service that keeps reviews going with the screen off, or updates its text. */
        @JavascriptInterface
        public void backgroundWork(final boolean on, final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(MainActivity.this, ReviewService.class);
                    try {
                        if (!on) {
                            stopService(i);
                            working = false;
                        } else if (working) {
                            ReviewService.update(MainActivity.this, text);
                        } else {
                            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED)
                                requestPermissions(new String[] { "android.permission.POST_NOTIFICATIONS" }, 2);
                            i.putExtra("text", text);
                            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i);
                            else startService(i);
                            working = true;
                        }
                    } catch (Exception e) {
                        // Android won't start it from the background; the next start from the app will.
                    }
                }
            });
        }

        /** Whether Android leaves this app out of battery optimisation (needed to keep working in deep sleep). */
        @JavascriptInterface
        public boolean batteryExempt() {
            if (Build.VERSION.SDK_INT < 23) return true;
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
        }

        /** Asks to be left out of battery optimisation (Android shows its own yes/no). */
        @JavascriptInterface
        public void askBatteryExempt() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
                    } catch (Exception e) {
                        try {
                            startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                        } catch (Exception ignored) {
                            // No such screen on this phone.
                        }
                    }
                }
            });
        }

        /** Vibrates in a pattern of on/off milliseconds, e.g. "14,60,14". */
        @JavascriptInterface
        public void vibrate(String pattern) {
            Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            try {
                String[] parts = pattern.split(",");
                long[] timings = new long[parts.length + 1];
                for (int i = 0; i < parts.length; i++) timings[i + 1] = Math.max(0, Math.min(1000, Long.parseLong(parts[i].trim())));
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(timings, -1));
                else v.vibrate(timings, -1);
            } catch (NumberFormatException e) {
                // ignore a malformed pattern
            }
        }

        /** Keeps the screen on (while the coach reviews), or lets it sleep again. */
        @JavascriptInterface
        public void keepScreenOn(final boolean on) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        @JavascriptInterface
        public void copyText(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                    if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Ninja Coach", text));
                }
            });
        }
    }
}
