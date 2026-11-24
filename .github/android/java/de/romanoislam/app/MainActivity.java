package de.romanoislam.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Collections;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String APP_PATH = "/romano/";
    private static final String START = "https://" + APP_HOST + APP_PATH + "index.html";
    private static final int BACKGROUND = 0xff082a25;
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(BACKGROUND);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return localResponse(request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isLocal(uri) || !request.isForMainFrame()) return false;
                if ("https".equalsIgnoreCase(uri.getScheme())) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (ActivityNotFoundException ignored) {
                        // No browser is available on this device.
                    }
                }
                return true;
            }
        });

        if (Build.VERSION.SDK_INT >= 24) {
            ServiceWorkerController workers = ServiceWorkerController.getInstance();
            workers.getServiceWorkerWebSettings().setAllowFileAccess(false);
            workers.getServiceWorkerWebSettings().setAllowContentAccess(false);
            workers.setServiceWorkerClient(new ServiceWorkerClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    return localResponse(request);
                }
            });
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BACKGROUND);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
                return insets;
            });
        }
        setContentView(root);
        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(START);
    }

    private static boolean isLocal(Uri uri) {
        return "https".equalsIgnoreCase(uri.getScheme()) && APP_HOST.equals(uri.getHost())
            && uri.getPort() == -1 && uri.getPath() != null && uri.getPath().startsWith(APP_PATH);
    }

    private WebResourceResponse localResponse(WebResourceRequest request) {
        Uri uri = request.getUrl();
        String host = uri.getHost();
        if ("fonts.googleapis.com".equalsIgnoreCase(host)
                || "fonts.gstatic.com".equalsIgnoreCase(host)) {
            return missing();
        }
        if (!isLocal(uri)) return null;
        String file = uri.getPath().substring(APP_PATH.length());
        if (file.isEmpty() || file.startsWith("/") || file.contains("\\")) return missing();
        for (String segment : file.split("/")) {
            if (segment.equals(".") || segment.equals("..")) return missing();
        }
        try {
            String type = contentType(file);
            String encoding = type.startsWith("text/") || type.startsWith("application/")
                && !type.equals("application/octet-stream") && !type.equals("application/pdf") ? "UTF-8" : null;
            if ("readers/curani.html".equals(file)) {
                return new WebResourceResponse(type, encoding, updatedCurani());
            }
            return new WebResourceResponse(type, encoding, getAssets().open("romano/" + file));
        } catch (IOException error) {
            return missing();
        }
    }

    private synchronized java.io.InputStream updatedCurani() throws IOException {
        android.util.AtomicFile cache = new android.util.AtomicFile(
            new java.io.File(getFilesDir(), "curani_updated.html"));
        javax.net.ssl.HttpsURLConnection connection = null;
        java.io.FileOutputStream output = null;
        try {
            connection = (javax.net.ssl.HttpsURLConnection)
                new java.net.URL("https://app.romano-islam.de/readers/curani.html").openConnection();
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(10000);
            connection.setUseCaches(false);
            connection.setInstanceFollowRedirects(false);
            if (connection.getResponseCode() == 200 &&
                connection.getContentType() != null &&
                connection.getContentType().startsWith("text/html")) {
                output = cache.startWrite();
                try (java.io.InputStream input = connection.getInputStream()) {
                    byte[] buffer = new byte[16384];
                    int count;
                    long total = 0;
                    while ((count = input.read(buffer)) != -1) {
                        total += count;
                        if (total > 33554432L) throw new IOException("File too large");
                        output.write(buffer, 0, count);
                    }
                    if (total == 0) throw new IOException("Empty update");
                }
                cache.finishWrite(output);
                output = null;
            }
        } catch (IOException error) {
            if (output != null) cache.failWrite(output);
        } finally {
            if (connection != null) connection.disconnect();
        }
        try {
            return cache.openRead();
        } catch (IOException error) {
            return getAssets().open("romano/readers/curani.html");
        }
    }

    private static WebResourceResponse missing() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not found",
            Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    private static String contentType(String path) {
        String name = path.toLowerCase(Locale.ROOT);
        if (name.endsWith(".html")) return "text/html";
        if (name.endsWith(".js")) return "application/javascript";
        if (name.endsWith(".css")) return "text/css";
        if (name.endsWith(".json")) return "application/json";
        if (name.endsWith(".webmanifest")) return "application/manifest+json";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        if (name.endsWith(".svg")) return "image/svg+xml";
        if (name.endsWith(".ttf")) return "font/ttf";
        if (name.endsWith(".pdf")) return "application/pdf";
        return "application/octet-stream";
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        web.saveState(state);
        super.onSaveInstanceState(state);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
