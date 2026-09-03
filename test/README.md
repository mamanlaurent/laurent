# Test suites

Every suite drives the real page in headless Chromium and asserts on the DOM the app
actually produces. There is no framework — each file is a standalone Node script.

## Running them

```sh
node wrap.js          # builds wrapped.html (live data) and wrapped-seed.html (seed data)
node test-slip5665.js # or any other suite
```

Requires Playwright and a Chromium build; the paths at the top of each file point at the
ones used during development.

**The suites run against `wrapped-seed.html`** — a minimal seed catalogue. Pointing them at
real data makes them fail on fixture collisions (a suite expecting two "GOOD TIMES"
products meets forty-five of them) rather than on real bugs. `test-yourdata.js` is the
deliberate exception: it runs against the shipped data to prove a release does not disturb
the real catalogue.

**Type, don't fill.** Several suites use `pg.type(..., {delay})` rather than `fill()`. The
two worst bugs in this project — search boxes losing everything after the first character,
and the scanner's refocus timer truncating text typed anywhere on the page — only appeared
under real keystrokes.

## What each one covers

| Suite | Covers |
|---|---|
| `test-slip5665.js` | The customer's real container: 20 lines, 1,235 boxes, 27 pallets, 195 loose, header block |
| `test-import.js` | Column mapping, ignored unit/weight columns, export contents |
| `test-totals.js` | A slip's totals footer must not become products |
| `test-flavor.js` | Flavour/size as their own fields; hyphenated barcodes; slip lines with no flavour column |
| `test-28.js` | Splitting a product that an earlier import merged into one with 28 barcodes |
| `test-newprod.js` | Creating a product from a scan of something on neither slip nor catalogue |
| `test-manualbc.js` | Typing a barcode in by hand on the Products page |
| `test-core.js` | Scan / enroll / pallets / filters / persistence across a reload |
| `test-header.js` | Invoice letterhead cell placement, the Excel sheet, deletes |
| `test-completed.js` | Exporting a shipment after completion |
| `test-delall.js` | Bulk catalogue deletion, scoped and full |
| `test-roundtrip.js` | Catalogue CSV export → re-import restores every barcode |
| `test-backup.js` | Backup export → wipe → restore returns everything |
| `test-sync.js` | Local vs cloud copy divergence, and the way back |
| `test-asks.js` | Editable employees, Customer ID on shipments |
| `test-intake.js` | Importer intake: price-list load, the nine categories of container SEGU-522984-8, pallet overrides |
| `test-tabs.js` | Container TEMU-639444-2 end to end: header carried across, nine categories, ALL rate, fees, all four sheets |
| `test-yourdata.js` | A release leaves the real catalogue intact |
