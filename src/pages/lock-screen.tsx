import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useVerifyKey } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { Key, ExternalLink, AlertCircle, ShieldCheck, Sparkles, Volume2, VolumeX, Clipboard, Zap, Car, Trophy, CheckCircle2 } from "lucide-react";
import { RetroRaceCanvas } from "@/components/RetroRaceCanvas";
import { playClick, playSuccess, playError, playUnlock, isSoundEnabled, setSoundEnabled } from "@/lib/sound";

export default function LockScreen() {
  const { setAuth } = useAuth();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showTelegram, setShowTelegram] = useState(false);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    setSoundOn(isSoundEnabled());
  }, []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playClick();
  };

  const verify = useVerifyKey({
    mutation: {
      onSuccess: (data: any) => {
        playUnlock();
        if (data.role && data.token) {
          setAuth(data.role as "admin" | "user", data.token);
        } else if (data.success && (data.role || data.type)) {
          setAuth((data.role || data.type) as "admin" | "user", data.token || key);
        }
      },
      onError: (err: any) => {
        playError();
        const msg = err?.response?.data?.error || err?.response?.data?.message || err.message;
        if (msg === "Invalid key" || msg?.includes("Invalid")) {
          setShowTelegram(true);
          setError("Invalid access key. Please check or get a new key.");
        } else if (msg === "Key expired" || msg?.includes("expired")) {
          setError("Your key has expired. Purchase a renewal to continue.");
          setShowTelegram(true);
        } else {
          setError(msg || "Verification failed. Please try again.");
        }
      },
    },
  });

  const handlePasteKey = async () => {
    playClick();
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const cleaned = text.trim();
        setKey(cleaned);
        setError(null);
        setShowTelegram(false);
        verify.mutate({ data: { key: cleaned } });
      }
    } catch {
      // clipboard permission denied or not supported
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    playClick();
    setError(null);
    setShowTelegram(false);
    verify.mutate({ data: { key: key.trim() } });
  };

  return (
    <div className="min-h-screen bg-[#030308] flex flex-col items-center justify-center relative overflow-hidden text-white select-none px-4 py-8">
      {/* 3D Animated Retro Road Canvas */}
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <RetroRaceCanvas speed="slow" />
      </div>

      {/* Cyberpunk Radial Glows & Grid Pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-b from-amber-500/15 via-purple-600/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-20 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-20 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(3,3,8,0.75)_85%)]" />
      </div>

      {/* Top Floating Controls Bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-30 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900/80 border border-zinc-700/60 backdrop-blur-md text-[11px] font-mono text-zinc-300 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
          <span className="font-bold text-emerald-400">ONLINE</span>
          <span className="text-zinc-600">|</span>
          <span className="hidden sm:inline text-zinc-400">Safe Inject Engine v1.2</span>
        </div>

        <button
          onClick={toggleSound}
          aria-label={soundOn ? "Mute audio" : "Enable audio"}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-400 hover:text-white transition-all text-xs font-mono backdrop-blur-md cursor-pointer"
        >
          {soundOn ? <Volume2 className="w-3.5 h-3.5 text-amber-400" /> : <VolumeX className="w-3.5 h-3.5 text-zinc-500" />}
          <span className="hidden sm:inline">{soundOn ? "SFX On" : "Muted"}</span>
        </button>
      </div>

      {/* Main Container */}
      <motion.div
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-lg mt-6 mb-4"
      >
        {/* Futuristic Brand Header */}
        <div className="text-center mb-6">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 140 }}
            className="relative inline-block mb-4"
          >
            {/* Outer Tachometer Glow Ring */}
            <div className="w-24 h-24 mx-auto rounded-3xl bg-gradient-to-br from-amber-500/25 via-purple-600/20 to-zinc-900/80 border border-amber-400/40 p-1 flex items-center justify-center shadow-[0_0_50px_rgba(245,158,11,0.25)] relative group">
              <div className="absolute inset-1 rounded-2xl bg-black/60 backdrop-blur-md flex items-center justify-center overflow-hidden">
                <span className="text-4xl filter drop-shadow-[0_0_15px_rgba(245,158,11,0.6)] transform group-hover:scale-110 transition-transform">
                  🏎️
                </span>
              </div>
              {/* Corner accents */}
              <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-amber-400" />
              <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-amber-400" />
              <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-amber-400" />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-amber-400" />
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-3xl sm:text-4xl font-black tracking-tight font-sans uppercase"
          >
            <span className="text-white drop-shadow-[0_2px_10px_rgba(255,255,255,0.2)]">MYANMAR </span>
            <span className="bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(245,158,11,0.4)]">
              ᴄᴀʀ𝕏 sᴛʀᴇᴇᴛ
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-1.5 text-zinc-400 text-xs sm:text-sm font-mono tracking-widest uppercase flex items-center justify-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>VIP Cloud Save & Injection Suite</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          </motion.p>
        </div>

        {/* Access Key Authentication Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="relative bg-zinc-950/85 backdrop-blur-2xl border border-zinc-800/80 rounded-3xl p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_30px_rgba(245,158,11,0.08)] overflow-hidden"
        >
          {/* Cyber Corner Tech Brackets */}
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-amber-400/60 rounded-tl-xl" />
          <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-amber-400/60 rounded-tr-xl" />
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-amber-400/60 rounded-bl-xl" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-amber-400/60 rounded-br-xl" />

          {/* Form Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Key className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider font-mono">
                License Key Required
              </span>
            </div>
            <button
              type="button"
              onClick={handlePasteKey}
              className="flex items-center gap-1 text-[11px] font-mono text-amber-400 hover:text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/20 px-2 py-1 rounded-lg transition-all"
            >
              <Clipboard className="w-3 h-3" />
              <span>Paste Key</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                data-testid="input-access-key"
                type="text"
                value={key}
                onChange={(e) => {
                  setKey(e.target.value.toUpperCase());
                  setError(null);
                  setShowTelegram(false);
                }}
                placeholder="CARX-XXXX-XXXX-XXXX"
                className="w-full bg-zinc-900/90 border border-zinc-700/80 focus:border-amber-400 rounded-2xl px-4 py-3.5 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-400/20 font-mono text-sm tracking-widest transition-all shadow-inner"
                autoComplete="off"
                spellCheck={false}
              />
              {key && (
                <button
                  type="button"
                  onClick={() => { setKey(""); setError(null); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs font-mono px-2 py-1"
                >
                  Clear
                </button>
              )}
            </div>

            <button
              data-testid="button-verify-key"
              type="submit"
              disabled={verify.isPending || !key.trim()}
              className="w-full py-3.5 rounded-2xl font-black text-sm tracking-widest uppercase transition-all bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 text-black hover:from-amber-400 hover:to-yellow-300 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_25px_rgba(245,158,11,0.35)] hover:shadow-[0_0_35px_rgba(245,158,11,0.55)] cursor-pointer"
            >
              {verify.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                  AUTHENTICATING...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Zap className="w-4 h-4 fill-current" />
                  UNLOCK SUITE
                </span>
              )}
            </button>
          </form>

          {/* Error Banner */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -5 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 overflow-hidden"
              >
                <div className="flex items-start gap-2.5 p-3.5 bg-red-500/10 border border-red-500/30 rounded-2xl">
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-red-200 leading-relaxed font-mono">{error}</div>
                </div>
              </motion.div>
            )}

            {/* Telegram Purchase Callout */}
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
                  onClick={() => playClick()}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border border-cyan-400/40 bg-gradient-to-r from-cyan-500/15 via-blue-500/15 to-cyan-500/15 text-cyan-300 hover:text-white hover:border-cyan-400 hover:bg-cyan-500/25 transition-all text-xs font-bold font-mono tracking-wider shadow-[0_0_20px_rgba(6,182,212,0.2)]"
                >
                  <ExternalLink className="w-4 h-4" />
                  GET INSTANT KEY ON TELEGRAM (@King_mingfu)
                </a>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Feature Highlights Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-6 pt-5 border-t border-zinc-800/80">
            <div className="flex flex-col items-center text-center p-2 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
              <span className="text-amber-400 font-bold text-xs font-mono">50M+ 🪙</span>
              <span className="text-[10px] text-zinc-500 mt-0.5">Silver & Gold</span>
            </div>
            <div className="flex flex-col items-center text-center p-2 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
              <span className="text-purple-400 font-bold text-xs font-mono">69+ 🏎️</span>
              <span className="text-[10px] text-zinc-500 mt-0.5">All Supercars</span>
            </div>
            <div className="flex flex-col items-center text-center p-2 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
              <span className="text-yellow-400 font-bold text-xs font-mono">LVL 50 ⚡</span>
              <span className="text-[10px] text-zinc-500 mt-0.5">Max StreetPass</span>
            </div>
            <div className="flex flex-col items-center text-center p-2 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
              <span className="text-emerald-400 font-bold text-xs font-mono">SAFE 🛡️</span>
              <span className="text-[10px] text-zinc-500 mt-0.5">Anti-Ban v1.2</span>
            </div>
          </div>
        </motion.div>

        {/* Footer Support Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center mt-6 space-y-2"
        >
          <p className="text-xs text-zinc-500 font-mono">
            Need an instant access license key?{" "}
            <a
              href="https://t.me/King_mingfu"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => playClick()}
              className="text-amber-400 hover:text-amber-300 font-semibold underline underline-offset-4 decoration-amber-500/40 hover:decoration-amber-400 transition-all"
            >
              Contact @King_mingfu
            </a>
          </p>
          <div className="flex items-center justify-center gap-4 text-[10px] text-zinc-600 font-mono">
            <span>TLS 1.3 Encrypted</span>
            <span>•</span>
            <span>Zero Data Stored</span>
            <span>•</span>
            <span>Auto Cloud Sync</span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
