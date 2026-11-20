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
    print(f"Katalog: {len(books)} JSON datoteka.")


if __name__ == "__main__":
    generate(Path(sys.argv[1]))
