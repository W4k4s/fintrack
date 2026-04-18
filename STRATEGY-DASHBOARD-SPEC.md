# Strategy Dashboard — Feature Spec

## Overview

New `/strategy` page in FinTrack that serves as the central investment execution dashboard. Goes beyond DCA plans to show the complete investment strategy with clear visual guidance on what to do and when.

## Tech Stack (existing)
- Next.js 14 App Router
- TypeScript
- Tailwind CSS (dark theme, zinc/emerald palette)
- SQLite via Drizzle ORM
- Lucide icons
- No additional UI libraries (use raw Tailwind like existing pages)

## Database Changes

### New table: `strategy_profiles`
```sql
CREATE TABLE strategy_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, -- "Mi Estrategia 2026"
  risk_profile TEXT NOT NULL DEFAULT 'balanced', -- conservative, balanced, growth, aggressive
  -- Target allocation percentages (must sum to 100)
  target_cash REAL NOT NULL DEFAULT 15,
  target_etfs REAL NOT NULL DEFAULT 30,
  target_crypto REAL NOT NULL DEFAULT 25,
  target_gold REAL NOT NULL DEFAULT 10,
  target_bonds REAL NOT NULL DEFAULT 10,
  target_stocks REAL NOT NULL DEFAULT 10,
  -- Monthly budget
  monthly_invest REAL NOT NULL DEFAULT 903,
  -- Emergency fund target (months of expenses)
  emergency_months INTEGER NOT NULL DEFAULT 3,
  active INTEGER NOT NULL DEFAULT 1, -- boolean, only one active at a time
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### New table: `strategy_goals`
```sql
CREATE TABLE strategy_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES strategy_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- "Fondo de emergencia", "BTC 0.1", "Net worth €50k"
  type TEXT NOT NULL, -- 'net_worth', 'asset_target', 'savings_rate', 'emergency_fund', 'custom'
  target_value REAL NOT NULL, -- numeric target
  target_asset TEXT, -- for asset_target type: "BTC", "MSCI World", etc.
  target_unit TEXT NOT NULL DEFAULT 'EUR', -- EUR, USD, units, percent
  deadline TEXT, -- optional ISO date
  priority INTEGER NOT NULL DEFAULT 1, -- 1=high, 2=medium, 3=low
  completed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL
);
```

### Modify existing `investment_plans` table
Add optional columns:
```sql
ALTER TABLE investment_plans ADD COLUMN asset_class TEXT; -- crypto, etfs, gold, bonds, stocks, cash
ALTER TABLE investment_plans ADD COLUMN profile_id INTEGER REFERENCES strategy_profiles(id);
ALTER TABLE investment_plans ADD COLUMN rationale TEXT; -- why this DCA amount
```

## API Endpoints

### `/api/strategy` (GET/POST/PUT/DELETE)
- GET: Returns active strategy profile with goals and linked DCA plans
- POST: Create new profile
- PUT: Update profile
- DELETE: Delete profile

### `/api/strategy/goals` (GET/POST/PUT/DELETE)
- CRUD for goals within active strategy

### `/api/strategy/rebalance` (GET)
- Calculates current allocation vs target
- Returns specific buy/sell actions needed with amounts in EUR
- Factors in DCA plans (what will auto-correct over time vs what needs manual action)

### `/api/strategy/health` (GET)
- Overall strategy health score (0-100)
- Checks: allocation drift, emergency fund status, goal progress, DCA adherence
- Returns array of warnings and recommendations

## Page: `/strategy`

### Layout (top to bottom)

#### 1. Strategy Header
- Profile name + risk profile badge (colored: conservative=blue, balanced=green, growth=orange, aggressive=red)
- Edit button → opens modal to change targets
- Strategy health score (circular progress, color-coded)
- Monthly investment budget: €903/month

#### 2. Allocation Overview (most important section)
- **Side by side horizontal bars** for each asset class:
  - Left: class name + emoji (💶 Cash, 📈 ETFs, ₿ Crypto, 🥇 Gold, 🏦 Bonds, 📊 Stocks)
  - Center: bar showing current % (filled) vs target % (outline/marker)
  - Right: current € value | target € value | drift indicator (🔴/🟡/🟢)
- Below bars: pie chart or donut showing current allocation
- Color code: green if within 5% of target, yellow if 5-15% drift, red if >15%

#### 3. Action Items Panel
- Auto-generated list of what to do NOW, sorted by priority:
  - "🔴 Deploy €2,718 from cash reserves" 
  - "🔵 Buy €800 MSCI World (first purchase)"
  - "🟢 DCA running: €903/month across 7 assets"
  - etc.
- Each action has: icon, description, amount, and a "Mark done" button
- Completed actions move to bottom with strikethrough

#### 4. DCA Plans Summary
- Compact table of all active DCA plans
- Columns: Asset | Monthly € | Asset Class | % of Budget | Status
- Visual: small progress bar showing how much of monthly budget each plan uses
- Link to full /plans page

#### 5. Financial Goals
- Card grid (like the existing DCA cards style)
- Each goal card:
  - Name + priority badge
  - Progress bar (current vs target)
  - Current value / Target value
  - Estimated completion date (based on current savings rate + DCA)
  - Deadline if set
- Add goal button → form modal

#### 6. Market Context (compact)
- Fear & Greed gauge (small, inline)
- DCA multiplier suggestion (1x, 1.5x, 2x based on sentiment)
- Key portfolio metrics: total invested, unrealized P/L, savings rate

### Mobile Responsive
- Stack everything vertically on mobile
- Allocation bars become full-width
- Goal cards become single column
- Collapsible sections with chevrons

## Style Guide (match existing app)
- Background: zinc-900/950
- Cards: bg-zinc-900 border border-zinc-800 rounded-xl
- Accent: emerald-500/600 (positive), red-500 (negative), amber-500 (warning)
- Text: white for values, zinc-400 for labels
- Buttons: bg-emerald-600 hover:bg-emerald-700 rounded-lg
- Consistent with /plans, /assets, /expenses pages

## Seed Data

Create an initial strategy profile on first load (or via migration):
```json
{
  "name": "Estrategia 2026",
  "risk_profile": "balanced",
  "target_cash": 15,
  "target_etfs": 30,
  "target_crypto": 25,
  "target_gold": 10,
  "target_bonds": 10,
  "target_stocks": 10,
  "monthly_invest": 903,
  "emergency_months": 3,
  "active": true,
  "notes": "Portfolio rebalancing post-ING/TR sync. Extreme Fear market = opportunity."
}
```

Goals to seed:
1. Emergency Fund: €6,643 target (3 months expenses)
2. BTC 0.05: accumulate to 0.05 BTC
3. Net Worth €25k: milestone goal
4. MSCI World €5k: build core ETF position

## Important Notes
- All amounts display in EUR (use EUR/USD rate from /api/currency for conversion)
- The app already has a `useCurrency` hook in CurrencyProvider — use it
- Drizzle migration: create a new migration file in `src/lib/db/migrations/`
- Check if the app uses `drizzle-kit` for migrations: look at `drizzle.config.ts`
- The existing pages are good references for component style
- No external charting library — use CSS/SVG for progress bars and allocation viz
- Keep it simple and clean — this is a personal finance app, not Bloomberg Terminal
