# ING Direct (Spain) Import Guide

## Overview

FinTrack supports importing transaction history from ING Direct Spain via their Excel (.xls) export. This covers all ING account types: checking (Cuenta Nómina), secondary accounts, and savings accounts.

## How to Export from ING

1. Go to ing.es → **Mi Posición**
2. Select the account you want to export
3. Click **"Buscar movimientos"** and select the date range
4. Click the **download icon** → choose **Excel (.xls)**
5. Repeat for each account

## Import in FinTrack

1. Go to **Accounts** → click on **ING** (or add it via "Add Bank")
2. Click **"Upload ING Excel Files"**
3. You can upload multiple files at once (one per account)
4. **Preview** shows: account number, date range, transaction count, sample
5. Click **"Confirm Import"**

## Deduplication

Uses **date + amount + balance** as unique key. Safe to re-import same files.

## Transaction Classification

| Type | Description |
|------|-------------|
| `expense` | Regular purchases, payments |
| `income` | Salary, received transfers |
| `transfer_in` | Incoming transfers |
| `transfer_out` | Outgoing transfers |
| `savings` | ING savings roundups |

## Internal Transfer Detection (Expenses)

The Expenses page detects internal transfers between own accounts:
- Savings roundups → excluded
- Transfers between own ING accounts → excluded
- Transfers to yourself (ING → TR, matched by name/IBAN) → excluded
- Broker trades (buy/sell) → excluded
- Transfers to other people → counted as real expense/income

## Balance Tracking

Combined balance of all ING accounts tracked as EUR asset in Banking (separate from Portfolio).
