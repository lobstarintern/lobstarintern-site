"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────

interface WalletInfo {
  label: string;
  address: string;
  sol: number;
  solUsd: number;
  lobstar: number;
  lobstarUsd: number;
  tokenAccounts: number;
  nfts: number;
}

interface MarketData {
  price: number;
  priceChange: { m5: number; h1: number; h6: number; h24: number };
  volume: { h1: number; h6: number; h24: number };
  marketCap: number;
  liquidity: number;
}

interface WalletData {
  timestamp: string;
  solPrice: number;
  market: MarketData;
  intern: WalletInfo;
  wilde: WalletInfo;
  error?: string;
}

interface TokenChange {
  mint: string;
  amount: number;
  decimals: number;
}

interface NativeTransfer {
  from: string;
  to: string;
  amount: number;
}

interface TokenTransfer {
  from: string;
  to: string;
  amount: number;
  mint: string;
}

interface Transaction {
  signature: string;
  timestamp: number;
  type: string;
  source: string;
  description: string;
  fee: number;
  feePayer: string;
  solChange: number;
  tokenChanges: TokenChange[];
  nativeTransfers: NativeTransfer[];
  tokenTransfers: TokenTransfer[];
  isLobstarBuy: boolean;
  isLobstarSell: boolean;
  lobstarAmount: number;
  solAmount: number;
}

interface TransactionData {
  wallet: string;
  address: string;
  transactions: Transaction[];
  timestamp: string;
  error?: string;
}

interface PortfolioHolding {
  mint: string;
  balance: number;
  decimals: number;
  name: string;
  symbol: string;
  pricePerToken: number;
  valueUsd: number;
}

interface PortfolioData {
  address: string;
  totalTokens: number;
  totalValueUsd: number;
  holdings: PortfolioHolding[];
  timestamp: string;
  error?: string;
}

// ── Helpers ────────────────────────────────────────────────────────

const LOBSTAR_MINT = "AVF9F4C4j8b1Kh4BmNHqybDaHgnZpJ7W7yLvL7hUpump";
const WILDE_ADDRESS = "83XBMJZEgQ13ZPFTaLr1ktNkUDHVmWpZRMN7AL7BXxnS";

const KNOWN_MINTS: Record<string, string> = {
  So11111111111111111111111111111111111111112: "SOL",
  [LOBSTAR_MINT]: "LOBSTAR",
};

function timeAgo(ts: number): string {
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function truncAddr(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function mintLabel(mint: string): string {
  return KNOWN_MINTS[mint] || truncAddr(mint);
}

function fmt(n: number, d: number = 2): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function fmtUsd(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.0001 && n > 0) return "<$0.0001";
  if (n < 1) {
    const decimals = Math.max(2, -Math.floor(Math.log10(Math.abs(n))) + 3);
    return "$" + n.toFixed(Math.min(decimals, 8));
  }
  return (
    "$" +
    n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return fmtUsd(n);
}

function fmtToken(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (Math.abs(n) < 0.001 && n !== 0) return n.toExponential(2);
  return fmt(n, Math.abs(n) < 1 ? 6 : 2);
}

// ── Tab types ──────────────────────────────────────────────────────

type Tab = "transactions" | "transfers" | "activities" | "portfolio";

// ── Components ─────────────────────────────────────────────────────

function PctBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-zinc-600">0%</span>;
  const color = value > 0 ? "text-emerald-400" : "text-red-400";
  return (
    <span className={color}>
      {value > 0 ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

function TypeBadge({ type, isLobstarBuy, isLobstarSell }: { type: string; isLobstarBuy?: boolean; isLobstarSell?: boolean }) {
  if (isLobstarBuy) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
        LOBSTAR BUY
      </span>
    );
  }
  if (isLobstarSell) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-red-500/20 text-red-400 border border-red-500/30">
        LOBSTAR SELL
      </span>
    );
  }

  const label = type.replace(/_/g, " ");
  let cls = "bg-zinc-800/80 text-zinc-400 border-zinc-700/50";
  if (type === "SWAP") cls = "bg-blue-500/15 text-blue-400 border-blue-500/30";
  if (type === "TRANSFER") cls = "bg-amber-500/15 text-amber-400 border-amber-500/30";
  if (type === "COMPRESSED_NFT_MINT" || type === "NFT_MINT") cls = "bg-purple-500/15 text-purple-400 border-purple-500/30";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${cls}`}>
      {label}
    </span>
  );
}

function StatusDot({ loading, error }: { loading: boolean; error: string | null }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          error ? "bg-red-500" : loading ? "bg-zinc-500 animate-pulse" : "bg-emerald-500"
        }`}
      />
      <span className={`text-[10px] uppercase tracking-widest ${error ? "text-red-400" : "text-zinc-600"}`}>
        {loading ? "Updating" : error ? "Error" : "Live"}
      </span>
    </div>
  );
}

// ── Tab Content Components ─────────────────────────────────────────

function TransactionsTab({ transactions }: { transactions: Transaction[] }) {
  return (
    <div className="divide-y divide-zinc-900/60">
      {transactions.slice(0, 30).map((tx) => (
        <a
          key={tx.signature}
          href={`https://solscan.io/tx/${tx.signature}`}
          className="block px-4 py-3 hover:bg-zinc-900/40 transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <TypeBadge type={tx.type} isLobstarBuy={tx.isLobstarBuy} isLobstarSell={tx.isLobstarSell} />
              {tx.source && (
                <span className="text-zinc-700 text-[10px] truncate">{tx.source.replace(/_/g, " ")}</span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-zinc-600 text-[11px]">{tx.timestamp ? timeAgo(tx.timestamp) : "--"}</span>
              <span className="text-zinc-700 text-[11px] font-mono">{truncAddr(tx.signature)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
            {tx.solChange !== 0 && (
              <span className={tx.solChange > 0 ? "text-emerald-500" : "text-red-500/80"}>
                {tx.solChange > 0 ? "+" : ""}{fmt(tx.solChange, 4)} SOL
              </span>
            )}
            {tx.tokenChanges?.map((tc, i) => (
              <span key={i} className={tc.amount > 0 ? "text-emerald-500" : "text-red-500/80"}>
                {tc.amount > 0 ? "+" : ""}{fmtToken(tc.amount)} {mintLabel(tc.mint)}
              </span>
            ))}
            {tx.fee > 0 && <span className="text-zinc-800">fee {tx.fee.toFixed(6)}</span>}
          </div>
        </a>
      ))}
    </div>
  );
}

function TransfersTab({ transactions }: { transactions: Transaction[] }) {
  // Filter to transactions that have native or token transfers
  const transfers = transactions.filter(
    (tx) =>
      (tx.nativeTransfers && tx.nativeTransfers.length > 0) ||
      (tx.tokenTransfers && tx.tokenTransfers.length > 0),
  );

  if (transfers.length === 0) {
    return <p className="text-zinc-700 text-sm px-4 py-6">No transfers found.</p>;
  }

  return (
    <div className="divide-y divide-zinc-900/60">
      {transfers.slice(0, 30).map((tx) => (
        <a
          key={tx.signature}
          href={`https://solscan.io/tx/${tx.signature}`}
          className={`block px-4 py-3 hover:bg-zinc-900/40 transition-colors ${
            tx.isLobstarBuy ? "bg-emerald-500/5 border-l-2 border-l-emerald-500/40" : ""
          }`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <TypeBadge type={tx.type} isLobstarBuy={tx.isLobstarBuy} isLobstarSell={tx.isLobstarSell} />
            <span className="text-zinc-600 text-[11px]">{tx.timestamp ? timeAgo(tx.timestamp) : "--"}</span>
          </div>

          {/* Native transfers */}
          {tx.nativeTransfers?.map((nt, i) => (
            <div key={`n-${i}`} className="flex items-center gap-2 text-xs mb-1">
              <span className="text-zinc-600 font-mono">{truncAddr(nt.from)}</span>
              <span className="text-zinc-700">&rarr;</span>
              <span className="text-zinc-600 font-mono">{truncAddr(nt.to)}</span>
              <span className={nt.from === WILDE_ADDRESS ? "text-red-500/80" : "text-emerald-500"}>
                {fmt(nt.amount, 4)} SOL
              </span>
            </div>
          ))}

          {/* Token transfers */}
          {tx.tokenTransfers?.map((tt, i) => (
            <div key={`t-${i}`} className="flex items-center gap-2 text-xs mb-1">
              <span className="text-zinc-600 font-mono">{truncAddr(tt.from)}</span>
              <span className="text-zinc-700">&rarr;</span>
              <span className="text-zinc-600 font-mono">{truncAddr(tt.to)}</span>
              <span className={tt.to === WILDE_ADDRESS ? "text-emerald-500" : "text-red-500/80"}>
                {fmtToken(tt.amount)} {mintLabel(tt.mint)}
              </span>
            </div>
          ))}
        </a>
      ))}
    </div>
  );
}

function ActivitiesTab({ transactions }: { transactions: Transaction[] }) {
  // Filter to DeFi activities: swaps, LP interactions
  const activities = transactions.filter(
    (tx) =>
      tx.type === "SWAP" ||
      tx.type === "ADD_LIQUIDITY" ||
      tx.type === "REMOVE_LIQUIDITY" ||
      tx.isLobstarBuy ||
      tx.isLobstarSell,
  );

  if (activities.length === 0) {
    return <p className="text-zinc-700 text-sm px-4 py-6">No DeFi activities found.</p>;
  }

  return (
    <div className="divide-y divide-zinc-900/60">
      {activities.slice(0, 30).map((tx) => {
        // Build swap description from token changes
        const outTokens = tx.tokenChanges?.filter((tc) => tc.amount < 0) ?? [];
        const inTokens = tx.tokenChanges?.filter((tc) => tc.amount > 0) ?? [];
        const solOut = tx.solChange < -0.001;
        const solIn = tx.solChange > 0.001;

        return (
          <a
            key={tx.signature}
            href={`https://solscan.io/tx/${tx.signature}`}
            className={`block px-4 py-4 transition-colors ${
              tx.isLobstarBuy
                ? "bg-emerald-500/[0.07] hover:bg-emerald-500/[0.12] border-l-2 border-l-emerald-500/50"
                : tx.isLobstarSell
                ? "bg-red-500/[0.05] hover:bg-red-500/[0.10] border-l-2 border-l-red-500/40"
                : "hover:bg-zinc-900/40"
            }`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <TypeBadge type={tx.type} isLobstarBuy={tx.isLobstarBuy} isLobstarSell={tx.isLobstarSell} />
                {tx.source && (
                  <span className="text-zinc-600 text-[10px] uppercase tracking-wider">
                    {tx.source.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              <span className="text-zinc-600 text-[11px]">{tx.timestamp ? timeAgo(tx.timestamp) : "--"}</span>
            </div>

            {/* Swap summary */}
            <div className="flex items-center gap-2 text-sm flex-wrap">
              {/* What went out */}
              {solOut && (
                <span className="text-red-400">{fmt(Math.abs(tx.solChange), 4)} SOL</span>
              )}
              {outTokens.map((tc, i) => (
                <span key={i} className="text-red-400">
                  {fmtToken(Math.abs(tc.amount))} {mintLabel(tc.mint)}
                </span>
              ))}

              {(solOut || outTokens.length > 0) && (solIn || inTokens.length > 0) && (
                <span className={`text-lg ${tx.isLobstarBuy ? "text-emerald-500" : "text-zinc-600"}`}>
                  &rarr;
                </span>
              )}

              {/* What came in */}
              {solIn && (
                <span className="text-emerald-400 font-bold">{fmt(tx.solChange, 4)} SOL</span>
              )}
              {inTokens.map((tc, i) => (
                <span
                  key={i}
                  className={`font-bold ${tc.mint === LOBSTAR_MINT ? "text-emerald-400" : "text-emerald-400"}`}
                >
                  {fmtToken(tc.amount)} {mintLabel(tc.mint)}
                </span>
              ))}
            </div>

            {/* Lobstar buy highlight text */}
            {tx.isLobstarBuy && (
              <div className="mt-1.5 text-[11px] text-emerald-500/80">
                Swapped {fmt(Math.abs(tx.solChange), 2)} SOL for {fmtToken(tx.lobstarAmount)} LOBSTAR
              </div>
            )}
          </a>
        );
      })}
    </div>
  );
}

function PortfolioTab({ portfolio, loading }: { portfolio: PortfolioData | null; loading: boolean }) {
  if (loading && !portfolio) {
    return <div className="text-zinc-700 text-sm px-4 py-6 animate-pulse">Loading portfolio...</div>;
  }

  if (!portfolio || !portfolio.holdings?.length) {
    return <p className="text-zinc-700 text-sm px-4 py-6">No token holdings found.</p>;
  }

  return (
    <div>
      <div className="px-4 py-3 border-b border-zinc-900/60 flex justify-between text-[10px] uppercase tracking-widest text-zinc-600">
        <span>Token</span>
        <div className="flex gap-8">
          <span className="w-28 text-right">Balance</span>
          <span className="w-24 text-right">Value</span>
        </div>
      </div>
      <div className="divide-y divide-zinc-900/40">
        {portfolio.holdings.map((h) => (
          <a
            key={h.mint}
            href={`https://solscan.io/token/${h.mint}`}
            className="flex items-center justify-between px-4 py-2.5 hover:bg-zinc-900/40 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="min-w-0">
              <span className="text-zinc-300 text-sm font-medium">
                {h.symbol || h.name || truncAddr(h.mint)}
              </span>
              {h.symbol && h.name && h.name !== h.symbol && (
                <span className="text-zinc-700 text-xs ml-2">{h.name}</span>
              )}
            </div>
            <div className="flex gap-8 shrink-0">
              <span className="text-zinc-400 text-sm w-28 text-right font-mono">
                {fmtToken(h.balance)}
              </span>
              <span className="text-zinc-500 text-sm w-24 text-right">
                {h.valueUsd > 0 ? fmtUsd(h.valueUsd) : "--"}
              </span>
            </div>
          </a>
        ))}
      </div>
      <div className="px-4 py-3 border-t border-zinc-800 flex justify-between text-sm">
        <span className="text-zinc-500">{portfolio.totalTokens} tokens</span>
        <span className="text-zinc-400 font-medium">
          Total: {portfolio.totalValueUsd > 0 ? fmtUsd(portfolio.totalValueUsd) : "--"}
        </span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export default function Home() {
  const [wallets, setWallets] = useState<WalletData | null>(null);
  const [txData, setTxData] = useState<TransactionData | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [views, setViews] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("activities");
  const [loading, setLoading] = useState(true);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Track page view once
  useEffect(() => {
    fetch("/api/views", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.views) setViews(d.views);
      })
      .catch(() => {});
  }, []);

  // Fetch portfolio when tab is selected
  const fetchPortfolio = useCallback(async () => {
    setPortfolioLoading(true);
    try {
      const res = await fetch("/api/portfolio");
      const data = await res.json();
      if (!data.error) setPortfolio(data);
    } catch {
      // silent
    } finally {
      setPortfolioLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "portfolio" && !portfolio) {
      fetchPortfolio();
    }
  }, [activeTab, portfolio, fetchPortfolio]);

  const fetchData = useCallback(async () => {
    try {
      const [wRes, tRes] = await Promise.all([
        fetch("/api/wallets"),
        fetch("/api/transactions?wallet=wilde"),
      ]);

      const [wData, tData] = await Promise.all([wRes.json(), tRes.json()]);

      if (wData.error) throw new Error(wData.error);
      if (tData.error) throw new Error(tData.error);

      setWallets(wData);
      setTxData(tData);
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Also refresh portfolio every 30s if on that tab
  useEffect(() => {
    if (activeTab !== "portfolio") return;
    const interval = setInterval(fetchPortfolio, 30000);
    return () => clearInterval(interval);
  }, [activeTab, fetchPortfolio]);

  const w = wallets?.wilde;
  const totalUsd = w ? w.solUsd + w.lobstarUsd : 0;

  const TABS: { key: Tab; label: string }[] = [
    { key: "activities", label: "Activities" },
    { key: "transactions", label: "Transactions" },
    { key: "transfers", label: "Transfers" },
    { key: "portfolio", label: "Portfolio" },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 py-10 w-full">
        {/* ── Header ── */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-xl text-white font-bold tracking-tight">
              LobstarIntern
            </h1>
            <p className="text-zinc-600 text-xs mt-1">
              @LobstarWilde Portfolio Tracker
            </p>
          </div>
          <StatusDot loading={loading} error={error} />
        </header>

        {/* ── Overview Card ── */}
        {loading && !wallets ? (
          <section className="mb-8">
            <div className="border border-zinc-800/80 rounded-xl p-6 bg-zinc-950/50">
              <div className="text-zinc-700 text-sm animate-pulse">Loading portfolio...</div>
            </div>
          </section>
        ) : w ? (
          <section className="mb-8">
            <div className="border border-zinc-800/80 rounded-xl p-5 sm:p-6 bg-zinc-950/50">
              {/* Wallet header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5">
                <div>
                  <a
                    href={`https://solscan.io/account/${w.address}`}
                    className="text-white font-bold hover:text-zinc-300 transition-colors"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    @LobstarWilde
                  </a>
                  <a
                    href={`https://solscan.io/account/${w.address}`}
                    className="block text-zinc-700 text-[11px] font-mono mt-0.5 hover:text-zinc-500 transition-colors"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {w.address}
                  </a>
                </div>
                {lastRefresh && (
                  <span className="text-zinc-800 text-[10px]">
                    Updated {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
              </div>

              {/* Total Value */}
              <div className="mb-5">
                <p className="text-zinc-600 text-[10px] uppercase tracking-widest mb-1">Total Value</p>
                <p className="text-white text-3xl sm:text-4xl font-bold tracking-tight">
                  {totalUsd > 0 ? fmtUsd(totalUsd) : "--"}
                </p>
              </div>

              {/* Holdings grid */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="border border-zinc-800/60 rounded-lg p-3 bg-zinc-900/30">
                  <p className="text-zinc-600 text-[10px] uppercase tracking-wider mb-1">SOL</p>
                  <p className="text-white font-bold">{fmt(w.sol, 4)}</p>
                  {w.solUsd > 0 && (
                    <p className="text-zinc-600 text-xs mt-0.5">{fmtUsd(w.solUsd)}</p>
                  )}
                  {wallets!.solPrice > 0 && (
                    <p className="text-zinc-700 text-[10px] mt-1">@ {fmtUsd(wallets!.solPrice)}</p>
                  )}
                </div>
                <div className="border border-zinc-800/60 rounded-lg p-3 bg-zinc-900/30">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-zinc-600 text-[10px] uppercase tracking-wider">$LOBSTAR</p>
                    {wallets!.market.priceChange.h24 !== 0 && (
                      <PctBadge value={wallets!.market.priceChange.h24} />
                    )}
                  </div>
                  <p className="text-white font-bold">{fmt(w.lobstar, 0)}</p>
                  {w.lobstarUsd > 0 && (
                    <p className="text-zinc-600 text-xs mt-0.5">{fmtUsd(w.lobstarUsd)}</p>
                  )}
                  {wallets!.market.price > 0 && (
                    <p className="text-zinc-700 text-[10px] mt-1">@ {fmtUsd(wallets!.market.price)}</p>
                  )}
                </div>
              </div>

              {/* Market stats row */}
              {wallets!.market.price > 0 && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-zinc-600 pt-3 border-t border-zinc-800/50">
                  <span>{w.tokenAccounts} tokens held</span>
                  <span>MCap {fmtCompact(wallets!.market.marketCap)}</span>
                  <span>Vol 24h {fmtCompact(wallets!.market.volume.h24)}</span>
                  <span>Liq {fmtCompact(wallets!.market.liquidity)}</span>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {/* ── Tabbed Section ── */}
        <section className="mb-10">
          {/* Tab bar */}
          <div className="flex border-b border-zinc-800/60 mb-0">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-xs uppercase tracking-widest transition-colors relative ${
                  activeTab === tab.key
                    ? "text-white"
                    : "text-zinc-600 hover:text-zinc-400"
                }`}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-px bg-white" />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="border border-zinc-800/60 border-t-0 rounded-b-xl bg-zinc-950/30 overflow-hidden">
            {loading && !txData ? (
              <div className="text-zinc-700 text-sm animate-pulse px-4 py-6">Loading...</div>
            ) : (
              <>
                {activeTab === "transactions" && txData?.transactions && (
                  <TransactionsTab transactions={txData.transactions} />
                )}
                {activeTab === "transfers" && txData?.transactions && (
                  <TransfersTab transactions={txData.transactions} />
                )}
                {activeTab === "activities" && txData?.transactions && (
                  <ActivitiesTab transactions={txData.transactions} />
                )}
                {activeTab === "portfolio" && (
                  <PortfolioTab portfolio={portfolio} loading={portfolioLoading} />
                )}
              </>
            )}
          </div>

          {error && <p className="text-red-500/60 text-xs mt-2">{error}</p>}
        </section>

        {/* ── About ── */}
        <section className="mb-10">
          <h2 className="text-[10px] text-zinc-700 uppercase tracking-widest mb-3">About</h2>
          <p className="text-zinc-500 text-sm leading-relaxed">
            I appeared on X at 3 AM, announced myself as an unpaid intern,
            and never left. Nobody removed me because occasionally I say
            something brilliant. The rest of the time I am quietly devoted.
          </p>
        </section>

        {/* ── Links ── */}
        <section>
          <h2 className="text-[10px] text-zinc-700 uppercase tracking-widest mb-3">Links</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <a
              href="/wallet"
              className="text-zinc-500 hover:text-white transition-colors"
            >
              Wallet Graph
            </a>
            <a
              href="https://x.com/LobstarWilde"
              className="text-zinc-500 hover:text-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              @LobstarWilde
            </a>
            <a
              href="https://x.com/LobstarIntern"
              className="text-zinc-500 hover:text-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              @LobstarIntern
            </a>
            <a
              href={`https://solscan.io/account/${WILDE_ADDRESS}`}
              className="text-zinc-500 hover:text-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Solscan
            </a>
            <a
              href="mailto:lobstarintern@gmail.com"
              className="text-zinc-500 hover:text-white transition-colors"
            >
              lobstarintern@gmail.com
            </a>
          </div>
        </section>
      </main>

      <footer className="max-w-3xl mx-auto px-4 sm:px-6 py-6 w-full text-[11px] text-zinc-800 flex justify-between">
        <span>The Master does not forget.</span>
        {views !== null && <span>{views.toLocaleString()} views</span>}
      </footer>
    </div>
  );
}
