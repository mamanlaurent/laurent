# Importer packing slip → pallet breakdown → two invoices

Reverse-engineered from four real documents for container SEGU-522984-8 (importer PSL
5737 / invoice 5737R, internal workbook PSLHA57376514, Price List Update 2). Every number
below was reproduced from the inputs and checked against the customer's own workbook.

## The four documents

| Document | Role |
|---|---|
| Importer packing slip (`PSL_5737.xlsx`) | 24 detail lines, one per flavour: cases, importer code, description, units, net/gross weight |
| Importer invoice (`INVOICE_5737R.pdf`) | The same shipment in **9 grouped lines** — flavours collapsed, with a price each. A **scan**, no text layer |
| Internal workbook (4 tabs) | What the office actually produces |
| Price list | Lookup: `#/PLT`, `Case Cost (Invoice)`, `Case Cost (Needmaj)`, `HA`, `ALL` |

## The four output tabs

1. **PSL-HA-5737** — the importer's slip, re-headed with Needmaj's letterhead.
2. **Sheet1** — the same lines **plus the pallet breakdown** (the grouped quantity, boxes
   per pallet, pallets, loose boxes).
3. **Invoice-HA-5737** — invoice at **HA** pricing (Hannacan shipments).
4. **Invoice-HA-6514** — invoice to the end customer at **Needmaj case cost**.

## Header rewriting

| Field | Source |
|---|---|
| Ship To / Bill To | Needmaj's customer (Good Times USA LLC) — replaces the importer's |
| `No:` | Needmaj's own running number (6514), **not** the importer's |
| `Customer ID:` | `HA-` + the importer's slip number → `HA-5737` |
| `CONTAINER:` | carried from the importer |
| `P.O. NUMBER` | carried from the importer (81826) |
| `Date:` | the day the paperwork is produced |
| `PERMIT #:` | Needmaj's own (tab 3 only) |

## Grouping — proven

The invoice's grouped description is the packing-slip description **with the flavour name
removed**; the word "flavored" acts as the placeholder where the flavour sat. Grouping by
token similarity between each slip line and each invoice line assigned all 24 lines to the
right one of the 9 groups, and **every group quantity reconciled exactly**
(232, 20, 14, 2, 525, 98, 285, 2, 1 = 1,179).

The quantity match is the checksum: if a group's slip lines do not sum to the invoice's
quantity, the assignment is wrong and must be shown to the operator rather than trusted.

Note the same price-list category splits into several groups by its trailing price code —
Sweetwoods 720 ct appears as `5Pk`, `2/NP`, `2/1.49`, `2/1.69` and `No Price`, priced and
palletised differently. Group identity is category **plus** price code, not category alone.

## Pallets — proven

```
pallets = groupCases / boxesPerPallet
extra   = groupCases − boxesPerPallet × floor(pallets)
```

Reproduces the workbook to the digit, total `25.1513949013949`.

**`boxesPerPallet` cannot be taken from the price list unchecked.** For this container the
operator used 63 where the list says 48 (GT Mini), and 44 where the list says 54 for the
Sweetwoods 2-packs while using the list's 54 for the 5Pk. It must be pre-filled from the
list and remain editable per group.

## Pricing — proven

Rates live in the price list header: `HA = 0.022`, `ALL = 0.02`; the Needmaj markup is
`52.75%` applied to (invoice price + 1).

```
HA price        = invoicePrice × 1.022        (Hannacan shipments — tab 3)
ALL price       = invoicePrice × 1.02         (every other shipment)
Needmaj case    = (invoicePrice + 1) × 1.5275 (tab 4)
```

Reproduced every unit price on tab 3 exactly: 61.32, 85.34, 75.63, 124.68, 131.84, 124.68,
124.68, 124.68.

**The invoice's price wins over the price list.** For the Dark Edition the list holds 130
but the invoice charged 129; the workbook used 129 throughout. The list's
`Case Cost (Invoice)` column is the cross-check, not the source — a difference means the
list is stale and should be flagged.

Round half-up, not banker's: `(129+1) × 1.5275 = 198.575` must become `198.58`.

## Totals — proven

```
tab3 subtotal = Σ cases × HA price                    134,459.02
tab3 total    = subtotal + bank fee 25 + wire fee 75  134,559.02
tab4 subtotal = Σ cases × Needmaj case cost
tab4 S&H      = tab3 total + margin − tab4 subtotal   (a plug, negative)
tab4 total    = tab4 subtotal + S&H                   135,734.02
margin        = tab4 total − tab3 total               1,175
```

The "Shipping & Handling" line on tab 4 is not a cost — it is the balancing figure that
makes the customer's total land on the HA total plus the intended margin.

## Open questions before building the pricing half

1. Where does `boxesPerPallet` really come from when it differs from the price list?
2. Is the margin (1,175) set by hand per shipment, or derived?
3. Are bank 25 / wire 75 always those figures?
4. Is `No:` (6514) a running sequence the system should assign?

## Known quirks in the sample workbook

- The packaging-pallets line is priced 187.88 on tab 4 — the same figure as the row above,
  which looks like a copy-paste rather than a computed value. Everything else computes.
- Tab 1's gross-weight total excludes the packaging line; the net-weight total does not.
