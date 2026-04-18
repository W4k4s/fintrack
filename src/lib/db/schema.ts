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
