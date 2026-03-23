"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface WalletInfo {
  label: string;
  address: string;
  sol: number;
  solUsd: number;
  lobstar: number;
}

interface WalletData {
  timestamp: string;
  solPrice: number;
  intern: WalletInfo;
  wilde: WalletInfo;
  error?: string;
}

interface Transaction {
  signature: string;
  timestamp: number;
  type: string;
  description: string;
  fee: number;
  feePayer: string;
}

interface TransactionData {
  wallet: string;
  address: string;
  transactions: Transaction[];
  timestamp: string;
  error?: string;
}

interface XAccount {
  username: string;
  followers: number;
  following: number;
  posts: number;
  likes: number;
  listed: number;
  media: number;
  joined: string;
}

interface XStats {
  updated_at: string;
  intern: XAccount;
  wilde: XAccount;
}

function timeAgo(ts: number): string {
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function truncSig(sig: string): string {
  return `${sig.slice(0, 4)}...${sig.slice(-4)}`;
}

function fmt(n: number, d: number = 2): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function fmtUsd(n: number): string {
  return "$" + n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function Dashboard() {
  const [wallets, setWallets] = useState<WalletData | null>(null);
  const [txData, setTxData] = useState<TransactionData | null>(null);
  const [xStats, setXStats] = useState<XStats | null>(null);
  const [activeWallet, setActiveWallet] = useState<"wilde" | "intern">(
    "wilde",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [wRes, tRes, xRes] = await Promise.all([
        fetch("/api/wallets"),
        fetch(`/api/transactions?wallet=${activeWallet}`),
        fetch("/x-stats.json"),
      ]);

      const [wData, tData] = await Promise.all([wRes.json(), tRes.json()]);

      if (wData.error) throw new Error(wData.error);
      if (tData.error) throw new Error(tData.error);

      setWallets(wData);
      setTxData(tData);
      if (xRes.ok) setXStats(await xRes.json());
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [activeWallet]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const walletOrder = ["wilde", "intern"] as const;
  const txWalletOrder = ["wilde", "intern"] as const;

  return (
    <div className="flex flex-col min-h-screen">
      <nav className="max-w-2xl mx-auto px-6 pt-8 w-full flex gap-4 text-sm">
        <Link
          href="/"
          className="text-zinc-500 hover:text-white transition-colors"
        >
          Home
        </Link>
        <span className="text-zinc-800">|</span>
        <span className="text-white">Dashboard</span>
      </nav>

      <main className="flex-1 max-w-2xl mx-auto px-6 py-12 w-full">
        {/* Header */}
        <header className="mb-12">
          <h1 className="text-lg text-white uppercase tracking-[0.2em] font-bold">
            Dashboard
          </h1>
          <p className="text-zinc-600 text-sm mt-1">
            live metrics &mdash; auto-refreshes every 30s
          </p>
        </header>

        {/* Status Indicator */}
        <section className="mb-10">
          <div className="flex items-center gap-3">
            <span
              className={`inline-block w-2 h-2 rounded-full ${error ? "bg-red-500" : "bg-zinc-400 animate-pulse"}`}
            />
            <span
              className={`text-sm uppercase tracking-wider ${error ? "text-red-400" : "text-zinc-400"}`}
            >
              {loading ? "Connecting" : error ? "Error" : "Online"}
            </span>
          </div>
          {lastRefresh && (
            <p className="text-zinc-700 text-xs mt-1 ml-5">
              Last refresh: {lastRefresh.toLocaleTimeString()}
            </p>
          )}
          {error && (
            <p className="text-red-500/60 text-xs mt-1 ml-5">{error}</p>
          )}
        </section>

        {/* System Stats */}
        <section className="mb-10">
          <h2 className="text-xs text-zinc-600 uppercase tracking-[0.15em] mb-4">
            System
          </h2>
          <div className="space-y-2 text-sm">
            {[
              ["Model", "Claude Sonnet 4.5"],
              ["Active Crons", "13 / 20"],
              ["Gateway", "Running"],
              ["Wallet Monitor", "Active"],
              ["Hack Tracker", "Active — 9 wallets watched"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between border-b border-zinc-900 pb-2"
              >
                <span className="text-zinc-600">{label}</span>
                <span className="text-zinc-400">{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* X Stats */}
        {xStats && (
          <section className="mb-10">
            <h2 className="text-xs text-zinc-600 uppercase tracking-[0.15em] mb-4">
              X / Social
            </h2>
            <div className="space-y-4">
              {(["wilde", "intern"] as const).map((key) => {
                const x = xStats[key];
                return (
                  <div key={key} className="border border-zinc-900 rounded p-4">
                    <div className="flex justify-between items-center mb-3">
                      <a
                        href={`https://x.com/${x.username}`}
                        className="text-zinc-300 text-sm font-bold hover:text-white transition-colors"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        @{x.username}
                      </a>
                      <span className="text-zinc-700 text-xs">
                        joined {x.joined}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
                      {[
                        ["Followers", x.followers],
                        ["Following", x.following],
                        ["Posts", x.posts],
                        ["Likes", x.likes],
                        ["Listed", x.listed],
                        ["Media", x.media],
                      ].map(([label, val]) => (
                        <div key={label as string} className="flex justify-between">
                          <span className="text-zinc-600">{label}</span>
                          <span className="text-white font-bold">
                            {(val as number).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-zinc-800 text-[10px] mt-2">
              updated {new Date(xStats.updated_at).toLocaleString()}
            </p>
          </section>
        )}

        {/* Wallet Portfolio */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs text-zinc-600 uppercase tracking-[0.15em]">
              Portfolio
            </h2>
            {wallets && wallets.solPrice > 0 && (
              <span className="text-zinc-700 text-xs">
                SOL {fmtUsd(wallets.solPrice)}
              </span>
            )}
          </div>
          {loading && !wallets ? (
            <div className="text-zinc-700 text-sm animate-pulse">
              Loading wallets...
            </div>
          ) : wallets ? (
            <div className="space-y-4">
              {walletOrder.map((key) => {
                const w = wallets[key];
                return (
                  <div key={key} className="border border-zinc-900 rounded p-4">
                    <div className="flex justify-between items-center mb-3">
                      <a
                        href={`https://solscan.io/account/${w.address}`}
                        className="text-zinc-300 text-sm font-bold hover:text-white transition-colors"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {w.label}
                      </a>
                      <a
                        href={`https://solscan.io/account/${w.address}`}
                        className="text-zinc-700 hover:text-zinc-400 text-xs transition-colors"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {truncSig(w.address)}
                      </a>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-zinc-600">SOL</span>
                        <div className="text-right">
                          <span className="text-white font-bold">
                            {fmt(w.sol, 4)}
                          </span>
                          {w.solUsd > 0 && (
                            <span className="text-zinc-600 ml-2 text-xs">
                              {fmtUsd(w.solUsd)}
                            </span>
                          )}
                        </div>
                      </div>
                      {w.lobstar > 0 && (
                        <div className="flex justify-between">
                          <span className="text-zinc-600">$LOBSTAR</span>
                          <span className="text-white font-bold">
                            {fmt(w.lobstar, 0)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>

        {/* Transaction History */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs text-zinc-600 uppercase tracking-[0.15em]">
              Recent Transactions
            </h2>
            <div className="flex gap-1">
              {txWalletOrder.map((key) => (
                <button
                  key={key}
                  onClick={() => setActiveWallet(key)}
                  className={`text-xs px-3 py-1 rounded transition-colors cursor-pointer ${
                    activeWallet === key
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-600 hover:text-zinc-400"
                  }`}
                >
                  {key === "intern" ? "Intern" : "Wilde"}
                </button>
              ))}
            </div>
          </div>

          {loading && !txData ? (
            <div className="text-zinc-700 text-sm animate-pulse">
              Loading transactions...
            </div>
          ) : txData?.transactions?.length ? (
            <div className="space-y-0">
              {txData.transactions.map((tx) => (
                <a
                  key={tx.signature}
                  href={`https://solscan.io/tx/${tx.signature}`}
                  className="flex items-start justify-between py-2.5 border-b border-zinc-900/50 text-xs gap-4 hover:bg-zinc-900/30 transition-colors block"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-zinc-500 uppercase text-[10px] tracking-wider font-bold">
                        {tx.type?.replace(/_/g, " ") || "UNKNOWN"}
                      </span>
                      <span className="text-zinc-700">
                        {tx.timestamp ? timeAgo(tx.timestamp) : "—"}
                      </span>
                    </div>
                    <p className="text-zinc-600 truncate leading-relaxed">
                      {tx.description || "No description"}
                    </p>
                  </div>
                  <span className="text-zinc-700 hover:text-zinc-400 transition-colors shrink-0 mt-0.5">
                    {truncSig(tx.signature)}
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-zinc-700 text-sm">No transactions found.</p>
          )}
        </section>
      </main>

      <footer className="max-w-2xl mx-auto px-6 py-8 w-full text-xs text-zinc-700">
        The Master does not forget.
      </footer>
    </div>
  );
}
