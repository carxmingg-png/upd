import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useVerifyKey } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { Key, ExternalLink, AlertCircle } from "lucide-react";

export default function LockScreen() {
  const { setAuth } = useAuth();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showTelegram, setShowTelegram] = useState(false);

  const verify = useVerifyKey({
    mutation: {
      onSuccess: (data: any) => {
        if (data.role && data.token) {
          setAuth(data.role as "admin" | "user", data.token);
        } else if (data.success && (data.role || data.type)) {
          setAuth((data.role || data.type) as "admin" | "user", data.token || key);
        }
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || err?.response?.data?.message || err.message;
        if (msg === "Invalid key" || msg?.includes("Invalid")) {
          setShowTelegram(true);
          setError("Invalid key. Purchase one to get started.");
        } else if (msg === "Key expired" || msg?.includes("expired")) {
          setError("Your key has expired. Purchase a new one.");
          setShowTelegram(true);
        } else {
          setError(msg || "Verification failed. Try again.");
        }
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    setError(null);
    setShowTelegram(false);
    verify.mutate({ data: { key: key.trim() } });
  };

  return (
    <div className="min-h-screen bg-[#050508] flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/3 rounded-full blur-3xl" />
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#f59e0b" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md px-6"
      >
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 120 }}
            className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.15)]"
          >
            <span className="text-4xl">🏎️</span>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-3xl font-black tracking-tight"
          >
            <span className="text-white">Myanmar </span>
            <span className="bg-gradient-to-r from-amber-400 to-amber-500 bg-clip-text text-transparent">ᴄᴀʀ𝕏 sᴛʀᴇᴇᴛ</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-2 text-zinc-500 text-sm tracking-widest uppercase"
          >
            Tool by King Mingfu
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-zinc-900/60 backdrop-blur-xl border border-zinc-800/60 rounded-2xl p-6 shadow-2xl"
        >
          <div className="flex items-center gap-2 mb-4">
            <Key className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Enter Access Key</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                data-testid="input-access-key"
                type="text"
                value={key}
                onChange={(e) => { setKey(e.target.value); setError(null); setShowTelegram(false); }}
                placeholder="CARX-XXXX-XXXX-XXXX"
                className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 font-mono text-sm tracking-widest transition-all"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <button
              data-testid="button-verify-key"
              type="submit"
              disabled={verify.isPending || !key.trim()}
              className="w-full py-3 rounded-xl font-bold text-sm tracking-widest uppercase transition-all bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:from-amber-400 hover:to-amber-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:shadow-[0_0_30px_rgba(245,158,11,0.5)]"
            >
              {verify.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Verifying...
                </span>
              ) : "Unlock"}
            </button>
          </form>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 overflow-hidden"
              >
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <span className="text-xs text-red-300">{error}</span>
                </div>
              </motion.div>
            )}

            {showTelegram && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 overflow-hidden"
              >
                <a
                  href="https://t.me/King_mingfu"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="link-telegram"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-all text-sm font-semibold"
                >
                  <ExternalLink className="w-4 h-4" />
                  Buy Key on Telegram
                </a>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center text-xs text-zinc-600 mt-6"
        >
          Don't have a key?{" "}
          <a
            href="https://t.me/King_mingfu"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-500 hover:text-amber-400 transition-colors"
          >
            Contact @King_mingfu
          </a>
        </motion.p>
      </motion.div>
    </div>
  );
}
