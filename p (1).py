import re, pathlib

gem = pathlib.Path(".github/GeminiClient.java")
dst = pathlib.Path("android-project/app/src/main/java/com/oni/crm/GeminiClient.java")
if gem.exists():
    dst.write_text(gem.read_text(encoding="utf-8"), encoding="utf-8")
    print("  GeminiClient.java copied")
else:
    print("  WARNING: GeminiClient.java not found")

p = pathlib.Path("android-project/app/src/main/java/com/oni/crm/MainActivity.java")
if not p.exists():
    print("WARNING: MainActivity.java not found")
    raise SystemExit(0)

s = p.read_text(encoding="utf-8")

s = re.sub(r'\\{2,}"', r'\\"', s)
s = s.replace('getBoolean("assistantAutoApply", false)', 'getBoolean("assistantAutoApply", true)')
s = s.replace("snippet|text-container|organic__snippet|b_caption",
              "snippet|text-container|organic__snippet|b_caption|VwiC3b|aCOpRe|yXK7lf|IsZvec|MUxGbd|kno-rdesc")
s = re.sub(r'\n[ \t]*private String firstRegex\([^)]*\)\s*\{.*?\n[ \t]*\}\n', '\n', s, count=1, flags=re.DOTALL)
for d in ("import android.os.Environment;\n", "import java.text.SimpleDateFormat;\n", "import java.util.Date;\n"):
    s = s.replace(d, "")
s = s.replace('"deepseek-v4-flash"', '"deepseek-chat"')
s = s.replace('"deepseek-v4-flash-vision-exp"', '"deepseek-chat"')

s = re.sub(r'^[ \t]*import\s+(cz\.adaptech\.tesseract4android|com\.googlecode\.tesseract\.android)\.TessBaseAPI;[ \t]*\r?\n',
           '', s, flags=re.MULTILINE)
pkg_match = re.search(r'^package\s+[^;]+;[ \t]*\r?\n', s, flags=re.MULTILINE)
if pkg_match:
    ins = pkg_match.end()
    if 'import com.googlecode.tesseract.android.TessBaseAPI;' not in s:
        s = s[:ins] + '\nimport com.googlecode.tesseract.android.TessBaseAPI;' + s[ins:]
print("  import tess-two")


def remove_method(src, name):
    pattern = re.compile(
        r'(?<![\w\.])(?:public|private|protected)\s+(?:static\s+)?'
        r'(?:void|String|boolean|int|long|double|float|char|byte|short|JSONObject|JSONArray|InputStream)\s+'
        + re.escape(name) + r'\s*\(',
        re.MULTILINE
    )
    m = pattern.search(src)
    if not m:
        return src, False

    idx = m.start()
    line_start = src.rfind('\n', 0, idx) + 1

    while True:
        prev_nl = src.rfind('\n', 0, line_start - 1)
        if prev_nl < 0:
            break

        prev_line = src[prev_nl + 1:line_start].strip()
        if prev_line.startswith('@'):
            line_start = prev_nl + 1
        else:
            break

    brace = src.find('{', idx)
    if brace < 0:
        return src, False

    depth = 1
    i = brace + 1
    in_str = False
    esc = False

    while i < len(src) and depth > 0:
        c = src[i]

        if in_str:
            if esc:
                esc = False
            elif c == '\\':
                esc = True
            elif c == '"':
                in_str = False
        else:
            if c == '"':
                in_str = True
            elif c == '{':
                depth += 1
            elif c == '}':
                depth -= 1

        i += 1

    return src[:line_start] + src[i:], True


names = [
    'getAIState','saveAIState',
    'saveGeminiSettings','getGeminiSettings','saveProviderFlags','getProviderFlags',
    'lookupProductByAI','lookupProductByName','resolveExplicitProductCategory',
    'detectCategoryFromProductName','detectCategoryFromResults','detectProductSubtype',
    'buildRussianProductInfoQueries','buildForeignProductInfoQueries','addUniqueResults',
    'hasUsefulProductInfo','searchWeb','searchSingleEngine','parseSearchHtml',
    'normalizeSearchName','similarPerfumeTitle','fetchUrlText','htmlMetaContent',
    'parseFragranticaStructured','fetchFragranticaPerfume','structuredFieldCount',
    'mergeStructured','translateToRussian','triggerVisionFromUri','doTriggerVision',
    'injectProductHandlers','recognizeProductPhoto','lookupProductDescriptionFull',
    'callSelectedProvider','callDeepSeekReasoner','readAll','callGemini','callDeepSeek',
    'callOpenAI','callGeminiWithSearch','callDeepSeekWithSearch','extractAnswerText',
    'pickStringFromJson','pickStringFromArray','askAIChat','postAIChatResult','injectAIChat',
    'testAIConnection','postOcrResult','postProductLookupResult',
    'callOpenAIWithImage','callDeepSeekWithImage','extractJsonObject',
    'askAIAssistant','buildAIProductPrompt',
    'sendProductOcrResult','sendProductLookupResult','cleanWebText','firstRegex',
]

removed = 0
for n in names:
    s, ok = remove_method(s, n)
    if ok:
        removed += 1

print("  removed methods: {}".format(removed))


s = s.replace(
    'throw new IOException("Включите OpenAI или DeepSeek и добавьте API-ключ")',
    'throw new IOException("Все AI-провайдеры отключены. Включите Gemini или DeepSeek в разделе AI.")'
)

s = s.replace(
    'throw new IOException("Нет включённого ИИ-провайдера с API-ключом")',
    'throw new IOException("Все AI-провайдеры отключены. Включите Gemini или DeepSeek в разделе AI.")'
)


# === ЯКОРЬ: closeApp (внутри AndroidBridge) ===

anchor_re = re.compile(
    r'([ \t]*@JavascriptInterface[ \t]*\r?\n'
    r'[ \t]*public[ \t]+void[ \t]+closeApp[ \t]*\([ \t]*\)[ \t]*\{)',
    re.MULTILINE
)

anchor_match = anchor_re.search(s)

if not anchor_match:
    print("  WARNING: closeApp anchor not found")
    raise SystemExit(0)

insert_pos = anchor_match.start(1)

print("  [dbg] closeApp anchor found at", insert_pos)
print("  [dbg] context before:", repr(s[insert_pos-160:insert_pos]))
print("  [dbg] context after :", repr(s[insert_pos:insert_pos+160]))


hf = pathlib.Path(".github/deepseek_helpers.txt")
gb = pathlib.Path(".github/gemini_bridge.txt")
bf = pathlib.Path(".github/bridge_method.txt")
ph = pathlib.Path(".github/product_handlers.txt")
acf = pathlib.Path(".github/ai_chat.txt")

combined = ""

for path in (hf, gb, bf):
    if path.exists():
        combined += path.read_text(encoding="utf-8").rstrip() + "\n\n"
    else:
        print("  WARNING:", path.name, "not found")

if combined:
    s = s[:insert_pos] + combined + s[insert_pos:]
    print("  helpers inserted (before closeApp)")
    print(
        "  [dbg] after insert tail:",
        repr(s[insert_pos+len(combined)-80:insert_pos+len(combined)+160])
    )


pause = "    @Override protected void onPause() {"

if ph.exists() and pause in s and "private void injectProductHandlers()" not in s:
    block = ph.read_text(encoding="utf-8")
    s = s.replace(pause, block + pause, 1)
    print("  product_handlers inserted (in MainActivity)")


if acf.exists() and pause in s and "private void injectAIChat()" not in s:
    block = acf.read_text(encoding="utf-8")
    s = s.replace(pause, block + pause, 1)
    print("  ai_chat inserted (in MainActivity)")


import re as _re

s = _re.sub(
    r'webView\.postDelayed\(new Runnable\(\) \{ public void run\(\) \{ injectProductHandlers\(\); \} \}, \d+\);\n?',
    '',
    s
)

s = _re.sub(
    r'webView\.postDelayed\(new Runnable\(\) \{ public void run\(\) \{ injectAIChat\(\); \} \}, \d+\);\n?',
    '',
    s
)

s = _re.sub(
    r'webView\.postDelayed\(new Runnable\(\) \{ public void run\(\) \{ injectGuideChat\(\); \} \}, \d+\);\n?',
    '',
    s
)


old_load = 'webView.loadUrl("file:///android_asset/index.html");'

new_load = (
    'webView.loadUrl("file:///android_asset/index.html");\n'
    '        webView.postDelayed(new Runnable() { public void run() { injectProductHandlers(); } }, 500);\n'
    '        webView.postDelayed(new Runnable() { public void run() { injectProductHandlers(); } }, 1500);\n'
    '        webView.postDelayed(new Runnable() { public void run() { injectProductHandlers(); } }, 3500);\n'
    '        webView.postDelayed(new Runnable() { public void run() { injectAIChat(); } }, 500);\n'
    '        webView.postDelayed(new Runnable() { public void run() { injectAIChat(); } }, 1500);\n'
    '        webView.postDelayed(new Runnable() { public void run() { injectAIChat(); } }, 3500);'
)

if old_load in s and "injectProductHandlers();" not in s.split("onCreate")[1].split("private void configureWebView")[0]:
    s = s.replace(old_load, new_load, 1)
    print("  inject scheduled")


before = len(re.findall(r'\btess\s*\.\s*recycle\s*\(\s*\)', s))

s = re.sub(
    r'\btess\s*\.\s*recycle\s*\(\s*\)\s*;?',
    'tess.end();',
    s
)

after = len(re.findall(r'\btess\s*\.\s*recycle\s*\(\s*\)', s))

print("  tess.recycle() replaced:", before, "remaining:", after)

s = re.sub(r';\s*;', ';', s)

p.write_text(s, encoding="utf-8", newline="\n")

print("java patched")
