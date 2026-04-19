import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const exchanges = sqliteTable("exchanges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  type: text("type", { enum: ["auto", "manual"] }).notNull().default("auto"),
  apiKey: text("api_key"), // encrypted
  apiSecret: text("api_secret"), // encrypted
  passphrase: text("passphrase"), // encrypted
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastSync: text("last_sync"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  exchangeId: integer("exchange_id").notNull().references(() => exchanges.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type", { enum: ["spot", "savings", "staking", "futures", "manual"] }).notNull().default("spot"),
  currency: text("currency").notNull().default("USD"),
});

export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  amount: real("amount").notNull().default(0),
  avgBuyPrice: real("avg_buy_price"),
  currentPrice: real("current_price"),
  lastUpdated: text("last_updated"),
});

export const portfolioSnapshots = sqliteTable("portfolio_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  totalValue: real("total_value").notNull(),
  date: text("date").notNull(),
});

export const investmentPlans = sqliteTable("investment_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  asset: text("asset").notNull(),
  amount: real("amount").notNull(),
  frequency: text("frequency", { enum: ["daily", "weekly", "biweekly", "monthly"] }).notNull(),
  nextExecution: text("next_execution"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  assetClass: text("asset_class"), // crypto, etfs, gold, bonds, stocks
  profileId: integer("profile_id").references(() => strategyProfiles.id),
  rationale: text("rationale"),
  // Broker-side auto execution (Trade Republic Sparplan, Binance plan, etc.)
  autoExecute: integer("auto_execute", { mode: "boolean" }).notNull().default(false),
  autoDayOfWeek: integer("auto_day_of_week"), // 1=Mon ... 7=Sun
  autoStartDate: text("auto_start_date"), // ISO date "YYYY-MM-DD" — plan no empieza antes de esta fecha
  broker: text("broker"), // "Trade Republic", "Binance", etc.
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Strategy profiles — target allocation and investment config
export const strategyProfiles = sqliteTable("strategy_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  riskProfile: text("risk_profile", { enum: ["conservative", "balanced", "growth", "aggressive"] }).notNull().default("balanced"),
  targetCash: real("target_cash").notNull().default(15),
  targetEtfs: real("target_etfs").notNull().default(30),
  targetCrypto: real("target_crypto").notNull().default(25),
  targetGold: real("target_gold").notNull().default(10),
  targetBonds: real("target_bonds").notNull().default(10),
  targetStocks: real("target_stocks").notNull().default(10),
  monthlyInvest: real("monthly_invest").notNull().default(903),
  emergencyMonths: integer("emergency_months").notNull().default(3),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  notes: text("notes"),
  // Manual override del realized YTD bucket "traditional" (ETFs/acciones/oro/bonos).
  // Cubre ventas TR vía bank_transactions que no entran en `estimateRealizedYtdEur`.
  realizedYtdTraditionalOverrideEur: real("realized_ytd_traditional_override_eur"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Strategy goals — financial targets to track
export const strategyGoals = sqliteTable("strategy_goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: integer("profile_id").notNull().references(() => strategyProfiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type", { enum: ["net_worth", "asset_target", "savings_rate", "emergency_fund", "custom"] }).notNull(),
  targetValue: real("target_value").notNull(),
  targetAsset: text("target_asset"), // for asset_target: "BTC", "MSCI World"
  targetUnit: text("target_unit").notNull().default("EUR"),
  deadline: text("deadline"),
  priority: integer("priority").notNull().default(1), // 1=high 2=med 3=low
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// DCA execution log — track every buy
export const dcaExecutions = sqliteTable("dca_executions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  planId: integer("plan_id").notNull().references(() => investmentPlans.id, { onDelete: "cascade" }),
  amount: real("amount").notNull(), // EUR spent
  price: real("price"), // price at execution
  units: real("units"), // units bought
  date: text("date").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").references(() => accounts.id, { onDelete: "set null" }),
  type: text("type", { enum: ["buy", "sell", "transfer", "deposit", "withdrawal"] }).notNull(),
  symbol: text("symbol").notNull(),
  amount: real("amount").notNull(),
  price: real("price"),
  total: real("total"),
  quoteCurrency: text("quote_currency").notNull().default("USD"),
  date: text("date").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Types
export type Exchange = typeof exchanges.$inferSelect;
export type NewExchange = typeof exchanges.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type InvestmentPlan = typeof investmentPlans.$inferSelect;
export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;
export type StrategyProfile = typeof strategyProfiles.$inferSelect;
export type StrategyGoal = typeof strategyGoals.$inferSelect;
export type DcaExecution = typeof dcaExecutions.$inferSelect;

export const bankTransactions = sqliteTable("bank_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(), // "trade-republic", "manual"
  date: text("date").notNull(),
  type: text("type").notNull(), // trade, transfer_in, transfer_out, interest, dividend, card_payment, gift, other
  description: text("description").notNull(),
  credit: real("credit"),
  debit: real("debit"),
  balance: real("balance"),
  currency: text("currency").notNull().default("EUR"),
  category: text("category"),
  // 'pending' = optimistic entry from /strategy execute, awaiting real import reconciliation.
  // 'confirmed' = authoritative data from an import.
  status: text("status", { enum: ["confirmed", "pending"] }).notNull().default("confirmed"),
  planId: integer("plan_id").references(() => investmentPlans.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type BankTransaction = typeof bankTransactions.$inferSelect;

export const bankAccounts = sqliteTable("bank_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  exchangeId: integer("exchange_id").notNull().references(() => exchanges.id, { onDelete: "cascade" }),
  source: text("source").notNull().unique(), // "ing-2439"
  accountNumber: text("account_number"), // "1465 0100 9117 28712439"
  name: text("name").notNull(), // "Cuenta Nómina"
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type BankAccount = typeof bankAccounts.$inferSelect;

// ---------------------------------------------------------------------------
// Intel subsystem — signals, notifications, runs, news items
// ---------------------------------------------------------------------------

export const intelSignals = sqliteTable("intel_signals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // sha1(scope:asset:windowKey) — evita duplicados en ventanas temporales
  dedupKey: text("dedup_key").notNull().unique(),
  scope: text("scope", {
    enum: [
      "price_dip", "price_surge", "fg_regime", "funding_anomaly",
      "news", "macro_event", "drift", "tax_harvest", "rebalance",
      "dca_pending", "profile_review", "concentration_risk", "custom",
    ],
  }).notNull(),
  asset: text("asset"), // BTC, ETH, "MSCI World"... null si macro
  assetClass: text("asset_class"), // crypto | etfs | gold | bonds | stocks | macro
  severity: text("severity", { enum: ["low", "med", "high", "critical"] }).notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  payload: text("payload").notNull(), // JSON con métricas crudas
  suggestedAction: text("suggested_action"), // buy_accelerate | hold | pause_dca | rebalance | sell_partial | review | ignore
  actionAmountEur: real("action_amount_eur"),
  analysisStatus: text("analysis_status", {
    enum: ["pending", "claude_requested", "claude_done", "claude_failed", "pending_manual"],
  }).notNull().default("pending"),
  analysisText: text("analysis_text"),
  userStatus: text("user_status", {
    enum: ["unread", "read", "acted", "dismissed", "snoozed"],
  }).notNull().default("unread"),
  snoozeUntil: text("snooze_until"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  resolvedAt: text("resolved_at"),
});

export const intelNotifications = sqliteTable("intel_notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  signalId: integer("signal_id").references(() => intelSignals.id, { onDelete: "cascade" }),
  channel: text("channel", { enum: ["telegram", "panel", "both"] }).notNull().default("both"),
  status: text("status", { enum: ["queued", "sent", "failed", "suppressed"] }).notNull().default("queued"),
  suppressionReason: text("suppression_reason"), // quiet_hours | digest | dedup | rate_limit | bot_down
  telegramMessageId: text("telegram_message_id"),
  payload: text("payload").notNull(), // texto final enviado
  sentAt: text("sent_at"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const intelRuns = sqliteTable("intel_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scope: text("scope").notNull(),
  startedAt: text("started_at").notNull().$defaultFn(() => new Date().toISOString()),
  finishedAt: text("finished_at"),
  signalsCreated: integer("signals_created").notNull().default(0),
  spawnsLaunched: integer("spawns_launched").notNull().default(0),
  errors: text("errors"),
});

export const intelNewsItems = sqliteTable("intel_news_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(), // "coindesk" | "the-block" | "reuters" | "ecb" | "fed" | "cryptopanic"
  externalId: text("external_id").notNull().unique(), // hash(url)
  url: text("url").notNull(),
  title: text("title").notNull(),
  publishedAt: text("published_at").notNull(),
  body: text("body"),
  assetsMentioned: text("assets_mentioned"), // JSON array ["BTC","ETH"]
  rawScore: real("raw_score"),
  signalId: integer("signal_id").references(() => intelSignals.id),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Per-scope notification cooldown. Auto-populated by the feedback evaluator
// when dismissed_rate for a scope exceeds the threshold. While cooldown_until
// > now, Telegram sends for that scope are suppressed (signals still land on
// /intel). critical severity bypasses cooldown.
export const intelScopeCooldowns = sqliteTable("intel_scope_cooldowns", {
  scope: text("scope").primaryKey(),
  cooldownUntil: text("cooldown_until").notNull(),
  reason: text("reason").notNull(), // "high_dismiss_rate"
  dismissedRate: real("dismissed_rate"),
  sampleSize: integer("sample_size"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Intel allocation snapshots — 1 row/día con el snapshot completo de la
// allocation (por clase) y drift vs targets del perfil activo. Permite
// detectores longitudinales (profile-review) sin parsear signals históricas.
export const intelAllocationSnapshots = sqliteTable("intel_allocation_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(), // YYYY-MM-DD
  profileId: integer("profile_id").notNull().references(() => strategyProfiles.id, { onDelete: "cascade" }),
  netWorthEur: real("net_worth_eur").notNull(),
  allocation: text("allocation").notNull(), // JSON { cash: {actualPct, targetPct, driftPp}, ... }
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Fase 8 — órdenes concretas derivadas del rebalance plan. Una row por cada
// sell/buy del payload.plan. Permite checklist en UI y auto-match contra
// transactions ejecutadas. Status `superseded` cuando un plan nuevo reemplaza
// al anterior sin haber sido ejecutado completo.
export const intelRebalanceOrders = sqliteTable("intel_rebalance_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  signalId: integer("signal_id").notNull().references(() => intelSignals.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["sell", "buy"] }).notNull(),
  assetSymbol: text("asset_symbol"), // nullable: needs_pick
  assetClass: text("asset_class").notNull(), // cash|crypto|etfs|gold|bonds|stocks
  venue: text("venue").notNull(), // exchange slug
  amountEur: real("amount_eur").notNull(),
  status: text("status", {
    enum: ["pending", "executed", "partial", "dismissed", "stale", "superseded", "needs_pick"],
  }).notNull().default("pending"),
  executedAt: text("executed_at"),
  actualAmountEur: real("actual_amount_eur"),
  actualUnits: real("actual_units"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type IntelSignal = typeof intelSignals.$inferSelect;
export type NewIntelSignal = typeof intelSignals.$inferInsert;
export type IntelNotification = typeof intelNotifications.$inferSelect;
export type IntelRun = typeof intelRuns.$inferSelect;
export type IntelNewsItem = typeof intelNewsItems.$inferSelect;
export type IntelScopeCooldown = typeof intelScopeCooldowns.$inferSelect;
export type IntelAllocationSnapshot = typeof intelAllocationSnapshots.$inferSelect;
export type IntelRebalanceOrder = typeof intelRebalanceOrders.$inferSelect;
export type NewIntelRebalanceOrder = typeof intelRebalanceOrders.$inferInsert;
