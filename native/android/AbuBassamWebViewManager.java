package com.abubassam.librarycamera3;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import androidx.annotation.NonNull;

import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.uimanager.ThemedReactContext;
import com.reactnativecommunity.webview.RNCWebViewClient;
import com.reactnativecommunity.webview.RNCWebViewManager;
import com.reactnativecommunity.webview.RNCWebViewWrapper;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.Locale;

@ReactModule(name = AbuBassamWebViewManager.REACT_CLASS)
public final class AbuBassamWebViewManager extends RNCWebViewManager {
    public static final String REACT_CLASS = "RCTAbuBassamWebView";
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String URL_PREFIX = "/library/";
    private static final String ASSET_PREFIX = "library/";

    private static final class LocalAssetClient extends RNCWebViewClient {
        private final AssetManager assets;

        LocalAssetClient(AssetManager assets) {
            this.assets = assets;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            WebResourceResponse local = intercept(request == null ? null : request.getUrl());
            return local != null ? local : super.shouldInterceptRequest(view, request);
        }

        @SuppressWarnings("deprecation")
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            Uri uri = null;
            try {
                if (url != null) uri = Uri.parse(url);
            } catch (RuntimeException ignored) {
            }
            WebResourceResponse local = intercept(uri);
            return local != null ? local : super.shouldInterceptRequest(view, url);
        }

        private WebResourceResponse intercept(Uri uri) {
            if (uri == null || !"https".equalsIgnoreCase(uri.getScheme()) || !APP_HOST.equalsIgnoreCase(uri.getHost())) {
                return null;
            }
            String path = uri.getPath();
            if (path == null || !path.startsWith(URL_PREFIX)) return notFound();
            String relative = path.substring(URL_PREFIX.length());
            if (!safeRelativePath(relative)) return notFound();
            try {
                InputStream input = assets.open(ASSET_PREFIX + relative, AssetManager.ACCESS_STREAMING);
                String mime = mimeType(relative);
                return new WebResourceResponse(mime, isTextMime(mime) ? "UTF-8" : null, input);
            } catch (IOException ignored) {
                return notFound();
            }
        }

        private static boolean safeRelativePath(String relative) {
            if (relative == null || relative.isEmpty() || relative.startsWith("/") || relative.indexOf('\\') >= 0 || relative.indexOf('\0') >= 0) return false;
            for (String segment : relative.split("/")) {
                if (segment.isEmpty() || ".".equals(segment) || "..".equals(segment)) return false;
            }
            return true;
        }

        private static String mimeType(String relative) {
            String lower = relative.toLowerCase(Locale.ROOT);
            if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
            if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
            if (lower.endsWith(".css")) return "text/css";
            if (lower.endsWith(".json")) return "application/json";
            if (lower.endsWith(".svg")) return "image/svg+xml";
            if (lower.endsWith(".wasm")) return "application/wasm";
            if (lower.endsWith(".ttf")) return "font/ttf";
            if (lower.endsWith(".otf")) return "font/otf";
            if (lower.endsWith(".woff")) return "font/woff";
            if (lower.endsWith(".woff2")) return "font/woff2";
            String extension = MimeTypeMap.getFileExtensionFromUrl("https://" + APP_HOST + "/" + relative);
            String detected = extension == null ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.toLowerCase(Locale.ROOT));
            return detected == null ? "application/octet-stream" : detected;
        }

        private static boolean isTextMime(String mime) {
            return mime != null && (mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") || mime.contains("svg"));
        }

        private static WebResourceResponse notFound() {
            return new WebResourceResponse(
                "text/plain", "UTF-8", 404, "Not Found",
                Collections.singletonMap("Cache-Control", "no-store"),
                new ByteArrayInputStream(new byte[0])
            );
        }
    }

    @NonNull
    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @Override
    protected void addEventEmitters(@NonNull ThemedReactContext reactContext, RNCWebViewWrapper view) {
        view.getWebView().setWebViewClient(new LocalAssetClient(reactContext.getAssets()));
    }
}
