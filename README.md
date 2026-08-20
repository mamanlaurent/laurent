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

**Also:** clients with full receiving history, master product catalogue, pallet counts,
final reconciliation (MATCH / SHORT / OVER) with forced confirmation on discrepancies,
an append-only audit trail, searchable shipment history, and CSV export that reproduces
the original packing slip's own layout.

---

## The three problems that shaped the design

Read this before changing the import or scanning code. Each of these was a real failure
found against a real packing slip.

### 1. Quantity columns lie

A real slip carried three numeric columns that all look like quantities:

| Column | Content | Sums to |
|---|---|---|
| A | Category subtotal, merged across rows (106 = 47+48+11) | 1,256 |
| B | Per-flavour case count — **the correct one** | 1,256 |
| D | "Units Quantity" = cigars per case (720, 1080, 1440) | 16,560 |

Picking D produced 16,560 expected cases. Picking A produced the right *total* but wrong
*per-line* numbers (Vanilla blank instead of 173).

`autoMapImportColumns()` therefore:
- rejects a column whose values equal the sum of the rows beneath it (`isSubtotalColumn`)
- rejects columns of repeating large round numbers (`looksLikePackSize`)
- penalises headings containing `unit`/`piece`, rewards `case`
- **heavily penalises any column with gaps when a complete column exists** — a per-line
  quantity has a value on every line

And then it does not trust itself: the operator confirms the mapping, with **each column's
total shown in the dropdown** so a wrong pick is obvious at a glance.

### 2. The header row is not row 1

Slips start with a letterhead block. `detectHeaderRow()` scores the first 25 rows for
column-heading words. `sniffHeaderFields()` reads `No:` / `CONTAINER:` / `Date:` out of the
block above it to pre-fill the shipment.

### 3. Re-render destroys what the user is typing

Two bugs shipped from this. Both are easy to reintroduce:

- **Never re-render a view from inside its own `input` handler.** Filters and searches
  re-render only their results container (`#reportResults`, `#skuResults`,
  `#clientResults`). Re-rendering the whole view drops every character after the first.
- **The scanner refocus timer must never steal focus from an element in use.** It skips
  any focused `INPUT`/`TEXTAREA`/`SELECT`/`BUTTON`/contenteditable. Without that guard it
  truncated anything typed anywhere on the receiving page.

---

## How the data is stored

Everything lives in `<div id="db" artifact-sync hidden>` as DOM elements with `data-*`
attributes. The Artifact platform syncs that subtree across viewers, which is what makes
multi-device scanning work. There is no separate database.

| Element | Holds |
|---|---|
| `#settings` | team PIN, whether it is still the default |
| `#roster .employee` | users: name, role, active, owner |
| `#clients .client` | clients: name, contact, notes |
| `#skuMaster .sku` | products: code, description, barcodes (CSV), active |
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
3. **Sync is best-effort**, not a transactional database. The append-only design makes lost
   counts unlikely, not impossible.
4. **No server-side backup you control.** Data lives with the artifact.

---

## Path to a hosted system

The application logic transfers as-is. What changes is what sits underneath it.

| Concern | Now | Hosted |
|---|---|---|
| Storage | synced DOM subtree | Postgres |
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

Covered at last verification: PIN accept/reject, client CRUD and duplicate blocking,
shipment creation, XLSX and CSV import, quantity-column selection against three slip
layouts, pallets, expected-qty edits, scan / enroll / skip / reject / void, manual lines,
product CRUD, all report filters, user management, PIN change, audit logging, deletion
guards, and completion with discrepancy confirmation — on both desktop and iPhone
viewports.
