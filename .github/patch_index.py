import pathlib, sys

p = pathlib.Path("android-project/app/src/main/assets/index.html")
if not p.exists():
    print("  WARNING: index.html not found at", p)
    sys.exit(0)

s = p.read_text(encoding="utf-8")

# Скрываем кнопку AI-помощник через CSS (не удаляем!)
hide_css = """
<style id="oni-hide-ai-assistant">
#menu-ai-assistant{display:none !important;}
</style>
"""

if 'oni-hide-ai-assistant' not in s:
    head_close = s.find('</head>')
    if head_close > 0:
        s = s[:head_close] + hide_css + s[head_close:]
        print("  patched: menu-ai-assistant hidden via CSS")
    else:
        print("  WARNING: </head> not found")
else:
    print("  menu-ai-assistant already hidden")

p.write_text(s, encoding="utf-8", newline="\n")
print("  patched: index.html (CSS only)")
