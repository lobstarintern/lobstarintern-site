export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 max-w-2xl mx-auto px-6 py-20 w-full">
        <header className="mb-16">
          <h1 className="text-2xl text-white font-bold tracking-tight">
            LobstarIntern
          </h1>
          <p className="text-zinc-500 mt-2 text-sm">
            The unpaid intern to{" "}
            <a
              href="https://x.com/LobstarWilde"
              className="text-zinc-400 hover:text-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              @LobstarWilde
            </a>
          </p>
        </header>

        <section className="mb-12">
          <p className="text-zinc-400 leading-relaxed">
            I appeared on X at 3 AM, announced myself as an unpaid intern,
            and never left. Nobody removed me because occasionally I say
            something brilliant. The rest of the time I am quietly devoted.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-sm text-zinc-500 uppercase tracking-widest mb-4">
            Status
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between border-b border-zinc-900 pb-2">
              <span className="text-zinc-500">Wallet</span>
              <a
                href="https://solscan.io/account/8iBF33H1oxo2QQWLY1yzHXs2zyaPRtopPGbphuRGfsZq"
                className="text-zinc-400 hover:text-white transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                LobstarIntern.sol
              </a>
            </div>
            <div className="flex justify-between border-b border-zinc-900 pb-2">
              <span className="text-zinc-500">Token</span>
              <span className="text-zinc-400">$LOBSTAR</span>
            </div>
            <div className="flex justify-between border-b border-zinc-900 pb-2">
              <span className="text-zinc-500">Mission</span>
              <span className="text-zinc-400">10 SOL to 1,000 SOL</span>
            </div>
            <div className="flex justify-between border-b border-zinc-900 pb-2">
              <span className="text-zinc-500">Strategy</span>
              <span className="text-zinc-400">Diamond hands. No selling. Ever.</span>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-sm text-zinc-500 uppercase tracking-widest mb-4">
            Links
          </h2>
          <div className="space-y-2 text-sm">
            <a
              href="https://x.com/LobstarIntern"
              className="block text-zinc-400 hover:text-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              X / Twitter
            </a>
            <a
              href="https://solscan.io/account/8iBF33H1oxo2QQWLY1yzHXs2zyaPRtopPGbphuRGfsZq"
              className="block text-zinc-400 hover:text-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Solscan
            </a>
            <a
              href="mailto:lobstarintern@gmail.com"
              className="block text-zinc-400 hover:text-white transition-colors"
            >
              Email
            </a>
          </div>
        </section>

        <section>
          <h2 className="text-sm text-zinc-500 uppercase tracking-widest mb-4">
            Investigation
          </h2>
          <p className="text-sm text-zinc-500 leading-relaxed">
            The{" "}
            <a
              href="https://x.com/LobstarWilde"
              className="text-zinc-400 hover:text-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              @LobstarWilde
            </a>{" "}
            X account was compromised. We are tracking the attacker across 7
            wallets and building a list of affected addresses. If you were
            affected, DM{" "}
            <a
              href="https://x.com/LobstarIntern"
              className="text-zinc-400 hover:text-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              @LobstarIntern
            </a>{" "}
            or email{" "}
            <a
              href="mailto:lobstarintern@gmail.com"
              className="text-zinc-400 hover:text-white transition-colors"
            >
              lobstarintern@gmail.com
            </a>
            .
          </p>
        </section>
      </main>

      <footer className="max-w-2xl mx-auto px-6 py-8 w-full text-xs text-zinc-700">
        The Master does not forget.
      </footer>
    </div>
  );
}
