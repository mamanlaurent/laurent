# Dockside Receiving

Warehouse receiving and barcode verification for inbound containers.

Live prototype: https://claude.ai/code/artifact/efa62961-cc70-4872-b048-35a2fdc89d78

`dockside-receiving.html` is the entire application — one self-contained file, no build
step, no dependencies. Opening it in a browser runs it.

---

## What it does

**Receiving.** Create a container, import the packing slip from Excel or CSV, then scan
boxes as they come off the truck. Expected / Scanned / Remaining / Difference update live
for every item, on every connected device at once. Wrong product, over-count, unknown
barcode and not-on-slip each get their own beep and colour.

**It learns barcodes.** The packing slips this was built for have no SKU or barcode column —
the product description *is* the identity. So the first time an unknown barcode is scanned,
the operator is asked once which line it is; the barcode is then bound to that product
permanently and recognised instantly on every future container.

**Also:** clients with full receiving history, master product catalogue (bulk-clearable —
whole thing or just what the search is showing, and **Export CSV round-trips it back,
barcodes included**), pallet counts,
final reconciliation (MATCH / SHORT / OVER) with forced confirmation on discrepancies,
an append-only audit trail, searchable shipment history, and CSV export that reproduces
the original packing slip's own layout — its real columns only, with the unit/weight
columns and the spreadsheet's trailing empty columns dropped.

---

## The five problems that shaped the design

Read this before changing the import or scanning code. Each of these was a real failure
found against a real packing slip.

### 1. Quantity columns lie

**The customer's standard slip (colour-coded by them):**

| Colour | Header | Meaning |
|---|---|---|
| Yellow | *(merged, unlabelled)* | Total boxes for a whole description group (106 = 47+48+11) |
| **Green** | **Quantity of Master Cases** | **Boxes of THIS line — the number we track** |
| Blue | Description | Product identity (no SKU, no barcode) |
| Peach | Units Quantity | **Total cigars** for the line (cases x units per case) — never a box count |
| Purple | Number of pallets | Pallets for that row or merged group (decimal) |
| Red | Extra | Loose boxes left over → go on a mixed pallet |

`autoMapImportColumns()` recognises this layout by its headers and maps it outright —
no guessing. The yellow group total, the pallet columns and the row counter are all
excluded from the quantity search.

**Three columns are dropped entirely** — *Units Quantity*, *Net Weight Per Case* and
*Gross Weight Per Case*. They are unit and weight totals, never box counts, and *Units
Quantity* is the single most dangerous column to mistake for one: on a full slip it runs
into the millions. `IGNORED_COL_PATTERNS` keeps them out of the Quantity dropdown, out of
the stored row (`data-raw`) and header (`data-srcheaders`), and out of the CSV export —
including for shipments imported before the exclusion existed, which are filtered again at
export time. The import mapper names the columns it left out, so the operator can see it
happened.

**Three ways this went wrong before, all now blocked:**

- Picking *Units Quantity* → millions of "boxes" (2,227,549 on the customer's real slip),
  because those are cigars: 25 cases x 1,800 per case = 45,000 on one line alone.
- Picking the *yellow* group total → right total, wrong per-line numbers
  (Vanilla blank instead of 173).
- Picking the *Description* → **2,227,549**. `replace(/[^0-9]/g,'')` concatenated every
  digit in the text: "1800 Ct … 12.25 Lbs … 3/1.19" became 180012251119.

Guards, in order of importance:

1. **Quantities are parsed with `parseQtyCell()`** — the first number in the cell, never
   every digit concatenated.
2. **A column with any text in it is not a number column** (`cellIsBareNumber`), so text
   columns are *never offered* in the Quantity dropdown.
3. A column whose values equal the sum of the rows beneath it is a group subtotal
   (`isSubtotalColumn`); a column of repeating large round numbers is a pack size
   (`looksLikePackSize`); a column with gaps loses to a complete one.
4. Absurd results (>20k on a line, >200k total) block shipment creation outright.
5. Every numeric column's **total is shown in the dropdown**, so a wrong pick is visible.

Pallets come across too: `Number of pallets` and `Extra` are summed to pre-fill the
shipment's pallet count and notes.

`autoMapImportColumns()` therefore:
- rejects a column whose values equal the sum of the rows beneath it (`isSubtotalColumn`)
- rejects columns of repeating large round numbers (`looksLikePackSize`)
- penalises headings containing `unit`/`piece`, rewards `case`
- **heavily penalises any column with gaps when a complete column exists** — a per-line
  quantity has a value on every line

And then it does not trust itself: the operator confirms the mapping, with **each column's
total shown in the dropdown** so a wrong pick is obvious at a glance.

### 2. One row of the master list is one product

The customer's master list repeats a description across dozens of rows that differ only in
a **Flavour** column and a barcode — 28 flavours of one cigarillo under one description.
Matching on description alone folded all 28 into a single product carrying 28 barcodes, so
every one of those boxes scanned as the same item and the flavour was nowhere.

Rules now, in order:

1. **A product's identity is description + flavour + size** (`skuIdentity`), never
   description alone.
2. **A barcode belongs to exactly one product.** On import, each row claims its barcodes
   and they are stripped from any other record holding them — which repairs a catalogue an
   earlier import already merged. Re-importing the master list is the fix.
3. **No two rows of one file may land on the same record** (`claimed`), even if they look
   identical; item codes are made unique and deterministic by `uniqueSkuCode()`, folding in
   the barcode so re-imports reproduce the same codes.
4. **Barcodes are normalised** (`normBarcode`): master lists print `8-42426-19694-9`, a
   scanner sends `842426196949`. Digits-only codes lose their separators on both sides of
   every comparison. Alphanumeric Code 128 codes are left untouched.

A packing slip has no flavour column, so a slip line names a description and nothing more.
Such a line is matched to the catalogue by description when that is unambiguous, a scan of
any flavour under that description counts against it, and the scan records which product
was really in the operator's hand (`data-prodsku`) so the export reports the flavours
actually received.

### 3. Slips have a footer, and the footer is not products

Under the last product row the slip totals itself up: *Cigars Quantity*, *Wrappers
Quantity*, *Net Weight*, *Gross Weight*, *TOTAL*. Those labels sit in the Description
column, so the importer read them as four more products and wrote them into the master
catalogue — permanently, where they then showed up in the enrollment picker every time an
unknown barcode was scanned.

`looksLikeSummaryRow()` rejects a row whose description is a short generic label
(four words or fewer, matching `SUMMARY_LABEL`) **and** has no case count against it. Both
halves matter: a real product line always carries boxes, and real descriptions are long.

### 4. The header row is not row 1

Slips start with a letterhead block. `detectHeaderRow()` scores the first 25 rows for
column-heading words. `sniffHeaderFields()` reads `No:` / `CONTAINER:` / `Date:` out of the
block above it to pre-fill the shipment.

### 5. Re-render destroys what the user is typing

Three bugs shipped from this. All are easy to reintroduce:

- **Never re-render a view from inside its own `input` handler.** Filters and searches
  re-render only their results container (`#reportResults`, `#skuResults`,
  `#clientResults`). Re-rendering the whole view drops every character after the first.
- **The scanner refocus timer must never steal focus from an element in use.** It skips
  any focused `INPUT`/`TEXTAREA`/`SELECT`/`BUTTON`/contenteditable. Without that guard it
  truncated anything typed anywhere on the receiving page.
- **A greyed-out button under a wall of warning text reads as broken, not as one more
  step.** The bulk-delete confirmation lists everything at stake, and the confirm button sat
  below it disabled with no visible reason — so it says `Type DELETE ALL to confirm` until
  the word matches, and the field takes focus when the modal opens.
- **Anything outside the results container then goes stale, and stale destructive controls
  are dangerous.** The catalogue's bulk-delete button sat in the header, so a search left it
  reading "Delete all 18" while the action it would run deleted the 5 rows on screen.
  `paintSkuDeleteButton()` repaints the label on every filter change. If you add a control
  whose meaning depends on the filter, repaint it the same way.

---

## How the data is stored

Everything lives in `<div id="db" hidden>` as DOM elements with `data-*` attributes.

**Persistence has two layers, and neither is a database:**

The file in this repo is a **snapshot of the live artifact, data included** — the `#db`
block carries the real clients, shipments, catalogue and audit trail. That makes the repo a
recoverable backup, and it means one rule matters when redeploying: **read the published
artifact first and merge its `#db` into this file before publishing**, or you overwrite
whatever was entered on the warehouse floor since the last commit.

1. **`localStorage`** — every change is written to this device immediately (debounced
   ~350ms, plus on `beforeunload` and tab-hide). Survives reload and browser restart.
   On boot, `loadLocalIfNewer()` compares the local copy's timestamp against the one
   baked into the served page and takes whichever is newer.
2. **`artifact.publish()`** — "Save to cloud" rebuilds the whole page with the current
   `#db` baked in and republishes it, so other devices see the data next time they open
   the link. `buildFullPage()` reassembles the document around the tagged `#appStyle`
   and `#appScript` elements — **never serialise the live DOM**, it carries the host's
   injected runtime. It refuses to publish if any critical piece is missing.

### The mistake this replaced — do not repeat it

The first version marked `#db` with `artifact-sync` and assumed the platform synced it
across viewers. **`artifact-sync` regions only work on live docs. This is a classic
artifact.** The attribute was inert: nothing was ever persisted or shared, data lived only
in the tab's memory, and a spurious "read-only, ask the owner for access" banner appeared
because the code treated the failing sync as a permission problem. If you are reaching for
`sync()` or `edit()`, check which kind of artifact this is first.

### Consequences to design around

- **One active device at a time.** Cloud save is last-writer-wins at page granularity.
  Simultaneous scanning from two devices is *not* supported here — it needs the hosted
  version.
- **Publishing reloads the page**, so it runs on demand and on shipment completion, never
  mid-scan.
- Backup export/import (JSON) is the dependable way to move data between devices.

| Element | Holds |
|---|---|
| `#settings` | team PIN, whether it is still the default |
| `#roster .employee` | users: name, role, active, owner |
| `#clients .client` | clients: name, contact, notes |
| `#skuMaster .sku` | products: code, description, flavour, size, barcodes (CSV), active |
| `#shipments .shipment` | container header, plus `.line` and `.scan` children |
| `#auditLog .entry` | append-only audit records |

Notes:
- `data-rid` is used for record ids, not `data-id` — the platform stamps its own `data-id`.
- **Scans are append-only.** Counts are derived by counting `.scan` elements, never by
  incrementing a shared number. That is what stops two people scanning the same container
  from clobbering each other's totals.
- A correction voids a scan (`data-void="true"`); nothing is destroyed.
- `.line[data-raw]` keeps the original spreadsheet row, and the shipment keeps
  `data-srcheaders` / `data-slipmeta`, so the CSV export can reproduce the slip's own
  columns and letterhead.

---

## Barcode scanning

**USB / Bluetooth scanners** act as keyboards: they type the code and press Enter. Nothing
to install. The scan field auto-refocuses so there is no clicking between boxes — that
behaviour is on by default on desktop, off on touch devices (it would reopen the on-screen
keyboard every second), and toggleable in the scan panel.

**Camera scanning** has a self-contained decoder — EAN-13, UPC-A, EAN-8, Code 128, ITF-14 —
because `BarcodeDetector` does not exist on iOS Safari or Firefox. It requires two
scanlines to agree before counting a box, so a misread cannot silently become a case.
It needs roughly 3 pixels per barcode module.

**Known blocker:** the artifact runs in a frame that is not granted camera permission, so
`getUserMedia` is refused before the page sees it. Nothing in this code can change that.
It is fixed by hosting the app on its own domain (see below).

---

## Known limitations

These are properties of running as an artifact, not bugs:

1. **The PIN is accountability, not security.** It is readable in the page source. Anyone
   with the link can open the app.
2. **Camera scanning is blocked by the host frame.**
3. **No simultaneous multi-device scanning.** See the persistence section — this was in the
   original requirements and the artifact cannot meet it.
4. **Editing requires the owner's Claude account.** Staff logins are not possible here.
5. **No server-side backup you control.** Export a backup file.

---

## Path to a hosted system

The application logic transfers as-is. What changes is what sits underneath it.

| Concern | Now | Hosted |
|---|---|---|
| Storage | `localStorage` + republish | Postgres |
| Identity | shared PIN | real accounts, hashed passwords, roles |
| Camera | blocked by host frame | works — own domain, own permissions |
| Backups | platform-managed | your own automated backups |
| Access | anyone with the link | invited users only |

The parts worth keeping verbatim: the XLSX reader, the column-mapping heuristics, the
barcode decoder, the enrollment flow, and the reconciliation rules. Those encode real
lessons from real slips.

---

## Testing

There is no test runner in the repo; verification was done by driving the real page with
Playwright. Any change to import, scanning, saving or filtering should be re-verified the
same way, **typing character by character rather than setting values at once** — the two
worst bugs in this project only appeared under real typing.

Two suites live alongside the app during development (`test-import.js`, `test-core.js`):
import mapping and export contents, and the scan/enroll/save/filter loop. Both run against
desktop and iPhone 13 viewports.

Covered at last verification: PIN accept/reject, client CRUD and duplicate blocking,
shipment creation, XLSX and CSV import, quantity-column selection against three slip
layouts, pallets, expected-qty edits, scan / enroll / skip / reject / void, manual lines,
product CRUD, bulk catalogue deletion (scoped and full, with its confirmation words),
all report filters, user management, PIN change, audit logging, deletion
guards, and completion with discrepancy confirmation — on both desktop and iPhone
viewports.
