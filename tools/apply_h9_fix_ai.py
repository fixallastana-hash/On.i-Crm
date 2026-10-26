import sys
from pathlib import Path

MAIN = Path(r"C:\Projects\On.i-Crm\android-project\app\src\main\java\com\oni\crm\MainActivity.java")

OLD = 'String r = callAiProxy(input, "auto", null, null);'
NEW = 'String r = callAiProxy(input, "auto", null, null, null);'

raw = MAIN.read_bytes()
crlf = b"\r\n" in raw
text = raw.decode("utf-8")
if crlf:
    text = text.replace("\r\n", "\n")

if OLD not in text:
    if NEW in text:
        print("SKIP: already patched")
        sys.exit(0)
    print("FAIL: anchor not found")
    sys.exit(1)

text = text.replace(OLD, NEW, 1)
if crlf:
    text = text.replace("\n", "\r\n")
MAIN.write_bytes(text.encode("utf-8"))
print("OK: callAiProxy call now has 5 args (added mode=null)")