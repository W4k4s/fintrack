# Trade Republic Import — Spec

## PDF Types (3 files)

### 1. Securities Statement (Extracto de Cuenta de Valores)
- Header: "EXTRACTO DE LA CUENTA DE VALORES"
- Format per position: `{quantity} tít. {name} ISIN: {isin} ... {price} {date} {value_eur}`
- Footer: "NÚMERO DE POSICIONES: {n} {total} EUR"
- Sample positions:
  - 11.994983 tít. iShsIII-Core MSCI World U.ETF → ISIN: IE00B4L5Y983 → €1,359.57
  - 1.001811 tít. Invesco Physical Gold ETC → ISIN: IE00B579F325 → €429.94
  - 0.024554 tít. Microsoft Corp. → ISIN: US5949181045 → €8.20

### 2. Crypto Statement (Extracto de Criptomonedas)
- Header: "EXTRACTO DE CRIPTOMONEDAS"
- Format: `{quantity} tít. {name} ({name}) {price} {date} {purchase_price} {gain_loss} {gain_pct} {value_eur}`
- Sample: 0.006644 tít. Bitcoin (Bitcoin) 55,994.63 → €372.03

### 3. Bank Statement (Estado de Cuenta)
- Header: "RESUMEN DE ESTADO DE CUENTA"
- Cash balance in header: "BALANCE FINAL" → €8,878.00
- Transaction rows: `{date} {type} {description} {credit} {debit} {balance}`
- Types: Transferencia, Operar (Buy/Sell trade), Interés, Rentabilidad (Dividend), Transacción con tarjeta, Regalo
- Trade descriptions include ISIN and quantity

## Data to Extract

### For Portfolio (assets)
- Securities: symbol (from ISIN mapping or name), quantity, value_eur, price_eur
- Crypto: symbol (BTC etc), quantity, value_eur, price_eur
- Cash: balance as EUR cash position

### For Transactions/Expenses
- All rows from bank statement
- Categories to auto-detect:
  - `trade` — "Operar" (Buy/Sell)
  - `transfer_in` — "Transferencia" + "Ingreso"/"Incoming"
  - `transfer_out` — "Transferencia" + "Outgoing"
  - `interest` — "Interés"
  - `dividend` — "Rentabilidad"/"Dividend"
  - `card_payment` — "Transacción con tarjeta"
  - `other` — everything else

## EUR values
All Trade Republic values are in EUR. The app stores USD internally.
Convert EUR→USD using the existing currency API rate (inverse of USD→EUR rate).

## Sample PDFs
Located in `docs/samples/` (3 files from Isma's actual account — gitignored)
