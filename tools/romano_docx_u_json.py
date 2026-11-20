"""Convert a Word document into one ROMANO ISLAM book JSON file.

Double-click for the file picker, or run with --help for command-line use.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import tempfile
import unicodedata
import xml.etree.ElementTree as ET
from zipfile import BadZipFile, ZipFile

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
SECTION_OPTIONS = {'angluni': 'Angluni Strana', 'curani': 'Čitin o Kur’ani', 'bosanski': 'Šun hem Čitin o Kur’ani bosanski', 'sun-curani': 'Šun o Kur’ani', 'latinica': 'Šun hem Čitin Arapski Latinica', 'izgovor': 'Sar te čitine i te vačere čisto Arapski', 'offline': 'Kur’an Offline ko Avioni', 'pamtime': 'Pamtime Ajetja', 'amendar': 'Amendar', 'tefsirja': 'Tefsirja', 'hadisja': 'Hadisja', 'ehli-bejt': 'Ehli Bejt', 'historia': 'Historia', 'tabari': 'Historia Tabaria', 'e-knjige': 'E-knjige', 'steluibe': 'Šteluibe', 'donacia': 'Donacia', 'datenschutz': 'Datenschutz', 'impressum': 'Impressum', 'izvori': 'Izvori i licence'}
SECTIONS = tuple(SECTION_OPTIONS)
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
PAGE = re.compile(r"Stranica(?: izvornika)?\s+(\d+)", re.I)
HADITH = re.compile(r"Hadis\s+(\d+)", re.I)
UNSUPPORTED = {
    W + tag for tag in ("drawing", "pict", "object", "footnoteReference", "endnoteReference",
                        "altChunk", "del", "ins", "commentReference", "tbl", "txbxContent")
}


def slugify(value):
    value = unicodedata.normalize("NFKD", value.lower().replace("đ", "d"))
    value = "".join(char for char in value if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def paragraph_text(paragraph):
    text = []
    for item in paragraph.iter():
        if item.tag == W + "t":
            text.append(item.text or "")
        elif item.tag == W + "tab":
            text.append("\t")
        elif item.tag in {W + "cr", W + "br"} and item.get(W + "type") != "page":
            text.append("\n")
        elif item.tag == W + "noBreakHyphen":
            text.append("\u2011")
        elif item.tag == W + "softHyphen":
            text.append("\u00ad")
    return "".join(text)


def read_pages(source, language, kind, start):
    if source.suffix.lower() != ".docx":
        raise ValueError("Izaberi .docx datoteku.")
    with ZipFile(source) as document:
        tree = ET.fromstring(document.read("word/document.xml"))
    body = tree.find(W + "body")
    if body is None:
        raise ValueError("Word dokument nema glavni tekst.")
    if any(item.tag in UNSUPPORTED for item in body.iter()):
        raise ValueError("Word sadrži tabele, slike, fusnote, komentare ili praćene izmjene. Ovaj pretvarač čuva običan tekst i neće preskočiti te elemente.")

    marker = HADITH if kind == "hadith-translations" else PAGE
    pages = []
    current = None
    prefix = []
    for paragraph in body.iter(W + "p"):
        text = paragraph_text(paragraph)
        if not text.strip():
            continue
        if text.lstrip().startswith("[ODBIJENO"):
            raise ValueError("U Wordu postoji odbijena stranica. Dovrši je prije objave.")
        boundary = marker.fullmatch(text.strip())
        if boundary:
            number = int(boundary[1])
            if number < 1 or (pages and number <= pages[-1]["number"]):
                raise ValueError("Oznake stranica ili hadisa moraju biti jedinstvene i rastuće.")
            current = prefix
            prefix = []
            pages.append({"number": number, "content": {language: current}})
            continue
        style = paragraph.find(f"{W}pPr/{W}pStyle")
        name = style.get(W + "val", "") if style is not None else ""
        block = {"type": "heading" if name.startswith("Heading") or name == "Title" else "paragraph", "text": text}
        (prefix if current is None else current).append(block)
    if not pages:
        if kind == "hadith-translations":
            raise ValueError("Za zbirku koristi oznake „Hadis 1“, „Hadis 2“… iznad pojedinačnih tekstova.")
        if prefix:
            pages.append({"number": 1, "content": {language: prefix}})
    if not pages or any(not page["content"][language] for page in pages):
        raise ValueError("Dokument nema sadržaj ili ima praznu označenu stranicu.")
    if start is not None:
        if start < 1 or kind == "hadith-translations":
            raise ValueError("Za pomak napravi početnu stranicu ≥ 1. Oznake brojeva hadisa ne pomjeraju se.")
        shift = start - pages[0]["number"]
        for page in pages:
            page["number"] += shift
    return pages


def convert(source, root, section, title, book_id=None, language="bs",
            kind=None, start=None, merge=False):
    title = title.strip()
    book_id = book_id or slugify(title)
    if not title or not SLUG.fullmatch(book_id) or section not in SECTIONS:
        raise ValueError("Unesi naslov i ID s malim slovima, brojevima i crticama.")
    if language not in {"bs", "ar"}:
        raise ValueError("Odaberi jezik bs ili ar.")
    data = root if root.name == "data" else root / "data"
    target = data / section / (book_id + ".json")
    previous = None
    if target.exists():
        if not merge:
            raise FileExistsError(f"Datoteka već postoji. Izaberi spajanje ili novi ID.\n{target}")
        previous = json.loads(target.read_text(encoding="utf-8"))
        if previous.get("schemaVersion") != 1 or previous.get("id") != book_id or previous.get("section") != section:
            raise ValueError("Postojeća datoteka pripada drugoj knjizi ili verziji formata.")
        previous_kind = previous.get("kind", "book")
        if previous_kind == "page-content":
            raise ValueError("Ovaj ID koristi postojeća stranica. Odaberi novi ID za Word dokument.")
        if kind and kind != previous_kind:
            raise ValueError("Vrsta knjige ne odgovara postojećoj datoteci.")
        kind = previous_kind
    kind = kind or "book"
    if kind not in {"book", "hadith-translations"} or (kind == "hadith-translations" and section != "hadisja"):
        raise ValueError("Odaberi ispravnu vrstu knjige.")
    if previous and kind == "book" and start is None:
        raise ValueError("Za ispravku postojeće knjige upiši tačan broj prve stranice koju zamjenjuješ.")
    updates = read_pages(source, language, kind, start)
    data = previous or {"schemaVersion": 1, "id": book_id, "section": section, "kind": kind, "title": title}
    pages = {p["number"]: p for p in data.get("pages", [])}
    for page in updates:
        existing = pages.get(page["number"])
        if existing:
            existing["content"].update(page["content"])
        else:
            pages[page["number"]] = page
    data["pages"] = [pages[number] for number in sorted(pages)]
    data["updatedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", dir=target.parent,
                                     suffix=".tmp", delete=False) as file:
        temporary = Path(file.name)
        try:
            json.dump(data, file, ensure_ascii=False, indent=2)
            file.write("\n")
            file.flush()
        except BaseException:
            file.close()
            temporary.unlink(missing_ok=True)
            raise
    try:
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
    return target


def choose_section(parent):
    import tkinter as tk
    from tkinter import ttk

    dialog = tk.Toplevel(parent)
    dialog.title("ROMANO ISLAM")
    dialog.resizable(False, False)
    ttk.Label(dialog, text="Odaberi rubriku").pack(anchor="w", padx=18, pady=(16, 6))
    choices = tuple(SECTION_OPTIONS)
    dropdown = ttk.Combobox(dialog, values=tuple(SECTION_OPTIONS.values()), state="readonly", width=48)
    dropdown.pack(padx=18)
    dropdown.current(0)
    result = []

    def accept(event=None):
        result.append(choices[dropdown.current()])
        dialog.destroy()

    ttk.Button(dialog, text="Dalje", command=accept).pack(pady=16)
    dialog.bind("<Return>", accept)
    dialog.bind("<Escape>", lambda event: dialog.destroy())
    dialog.grab_set()
    dropdown.focus_set()
    parent.wait_window(dialog)
    return result[0] if result else None


def gui():
    import tkinter as tk
    from tkinter import filedialog, messagebox, simpledialog
    window = tk.Tk()
    window.withdraw()
    try:
        path = filedialog.askopenfilename(title="Odaberi prevedeni Word dokument", filetypes=[("Word", "*.docx")])
        if not path:
            return
        source = Path(path)
        section = choose_section(window)
        if not section:
            return
        title = simpledialog.askstring("ROMANO ISLAM", "Naslov knjige", initialvalue=source.stem, parent=window)
        if not title:
            return
        book_id = simpledialog.askstring("ROMANO ISLAM", "ID datoteke", initialvalue=slugify(title), parent=window)
        if not book_id:
            return
        if not SLUG.fullmatch(book_id):
            raise ValueError("ID koristi mala slova, brojeve i crtice.")
        output = filedialog.askdirectory(title="Odaberi folder GitHub projekta ili folder za izvoz", initialdir=source.parent)
        if not output:
            return
        root = Path(output)
        folder = root if root.name == "data" else root / "data"
        target = folder / section / (book_id + ".json")
        existing = target.is_file()
        if existing and not messagebox.askyesno("ROMANO ISLAM", "Ažurirati označene stranice u postojećoj knjizi?"):
            return
        previous_kind = json.loads(target.read_text(encoding="utf-8")).get("kind", "book") if existing else None
        start = None
        if existing and previous_kind == "book":
            start = simpledialog.askinteger("ROMANO ISLAM", "Koji je stvarni broj prve stranice u ovom Wordu?", minvalue=1, parent=window)
            if start is None:
                return
        result = convert(source, root, section, title, book_id=book_id, start=start, merge=existing)
        messagebox.showinfo("ROMANO ISLAM", f"JSON je spreman.\n\n{result}")
    except (ValueError, OSError, ET.ParseError, KeyError, BadZipFile) as error:
        messagebox.showerror("ROMANO ISLAM", str(error))
    finally:
        window.destroy()


def main():
    import sys
    if len(sys.argv) == 1:
        gui()
        return
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("docx", type=Path)
    parser.add_argument("--root", type=Path)
    parser.add_argument("--section", choices=SECTIONS, required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--id", dest="book_id")
    parser.add_argument("--language", choices=("bs", "ar"), default="bs")
    parser.add_argument("--kind", choices=("book", "hadith-translations"))
    parser.add_argument("--start-page", type=int)
    parser.add_argument("--merge", action="store_true")
    args = parser.parse_args()
    try:
        print(convert(args.docx, args.root or args.docx.parent, args.section, args.title,
                      args.book_id, args.language, args.kind, args.start_page, args.merge))
    except (ValueError, OSError, ET.ParseError, KeyError, BadZipFile) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()
