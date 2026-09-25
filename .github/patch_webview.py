#!/usr/bin/env python3

from pathlib import Path
import re
import sys


MAIN = Path("android-project/app/src/main/java/com/oni/crm/MainActivity.java")


def fail(message):
    print(f"patch_webview: ERROR {message}")
    return 1


def main():
    if not MAIN.exists():
        return fail(f"MainActivity.java not found: {MAIN}")

    try:
        text = MAIN.read_text(encoding="utf-8")
    except Exception as e:
        return fail(f"cannot read MainActivity.java: {e}")

    if "WebViewAssetLoader" in text:
        print("patch_webview: already applied")
        return 0

    original = text
    missing = []

    if "import androidx.webkit.WebViewAssetLoader;" not in text:
        marker = "import android.webkit.WebViewClient;"
        if marker in text:
            text = text.replace(
                marker,
                marker + "\nimport androidx.webkit.WebViewAssetLoader;",
                1,
            )
        else:
            missing.append("import insertion anchor: android.webkit.WebViewClient;")

    if "import android.net.Uri;" not in text:
        marker = "import android.content.Intent;"
        if marker in text:
            text = text.replace(
                marker,
                marker + "\nimport android.net.Uri;",
                1,
            )
        else:
            missing.append("import insertion anchor: android.content.Intent;")

    if "private WebViewAssetLoader assetLoader;" not in text:
        class_marker = "public class MainActivity extends Activity {"
        if class_marker in text:
            text = text.replace(
                class_marker,
                class_marker + "\n    private WebViewAssetLoader assetLoader;",
                1,
            )
        else:
            missing.append("class declaration: public class MainActivity extends Activity {")

    init_code = """assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();"""

    if "assetLoader = new WebViewAssetLoader.Builder()" not in text:
        bridge_marker = 'webView.addJavascriptInterface(new AndroidBridge(), "Android");'
        if bridge_marker in text:
            text = text.replace(
                bridge_marker,
                init_code + "\n        " + bridge_marker,
                1,
            )
        else:
            missing.append(
                'initialization anchor: webView.addJavascriptInterface(new AndroidBridge(), "Android");'
            )

    intercept_pattern = re.compile(
        r'(?P<indent>[ \t]*)@Override[ \t]*'
        r'(?:public|protected)[ \t]+WebResourceResponse[ \t]+'
        r'shouldInterceptRequest[ \t]*\([ \t]*'
        r'WebView[ \t]+view[ \t]*,[ \t]*'
        r'WebResourceRequest[ \t]+request[ \t]*\)[ \t]*\{'
    )

    match = intercept_pattern.search(text)

    if match:
        method_indent = match.group("indent")
        body_indent = method_indent + "    "

        loader_code = (
            "\n"
            f"{body_indent}WebResourceResponse r = "
            "assetLoader.shouldInterceptRequest(request.getUrl());\n"
            f"{body_indent}if (r != null) return r;\n"
        )

        insert_at = match.end()
        text = text[:insert_at] + loader_code + text[insert_at:]
    else:
        missing.append(
            "method: shouldInterceptRequest(WebView view, WebResourceRequest request)"
        )

    load_pattern = re.compile(
        r'webView\s*\.\s*loadUrl\s*\(\s*'
        r'"file:///android_asset/index\.html"\s*\)\s*;'
    )

    if load_pattern.search(text):
        text = load_pattern.sub(
            'webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");',
            text,
            count=1,
        )
    else:
        missing.append(
            'loadUrl anchor: webView.loadUrl("file:///android_asset/index.html");'
        )

    if missing:
        print("patch_webview: ERROR anchors not found:")
        for item in missing:
            print(f"patch_webview:   {item}")
        return 1

    if text == original:
        print("patch_webview: ERROR no changes made")
        return 1

    try:
        MAIN.write_text(text, encoding="utf-8")
    except Exception as e:
        return fail(f"cannot write MainActivity.java: {e}")

    print("patch_webview: applied")
    return 0


if __name__ == "__main__":
    sys.exit(main())
