"""Validate the books and generate the catalog in a deployment directory."""
from hashlib import sha256
import json
from pathlib import Path
import re
import sys

SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
LANGUAGES = {"bs", "ar"}
BLOCK_TYPES = {"paragraph", "heading", "note"}


def nonblank(value):
    return isinstance(value, str) and bool(value.strip())


def read_book(path, section):
    raw = path.read_bytes()
    book = json.loads(raw)
    if (book.get("schemaVersion") != 1 or book.get("id") != path.stem
            or not SLUG.fullmatch(path.stem) or book.get("section") != section
            or not nonblank(book.get("title")) or not nonblank(book.get("updatedAt"))):
        raise ValueError(f"{path}: invalid book identity or metadata")
    kind = book.get("kind", "book")
    if kind == "page-content":
        texts, datasets = book.get("texts"), book.get("datasets")
        if (not isinstance(texts, dict) or not isinstance(datasets, dict)
                or any(not isinstance(text, str) for text in texts.values())
                or any(not SLUG.fullmatch(key) for key in [*texts, *datasets])):
            raise ValueError(f"{path}: invalid text or dataset slots")
        return {
            "id": book["id"], "section": section, "kind": kind, "title": book["title"],
            "path": f"{section}/{path.name}", "updatedAt": book["updatedAt"],
            "version": sha256(raw).hexdigest(),
        }
    if kind not in {"book", "hadith-translations"} or (kind != "book" and section != "hadisja"):
        raise ValueError(f"{path}: invalid book kind")
    pages = book.get("pages")
    if not isinstance(pages, list) or (not pages and kind == "book"):
        raise ValueError(f"{path}: pages are required")
    previous = 0
    for page in pages:
        number = page.get("number")
        content = page.get("content")
        if (type(number) is not int or number <= previous or not isinstance(content, dict)
                or not content or not set(content) <= LANGUAGES
                or ("title" in page and not isinstance(page["title"], str))):
            raise ValueError(f"{path}: invalid or unordered page {number}")
        previous = number
        for language, blocks in content.items():
            if not isinstance(blocks, list) or not blocks or any(
                not isinstance(block, dict) or block.get("type") not in BLOCK_TYPES
                or not nonblank(block.get("text")) for block in blocks
            ):
                raise ValueError(f"{path}: invalid {language} content on page {number}")
    return {
        "id": book["id"], "section": section, "kind": kind, "title": book["title"],
        "path": f"{section}/{path.name}", "updatedAt": book["updatedAt"],
        "version": sha256(raw).hexdigest(),
    }


def generate(root):
    data = root / "data"
    books = []
    sections = json.loads((data / "rubrike.json").read_text(encoding="utf-8"))
    for section in sections:
        for path in sorted((data / section).glob("*.json")):
            books.append(read_book(path, section))
    required = json.loads((data / "obavezni-izvori.json").read_text(encoding="utf-8"))
    for path, groups in required.items():
        source = json.loads((data / (path + ".json")).read_text(encoding="utf-8"))
        for field, keys in groups.items():
            missing = set(keys) - source[field].keys()
            if missing:
                raise ValueError(f"{path}: required {field} slots missing: {', '.join(sorted(missing))}")
    encoded = json.dumps([sections, books], ensure_ascii=False, sort_keys=True).encode("utf-8")
    catalog = {"schemaVersion": 1, "version": sha256(encoded).hexdigest(), "sections": sections, "books": books}
    (data / "katalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if root.name == "_site":
        publish_home(root, catalog)
    print(f"Katalog: {len(books)} JSON datoteka.")



def publish_home(root, catalog):
    from html import escape
    from urllib.parse import urlencode

    path = root / "index.html"
    original = path.read_text(encoding="utf-8")
    match = re.search(r'<script\b[^>]*\bid="ri-page-template"[^>]*>(.*?)</script>', original, re.S)
    if not match:
        return  # Already a static page.
    page = json.loads(match[1])
    if page["section"] != "angluni" or page.get("portal"):
        return
    data = root / "data"
    sources = {}
    def fill(slot):
        name, kind, key = slot.groups()
        if name not in sources:
            sources[name] = json.loads((data / (name + ".json")).read_text(encoding="utf-8"))
        source = sources[name]
        if kind == "t":
            return escape(source["texts"][key])
        value = source["datasets"][key]
        if kind == "m":
            value = {**source["datasets"]["osnova"], **value}
        if kind == "q":
            value = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("<", r"\u003c").replace("\u2028", r"\u2028").replace("\u2029", r"\u2029")
    html = re.sub(r"@@RI:([a-z0-9-]+/[a-z0-9-]+):([tjqm]):([a-z0-9-]+)@@", fill, page["html"])
    items = json.loads((data / "zajednicko/navigacija.json").read_text(encoding="utf-8"))["datasets"]["stavke"]
    links = []
    for item in items:
        href = item["appHref"]
        if not re.fullmatch(r"(?:#[a-z0-9-]+|(?:[a-z0-9_-]+/)*[a-z0-9_-]+\.html(?:#[a-z0-9-]+)?)", href):
            raise ValueError(f"Invalid menu URL: {href}")
        route = f' data-ri-menu-route="{href[1:]}"' if href.startswith("#") else ""
        flight = ' id="ri-flight-menu-link"' if href == "#ri-flight" else ""
        links.append(f'<a class="ri-menu-link" href="{href}"{route}{flight}><span class="ri-menu-icon" aria-hidden="true">{escape(item["icon"])}</span><span>{escape(item["label"])}</span><b aria-hidden="true">›</b></a>')
    html, count = re.subn(r'(<div class="design-menu ri-menu-items">).*?(</div>)', lambda m: m[1] + "".join(links) + m[2], html, count=1, flags=re.S)
    if count != 1 or not links or "@@RI:" in html:
        raise ValueError("Incomplete home page")
    # The home page already contains its text and menu. Keep additional book links
    # in the same active section where addBooks() would normally append them.
    books = [b for b in catalog["books"] if b["kind"] == "book" and b["section"] in ("angluni", "donacia")]
    if page.get("extra") and books:
        entries = []
        for b in books:
            query = escape(urlencode({"section": b["section"], "book": b["id"]}))
            entries.append(f'<li><a href="taberi/historija.html?{query}#historija">{escape(b["title"])}</a></li>')
        nav = '<nav aria-label="Knjige u rubrici"><ul>' + "".join(entries) + "</ul></nav>"
        html, count = re.subn(r'(<section\b[^>]*\bid="home"[^>]*>.*?)(</section>)', lambda m: m[1] + nav + m[2], html, count=1, flags=re.S)
        if not count:
            raise ValueError("Home book list target missing")
    # Fetch the optional typeface without blocking the first page paint.
    font = re.search(r"@import url\('(https://fonts\.googleapis\.com/[^']+)'\);", html)
    if font:
        css = f'<link rel="stylesheet" href="{escape(font[1])}" media="print" onload="this.media=\'all\'">'
        html = html.replace(font[0], "", 1).replace("</head>", css + "</head>", 1)
    path.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    generate(Path(sys.argv[1]))
