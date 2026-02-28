export interface ExchangeInfo {
  id: string;
  name: string;
  logo: string;
  type: "auto" | "manual";
  requiresPassphrase: boolean;
  website: string;
  tags: string[];
}

export const exchangeRegistry: ExchangeInfo[] = [
  // Major CEX — logos from CCXT
  { id: "binance", name: "Binance", logo: "https://github.com/user-attachments/assets/e9419b93-ccb0-46aa-9bff-c883f096274b", type: "auto", requiresPassphrase: false, website: "https://binance.com", tags: ["cex", "major"] },
  { id: "kucoin", name: "KuCoin", logo: "https://user-images.githubusercontent.com/51840849/87295558-132aaf80-c50e-11ea-9801-a2fb0c57c799.jpg", type: "auto", requiresPassphrase: true, website: "https://kucoin.com", tags: ["cex", "major"] },
  { id: "mexc", name: "MEXC", logo: "https://user-images.githubusercontent.com/1294454/137283979-8b2a818d-8633-461b-bfca-de89e8c446b2.jpg", type: "auto", requiresPassphrase: false, website: "https://mexc.com", tags: ["cex", "major"] },
  { id: "coinbase", name: "Coinbase", logo: "https://user-images.githubusercontent.com/1294454/40811661-b6eceae2-653a-11e8-829e-10bfadb078cf.jpg", type: "auto", requiresPassphrase: false, website: "https://coinbase.com", tags: ["cex", "major"] },
  { id: "kraken", name: "Kraken", logo: "https://user-images.githubusercontent.com/51840849/76173629-fc67fb00-61b1-11ea-84fe-f2de582f58a3.jpg", type: "auto", requiresPassphrase: false, website: "https://kraken.com", tags: ["cex", "major"] },
  { id: "bybit", name: "Bybit", logo: "https://github.com/user-attachments/assets/97a5d0b3-de10-423d-90e1-6620960025ed", type: "auto", requiresPassphrase: false, website: "https://bybit.com", tags: ["cex", "major"] },
  { id: "okx", name: "OKX", logo: "https://user-images.githubusercontent.com/1294454/152485636-38b19e4a-bece-4dec-979a-5982859ffc04.jpg", type: "auto", requiresPassphrase: true, website: "https://okx.com", tags: ["cex", "major"] },
  { id: "gateio", name: "Gate.io", logo: "https://github.com/user-attachments/assets/64f988c5-07b6-4652-b5c1-679a6bf67c85", type: "auto", requiresPassphrase: false, website: "https://gate.io", tags: ["cex", "major"] },
  { id: "bitget", name: "Bitget", logo: "https://github.com/user-attachments/assets/fbaa10cc-a277-441d-a5b7-997dd9a87658", type: "auto", requiresPassphrase: true, website: "https://bitget.com", tags: ["cex", "major"] },
  { id: "cryptocom", name: "Crypto.com", logo: "https://user-images.githubusercontent.com/1294454/147792121-38ed5e36-c229-48d6-b49a-48d05fc19ed4.jpeg", type: "auto", requiresPassphrase: false, website: "https://crypto.com", tags: ["cex", "major"] },
  { id: "htx", name: "HTX (Huobi)", logo: "https://user-images.githubusercontent.com/1294454/76137448-22748a80-604e-11ea-8069-6e389271911d.jpg", type: "auto", requiresPassphrase: false, website: "https://htx.com", tags: ["cex", "major"] },
  { id: "bitfinex", name: "Bitfinex", logo: "https://github.com/user-attachments/assets/4a8e947f-ab46-481a-a8ae-8b20e9b03178", type: "auto", requiresPassphrase: false, website: "https://bitfinex.com", tags: ["cex"] },
  { id: "gemini", name: "Gemini", logo: "https://user-images.githubusercontent.com/1294454/27816857-ce7be644-6096-11e7-82d6-3c257263229c.jpg", type: "auto", requiresPassphrase: false, website: "https://gemini.com", tags: ["cex"] },
  { id: "bitstamp", name: "Bitstamp", logo: "https://github.com/user-attachments/assets/d5480572-1fee-43cb-b900-d38c522d0024", type: "auto", requiresPassphrase: false, website: "https://bitstamp.net", tags: ["cex"] },
  { id: "poloniex", name: "Poloniex", logo: "https://user-images.githubusercontent.com/1294454/27766817-e9456312-5ee6-11e7-9b3c-b628ca5626a5.jpg", type: "auto", requiresPassphrase: false, website: "https://poloniex.com", tags: ["cex"] },
  { id: "bitmart", name: "BitMart", logo: "https://github.com/user-attachments/assets/0623e9c4-f50e-48c9-82bd-65c3908c3a14", type: "auto", requiresPassphrase: false, website: "https://bitmart.com", tags: ["cex"] },
  { id: "phemex", name: "Phemex", logo: "https://user-images.githubusercontent.com/1294454/85225056-221eb600-b3d7-11ea-930d-564d2690e3f6.jpg", type: "auto", requiresPassphrase: false, website: "https://phemex.com", tags: ["cex"] },
  { id: "bingx", name: "BingX", logo: "https://github-production-user-asset-6210df.s3.amazonaws.com/1294454/253675376-6983b72e-4999-4549-b177-33b374c195e3.jpg", type: "auto", requiresPassphrase: false, website: "https://bingx.com", tags: ["cex"] },
  { id: "lbank", name: "LBank", logo: "https://user-images.githubusercontent.com/1294454/38063602-9605e28a-3302-11e8-81be-64b1e53c4cfb.jpg", type: "auto", requiresPassphrase: false, website: "https://lbank.com", tags: ["cex"] },
  { id: "whitebit", name: "WhiteBIT", logo: "https://user-images.githubusercontent.com/1294454/66732963-8eb7dd00-ee66-11e9-849b-10d9282bb9e0.jpg", type: "auto", requiresPassphrase: false, website: "https://whitebit.com", tags: ["cex"] },
  // DEX
  { id: "uniswap", name: "Uniswap", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Uniswap_Logo.svg/120px-Uniswap_Logo.svg.png", type: "manual", requiresPassphrase: false, website: "https://uniswap.org", tags: ["dex"] },
  // Hardware / Wallets
  { id: "ledger", name: "Ledger", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Ledger_logo.svg/120px-Ledger_logo.svg.png", type: "manual", requiresPassphrase: false, website: "https://ledger.com", tags: ["hardware", "wallet"] },
  { id: "trezor", name: "Trezor", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Trezor_logo.svg/120px-Trezor_logo.svg.png", type: "manual", requiresPassphrase: false, website: "https://trezor.io", tags: ["hardware", "wallet"] },
  { id: "metamask", name: "MetaMask", logo: "https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg", type: "manual", requiresPassphrase: false, website: "https://metamask.io", tags: ["wallet"] },
  // Brokers
  { id: "trade-republic", name: "Trade Republic", logo: "https://asset.brandfetch.io/idmS_e-4bq/idZaVBXBKE.png", type: "manual", requiresPassphrase: false, website: "https://traderepublic.com", tags: ["broker", "stocks", "etf"] },
  { id: "degiro", name: "DEGIRO", logo: "https://asset.brandfetch.io/idZCa4gfEV/id40gDfMVG.svg", type: "manual", requiresPassphrase: false, website: "https://degiro.com", tags: ["broker", "stocks", "etf"] },
  { id: "interactive-brokers", name: "Interactive Brokers", logo: "https://asset.brandfetch.io/id_bFI5zfq/idFpDMJwvr.png", type: "manual", requiresPassphrase: false, website: "https://interactivebrokers.com", tags: ["broker", "stocks", "etf"] },
  // Banks
  { id: "revolut", name: "Revolut", logo: "https://asset.brandfetch.io/idw382nG0y/idFpIO2ahF.png", type: "manual", requiresPassphrase: false, website: "https://revolut.com", tags: ["bank", "crypto", "stocks"] },
  { id: "n26", name: "N26", logo: "https://asset.brandfetch.io/idygArMI_6/idmTAcjxHI.svg", type: "manual", requiresPassphrase: false, website: "https://n26.com", tags: ["bank"] },
  { id: "wise", name: "Wise", logo: "https://asset.brandfetch.io/id0IQKM9tD/idmdLBq4Av.svg", type: "manual", requiresPassphrase: false, website: "https://wise.com", tags: ["bank"] },
  { id: "bank-manual", name: "Bank Account (Manual)", logo: "", type: "manual", requiresPassphrase: false, website: "", tags: ["bank", "manual"] },
  { id: "other-manual", name: "Other (Manual)", logo: "", type: "manual", requiresPassphrase: false, website: "", tags: ["manual"] },
];

export function getExchangeInfo(id: string): ExchangeInfo | undefined {
  return exchangeRegistry.find(e => e.id === id);
}

export function getExchangesByTag(tag: string): ExchangeInfo[] {
  return exchangeRegistry.filter(e => e.tags.includes(tag));
}
