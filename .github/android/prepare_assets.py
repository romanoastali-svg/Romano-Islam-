"""Apply the Android-specific assets to the exported web app."""

import json
import re
import shutil
import sys
from pathlib import Path

root = Path(sys.argv[1])
assets = Path(__file__).with_name("assets")
font_import = "@import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');"
local_fonts = (
    "@font-face{font-family:Amiri;font-style:normal;font-weight:400;"
    "font-display:swap;src:url('fonts/Amiri-Regular.ttf') format('truetype')}"
    "@font-face{font-family:Amiri;font-style:normal;font-weight:700;"
    "font-display:swap;src:url('fonts/Amiri-Bold.ttf') format('truetype')}"
)
last_menu_item = re.compile(r'(<a\b[^>]*data-ri-menu-route="settings"[^>]*>.*?</a>)')
privacy_link = (
    '<a class="ri-menu-link" href="datenschutz.html">'
    '<span class="ri-menu-icon" aria-hidden="true">ⓘ</span>'
    '<span>Datenschutzerklärung</span><b aria-hidden="true">›</b></a>'
)
impressum_link = (
    '<a class="ri-menu-link" href="impressum.html">'
    '<span class="ri-menu-icon" aria-hidden="true">©</span>'
    '<span>Impressum &amp; Urheberrecht</span><b aria-hidden="true">›</b></a>'
)

template_pattern = re.compile(r'(<script type="application/json" id="ri-page-template">)(.*?)(</script>)', re.S)
for page in root.rglob("*.html"):
    raw = page.read_text(encoding="utf-8")
    wrapper = template_pattern.search(raw)
    page_template = json.loads(wrapper.group(2)) if wrapper else None
    html = page_template["html"] if page_template else raw
    if font_import not in html and not last_menu_item.search(html):
        continue
    if page.parent != root and '<base href="../">' not in html:
        raise ValueError(f"{page} needs an app-root base URL")
    html = html.replace(font_import, local_fonts)
    html = last_menu_item.sub(lambda match: match.group() + privacy_link + impressum_link, html)
    if wrapper:
        page_template["html"] = html
        payload = json.dumps(page_template, ensure_ascii=False).replace("<", chr(92) + "u003c")
        html = raw[:wrapper.start(2)] + payload + raw[wrapper.end(2):]
    page.write_text(html, encoding="utf-8")

shutil.copytree(assets, root, dirs_exist_ok=True)

# A complete app snapshot must use its own matching catalog/data. Mixing a new
# internet catalog with older running HTML could refer to missing text slots.
# This changes only the exported native/snapshot copy, never the public portal.
data_loader = root / "assets" / "romano-data.js"
loader = data_loader.read_text(encoding="utf-8")
remote_mode = "const remoteRoot = native || portal ? new URL('https://app.romano-islam.de/data/') : localRoot;"
snapshot_mode = "const remoteRoot = portal ? new URL('https://app.romano-islam.de/data/') : localRoot;"
if remote_mode in loader:
    loader = loader.replace(remote_mode, snapshot_mode, 1)
elif snapshot_mode not in loader:
    raise ValueError("App data loader needs a snapshot-compatible source selector")
data_loader.write_text(loader, encoding="utf-8")

worker = root / "offline-sw.js"
script = worker.read_text(encoding="utf-8")
script = re.sub(r"const CACHE='([^']+)';", r"const CACHE='\1-android-privacy-v2';", script, count=1)
file_list = re.search(r"const FILES=(\[.*?\]);", script)
if file_list is None:
    raise ValueError("Offline asset list not found")
offline_files = json.loads(file_list.group(1))
offline_files.extend(("datenschutz.html", "impressum.html", "fonts/Amiri-Regular.ttf", "fonts/Amiri-Bold.ttf"))
offline_files = [path for path in dict.fromkeys(offline_files) if (root / path).is_file()]
script = script[:file_list.start(1)] + json.dumps(offline_files) + script[file_list.end(1):]
worker.write_text(script, encoding="utf-8")
