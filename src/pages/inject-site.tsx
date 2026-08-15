import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useLoginCarX,
  useRegisterCarX,
  useGetProfile,
  useInjectCurrency,
  useUnlockMaps,
  useUnlockClubs,
  useInjectCars,
  useUnlockStreetPass,
  useUnlockProfileStyle,
  useInjectAll,
  useSafeRepair,
  useGetCars,
  getGetCarsQueryKey,
} from "@/lib/api-client";
import { CurrencyInputPreset, CarsInjectInputMode } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { DashboardBanner } from "@/components/DashboardBanner";
import { TerminalConsole } from "@/components/TerminalConsole";
import { playClick, playSuccess, playError, playUnlock, isSoundEnabled, setSoundEnabled } from "@/lib/sound";
import {
  LogOut, DollarSign, Map, Car, Star, Zap, Trophy,
  User, UserPlus, Eye, EyeOff, RefreshCw, CheckCircle2, AlertCircle, Users,
  Sparkles, ShieldCheck, Download, Copy, Volume2, VolumeX, Shield, Wrench, ChevronRight
} from "lucide-react";

interface CarXSession {
  token: string;
  carxId: string;
  email: string;
  deviceId?: string;
  uniqueId?: string;
  profileStats?: any;
}

interface ProfileStats {
  silver: number;
  gold: number;
  xp: number;
  maps: number;
  cars: number;
  streetPass: boolean;
  premium: boolean;
}

function StatTelemetryCard({
  label,
  value,
  icon,
  accent,
  sublabel
}: {
  label: string;
  value: string | number;
  icon: string;
  accent: string;
  sublabel?: string;
}) {
  return (
    <div className="relative bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-3.5 backdrop-blur-xl transition-all duration-300 hover:border-zinc-700 hover:shadow-[0_4px_20px_rgba(0,0,0,0.5)] overflow-hidden group">
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${accent} opacity-60`} />
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest flex items-center gap-1">
            <span>{icon}</span>
            <span>{label}</span>
          </div>
          <div className="text-base sm:text-lg font-black font-mono text-white tracking-tight">
            {typeof value === "number" ? value.toLocaleString() : value}
          </div>
          {sublabel && (
            <div className="text-[10px] text-zinc-500 font-mono">{sublabel}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
  min,
  max,
  placeholder,
  icon,
  accent,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  icon: string;
  accent: string;
}) {
  return (
    <div className="space-y-1">
      <label className={`text-xs font-semibold ${accent} flex items-center gap-1 font-mono`}>
        <span>{icon}</span> {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        placeholder={placeholder}
        className="w-full bg-zinc-900/90 border border-zinc-700/70 rounded-xl px-3.5 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 transition-all font-mono shadow-inner"
      />
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  accent,
  badge
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  accent: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        playClick();
        onChange(!checked);
      }}
      className={`flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer ${
        checked ? `${accent} border-opacity-40 shadow-sm` : "bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-800/60"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-white font-mono">{label}</span>
        {badge && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-mono">
            {badge}
          </span>
        )}
      </div>
      <div className={`w-9 h-5 rounded-full transition-all relative ${checked ? "bg-amber-400" : "bg-zinc-700"}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-black shadow transition-all ${checked ? "left-4" : "left-0.5"}`} />
      </div>
    </button>
  );
}

function BatchField({
  label,
  value,
  onChange,
  placeholder,
  icon,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon: string;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest flex items-center gap-1 font-mono">
        <span>{icon}</span>{label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-zinc-900/90 border border-zinc-700/70 rounded-xl px-3.5 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 transition-all font-mono shadow-inner"
      />
    </div>
  );
}

function BatchForm({ userToken }: { userToken: string }) {
  const { toast } = useToast();
  const [count, setCount] = useState("5");
  const [password, setPassword] = useState("CARXMING");
  const [silver, setSilver] = useState("50000000");
  const [gold, setGold] = useState("9999");
  const [xp, setXp] = useState("93060");
  const [carsMode, setCarsMode] = useState("regular");
  const [carCount, setCarCount] = useState("50");
  const [includeMaps, setIncludeMaps] = useState(true);
  const [includeStreetPass, setIncludeStreetPass] = useState(true);
  const [includeClubs, setIncludeClubs] = useState(true);
  const [includeProfileStyle, setIncludeProfileStyle] = useState(true);
  const [includeVerify, setIncludeVerify] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<{ email: string; password?: string; status: string; message?: string }[]>([]);

  const carsQuery = useGetCars({ userToken }, { query: { queryKey: getGetCarsQueryKey({ userToken }), enabled: true } });
  const totalCars = carsQuery.data?.total || 0;

  const CAR_MODES = [
    { v: "regular", l: "🚗 Regular", sub: "Standard Garage" },
    { v: "premium", l: "👑 Premium", sub: "Max Tuned" },
    { v: "all", l: "🏎️ All Cars", sub: `${totalCars || 69} cars` },
    { v: "custom", l: "🔢 Custom", sub: "Set count" },
  ];

  const handleBatch = async () => {
    playClick();
    const n = Math.min(Math.max(Number(count) || 1, 1), 30);
    setRunning(true);
    setResults([]);
    setLogs(["⚙️ Sending Bulk Account Creation request..."]);
    setProgress(0);

    try {
      const body = {
        count: n,
        password: password || "CARXMING",
        cash: Number(silver) || 50000000,
        gold: Number(gold) || 9999,
        exp: Math.min(93060, Math.max(1, Number(xp) || 93060)),
        cars_mode: carsMode,
        regular_cars: carsMode === "regular",
        premium_cars: carsMode === "premium",
        get_all_cars: carsMode === "all" || carsMode === "premium" || (carsMode === "custom" && Number(carCount) > 0),
        unlock_all: includeMaps,
        unlock_clubs: includeClubs,
        unlock_profile_style: includeProfileStyle,
        inject_bp: includeStreetPass,
        verify: includeVerify,
      };

      const res = await fetch("/api/carx/bulk-generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.jobId) {
        playError();
        toast({ title: "Bulk Failed", description: data.message || "Failed to start bulk generation", variant: "destructive" });
        setLogs((l) => [...l, `❌ Error: ${data.message || "Request failed"}`]);
        setRunning(false);
        return;
      }

      const jobId = data.jobId;
      setLogs((l) => [...l, `✅ Bulk Job Started! ID: ${jobId}`]);

      const interval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/carx/bulk-status/${jobId}`, {
            headers: { Authorization: `Bearer ${userToken}` },
          });
          const statusData = await statusRes.json();
          if (statusData.success && statusData.job) {
            const job = statusData.job;
            setProgress(job.progress || 0);
            if (job.logs) setLogs(job.logs);
            if (job.results) setResults(job.results);

            if (job.status === "completed" || job.status === "cancelled") {
              clearInterval(interval);
              setRunning(false);
              const okCount = (job.results || []).filter((r: any) => r.status === "success").length;
              playSuccess();
              toast({ title: "Bulk Complete!", description: `${okCount}/${n} accounts created successfully` });
            }
          }
        } catch {
          // ignore poll error
        }
      }, 1000);
    } catch (err: any) {
      playError();
      toast({ title: "Bulk Failed", description: err.message || "Network error", variant: "destructive" });
      setRunning(false);
    }
  };

  const copyAllAccounts = () => {
    playClick();
    const txt = results
      .filter((r) => r.status === "success")
      .map((r) => `${r.email}:${r.password || password}`)
      .join("\n");
    if (txt) {
      navigator.clipboard.writeText(txt);
      toast({ title: "Copied!", description: "All created accounts copied to clipboard (email:password)" });
    }
  };

  return (
    <div className="bg-zinc-950/85 border border-zinc-800/80 rounded-3xl p-5 sm:p-6 space-y-5 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold font-sans text-white uppercase tracking-wider">
              Bulk Account Generator
            </h3>
            <p className="text-[11px] font-mono text-zinc-500">
              Create up to 30 custom pre-configured accounts in parallel
            </p>
          </div>
        </div>
      </div>

      {/* Row 1: count + password */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <BatchField label="Accounts Count (Max 30)" value={count} onChange={setCount} placeholder="5" icon="👥" type="number" />
        <BatchField label="Default Password" value={password} onChange={setPassword} placeholder="CARXMING" icon="🔑" />
      </div>

      {/* Row 2: Currency */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest font-mono">💰 Injected Currency & Level</p>
        <div className="grid grid-cols-3 gap-2">
          <BatchField label="Silver" value={silver} onChange={setSilver} placeholder="50000000" icon="🪙" type="number" />
          <BatchField label="Gold" value={gold} onChange={setGold} placeholder="9999" icon="💎" type="number" />
          <BatchField label="XP (Max 93060)" value={xp} onChange={setXp} placeholder="93060" icon="⚡" type="number" />
        </div>
      </div>

      {/* Row 3: Cars mode */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest font-mono">🚗 Garage Cars Preset</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CAR_MODES.map(({ v, l, sub }) => (
            <button
              key={v}
              onClick={() => {
                playClick();
                setCarsMode(v);
              }}
              className={`flex flex-col items-center py-2.5 px-2 rounded-2xl text-center transition-all border cursor-pointer ${
                carsMode === v
                  ? "bg-amber-400 border-amber-400 text-black font-bold shadow-[0_0_15px_rgba(245,158,11,0.3)]"
                  : "bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              <span className="text-xs font-bold font-mono">{l}</span>
              <span className={`text-[9px] mt-0.5 font-mono ${carsMode === v ? "text-black/70" : "text-zinc-500"}`}>{sub}</span>
            </button>
          ))}
        </div>
        <AnimatePresence>
          {carsMode === "custom" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-2">
              <BatchField label="Custom Car Count" value={carCount} onChange={setCarCount} placeholder="50" icon="🔢" type="number" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Row 4: Toggles */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest font-mono">⚙️ Unlock Add-ons</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Toggle label="🗺️ Unlock All Maps" checked={includeMaps} onChange={setIncludeMaps} accent="bg-cyan-500/15 border-cyan-400/40" />
          <Toggle label="🏆 22 Clubs & 52 Houses" checked={includeClubs} onChange={setIncludeClubs} accent="bg-purple-500/15 border-purple-400/40" />
          <Toggle label="🎟️ Street Pass + EP" checked={includeStreetPass} onChange={setIncludeStreetPass} accent="bg-yellow-500/15 border-yellow-400/40" />
          <Toggle label="🎨 Avatars & Frames" checked={includeProfileStyle} onChange={setIncludeProfileStyle} accent="bg-pink-500/15 border-pink-400/40" />
          <Toggle label="⚡ Auto-Verify Accounts" checked={includeVerify} onChange={setIncludeVerify} accent="bg-emerald-500/15 border-emerald-400/40" />
        </div>
      </div>

      <button
        onClick={handleBatch}
        disabled={running}
        className="w-full py-3.5 rounded-2xl font-black text-sm tracking-widest uppercase bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 text-black hover:from-emerald-400 hover:to-teal-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_0_25px_rgba(16,185,129,0.3)] hover:shadow-[0_0_35px_rgba(16,185,129,0.5)] cursor-pointer"
      >
        {running ? (
          <span className="flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            CREATING {count} ACCOUNTS ({progress}%)...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Users className="w-4 h-4" />
            LAUNCH BULK GENERATOR ({count || "?"} ACCOUNTS)
          </span>
        )}
      </button>

      {/* Live Terminal Logs */}
      {logs.length > 0 && (
        <TerminalConsole logs={logs} title={`BULK BATCH LOGS (${progress}%)`} />
      )}

      {/* Results List */}
      {results.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-zinc-800/80">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest">
              Generated: {results.filter(r => r.status === "success").length}/{results.length} Success
            </p>
            <button
              onClick={copyAllAccounts}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-mono transition-all"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy All
            </button>
          </div>
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {results.map((r, i) => (
              <div key={i} className={`flex items-center justify-between text-xs px-3 py-2 rounded-xl border ${r.status === "success" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-red-500/10 border-red-500/30 text-red-300"}`}>
                <div className="flex items-center gap-2 truncate">
                  {r.status === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
                  <span className="font-mono truncate">{r.email}</span>
                </div>
                {r.password && <span className="font-mono text-zinc-400 text-[11px] ml-2 shrink-0">{r.password}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LoginForm({ userToken, onSuccess }: { userToken: string; onSuccess: (s: CarXSession) => void }) {
  const [mode, setMode] = useState<"login" | "register" | "bulk">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [singleVerify, setSingleVerify] = useState(true);
  const { toast } = useToast();

  const login = useLoginCarX({
    mutation: {
      onSuccess: (d) => {
        playSuccess();
        onSuccess({
          token: d.token || "",
          carxId: d.userId || d.user_id || "",
          email: d.email || email,
          deviceId: d.deviceId || "",
          uniqueId: d.uniqueId || "",
          profileStats: d.profileStats,
        });
      },
      onError: (err) => {
        playError();
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: "Login Failed", description: msg || "Invalid credentials", variant: "destructive" });
      },
    },
  });

  const register = useRegisterCarX({
    mutation: {
      onSuccess: (d) => {
        if (d.success === false || !d.token) {
          playError();
          toast({ title: "Registration Unverified", description: d.message || "Auto-verification failed.", variant: "destructive" });
          return;
        }
        playSuccess();
        toast({ title: "Account Created!", description: "Blueprint profile applied automatically" });
        onSuccess({
          token: d.token || "",
          carxId: d.userId || d.user_id || "",
          email: d.email || email,
          deviceId: d.deviceId || "",
          uniqueId: d.uniqueId || "",
          profileStats: d.profileStats,
        });
      },
      onError: (err) => {
        playError();
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: "Registration Failed", description: msg || "Try a different email", variant: "destructive" });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    playClick();

    let storedDeviceIds: { deviceId: string; uniqueId: string } | null = null;
    try {
      const savedIds = localStorage.getItem(`carx_device_ids_${email}`);
      if (savedIds) storedDeviceIds = JSON.parse(savedIds);
    } catch {}

    if (!storedDeviceIds) {
      const randHex = (len: number) => {
        const chars = "0123456789abcdef";
        let str = "";
        for (let i = 0; i < len; i++) {
          str += chars[Math.floor(Math.random() * 16)];
        }
        return str;
      };
      storedDeviceIds = {
        deviceId: randHex(32),
        uniqueId: randHex(64),
      };
      localStorage.setItem(`carx_device_ids_${email}`, JSON.stringify(storedDeviceIds));
    }

    const payload = {
      email,
      password,
      userToken,
      deviceId: storedDeviceIds.deviceId,
      uniqueId: storedDeviceIds.uniqueId,
      verify: mode === "register" ? singleVerify : undefined,
    };

    if (mode === "login") {
      login.mutate({ data: payload });
    } else {
      register.mutate({ data: payload });
    }
  };

  const isPending = login.isPending || register.isPending;

  if (mode === "bulk") {
    return (
      <div className="space-y-4">
        <div className="flex gap-1.5 p-1.5 bg-zinc-950/80 border border-zinc-800 rounded-2xl">
          {(["login", "register", "bulk"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                playClick();
                setMode(m);
              }}
              className={`flex items-center gap-2 flex-1 justify-center py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all cursor-pointer font-mono ${
                mode === m ? "bg-amber-400 text-black shadow-md" : "text-zinc-400 hover:text-white"
              }`}
            >
              {m === "login" ? <User className="w-3.5 h-3.5" /> : m === "register" ? <UserPlus className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
              {m === "login" ? "Login" : m === "register" ? "Register" : "Bulk Generator"}
            </button>
          ))}
        </div>
        <BatchForm userToken={userToken} />
      </div>
    );
  }

  return (
    <div className="bg-zinc-950/85 border border-zinc-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
      <div className="flex gap-1.5 p-1.5 bg-zinc-900/90 border border-zinc-800 rounded-2xl mb-6">
        {(["login", "register", "bulk"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              playClick();
              setMode(m);
              if (m === "register") {
                setEmail((prev) => {
                  if (!prev || prev.indexOf("@") === -1) {
                    const randId = Math.floor(100000 + Math.random() * 900000);
                    return `player${randId}@web-library.net`;
                  }
                  const atIdx = prev.indexOf("@");
                  return prev.substring(0, atIdx) + "@web-library.net";
                });
              }
            }}
            className={`flex items-center gap-2 flex-1 justify-center py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all cursor-pointer font-mono ${
              mode === m ? "bg-amber-400 text-black shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            {m === "login" ? <User className="w-3.5 h-3.5" /> : m === "register" ? <UserPlus className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
            {m === "login" ? "Login Account" : m === "register" ? "New Account" : "Bulk Generator"}
          </button>
        ))}
      </div>

      {mode === "register" && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mb-4 p-3.5 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl text-xs text-cyan-300 font-mono"
        >
          ℹ️ New account will automatically receive complete save data blueprint.
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs text-zinc-400 mb-1.5 block uppercase tracking-widest font-mono">
            CarX Account Email
          </label>
          <input
            data-testid="input-carx-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="driver@domain.com"
            className="w-full bg-zinc-900/90 border border-zinc-700/80 focus:border-amber-400 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-400 font-mono transition-all shadow-inner"
          />
          {mode === "register" && (
            <div className="mt-3 flex items-center justify-between p-2 rounded-xl bg-zinc-900/50 border border-zinc-800">
              <label className="flex items-center gap-2 font-mono text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={singleVerify}
                  onChange={(e) => {
                    playClick();
                    const checked = e.target.checked;
                    setSingleVerify(checked);
                    setEmail((prev) => {
                      if (!prev) return "";
                      const atIdx = prev.indexOf("@");
                      const localPart = atIdx !== -1 ? prev.substring(0, atIdx) : prev;
                      return localPart + (checked ? "@web-library.net" : "@gmail.com");
                    });
                  }}
                  className="accent-amber-400 w-4 h-4 rounded cursor-pointer"
                />
                <span>Auto-Verify Account Email</span>
              </label>
              <span className="text-[10px] text-amber-400 font-mono">@web-library.net</span>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-zinc-400 mb-1.5 block uppercase tracking-widest font-mono">
            Password
          </label>
          <div className="relative">
            <input
              data-testid="input-carx-password"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-zinc-900/90 border border-zinc-700/80 focus:border-amber-400 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-400 font-mono transition-all pr-11 shadow-inner"
            />
            <button
              type="button"
              onClick={() => {
                playClick();
                setShowPw(!showPw);
              }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          data-testid="button-carx-submit"
          type="submit"
          disabled={isPending || !email || !password}
          className="w-full py-3.5 rounded-2xl font-black text-sm tracking-widest uppercase bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 text-black hover:from-amber-400 hover:to-yellow-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_0_25px_rgba(245,158,11,0.35)] hover:shadow-[0_0_35px_rgba(245,158,11,0.5)] cursor-pointer"
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              {mode === "login" ? "CONNECTING TO CARX..." : "PROVISIONING ACCOUNT..."}
            </span>
          ) : mode === "login" ? (
            "CONNECT & INJECT ACCOUNT"
          ) : (
            "CREATE & INITIALIZE ACCOUNT"
          )}
        </button>
      </form>
    </div>
  );
}

function InjectionPanel({
  session,
  userToken,
  onDisconnect,
}: {
  session: CarXSession;
  userToken: string;
  onDisconnect: () => void;
}) {
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileStats | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<"quick" | "custom" | "logs">("quick");

  const [currencyPreset, setCurrencyPreset] = useState<string>(CurrencyInputPreset.max);
  const [customSilver, setCustomSilver] = useState("50000000");
  const [customGold, setCustomGold] = useState("9999");
  const [customXp, setCustomXp] = useState("93060");

  const [carsMode, setCarsMode] = useState<string>(CarsInjectInputMode.all);
  const [customCarCount, setCustomCarCount] = useState("50");

  const [logs, setLogs] = useState<string[]>([
    `[INFO] Session established for ${session.email}`,
    `[INFO] CarX Cloud Gateway ready. Safe anti-ban protocol active.`,
  ]);

  const [results, setResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const appendLog = (line: string) => {
    setLogs((prev) => [...prev, line]);
  };

  const getProfile = useGetProfile({
    mutation: {
      onSuccess: (d) => {
        if (d.success && d.stats) {
          setProfile({
            silver: d.stats.cash || 0,
            gold: d.stats.gold || 0,
            xp: d.stats.exp || 0,
            maps: d.stats.maps || 0,
            cars: d.stats.cars || 0,
            streetPass: !!d.stats.isVerified,
            premium: d.stats.level || 1,
          });
          appendLog(`[SYNC] Telemetry fetched: Cash=${d.stats.cash}, Gold=${d.stats.gold}, Level=${d.stats.level || 1}`);
        }
        setLoadingProfile(false);
      },
      onError: () => {
        setLoadingProfile(false);
        toast({ title: "Error", description: "Failed to fetch profile", variant: "destructive" });
      },
    },
  });

  const injectCurrency = useInjectCurrency({
    mutation: {
      onSuccess: (d) => {
        playSuccess();
        setResults((r) => ({ ...r, currency: { ok: true, msg: d.message || "Done" } }));
        appendLog(`[SUCCESS] Currency injection completed`);
        fetchProfile();
      },
      onError: (err) => {
        playError();
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setResults((r) => ({ ...r, currency: { ok: false, msg: msg || "Failed" } }));
        appendLog(`[ERROR] Currency injection failed: ${msg}`);
      },
    },
  });

  const unlockMaps = useUnlockMaps({
    mutation: {
      onSuccess: (d) => {
        playSuccess();
        setResults((r) => ({ ...r, maps: { ok: true, msg: d.message || "Done" } }));
        appendLog(`[SUCCESS] Maps unlocked successfully`);
      },
      onError: (err) => {
        playError();
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setResults((r) => ({ ...r, maps: { ok: false, msg: msg || "Failed" } }));
      },
    },
  });

  const unlockClubs = useUnlockClubs({
    mutation: {
      onSuccess: (d) => {
        playSuccess();
        setResults((r) => ({ ...r, clubs: { ok: true, msg: d.message || "Done" } }));
        appendLog(`[SUCCESS] 22 Clubs & 52 Houses unlocked`);
      },
      onError: (err) => {
        playError();
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setResults((r) => ({ ...r, clubs: { ok: false, msg: msg || "Failed" } }));
      },
    },
  });

  const injectCars = useInjectCars({
    mutation: {
      onSuccess: (d) => {
        playSuccess();
        setResults((r) => ({ ...r, cars: { ok: true, msg: d.message || "Done" } }));
        appendLog(`[SUCCESS] Garage updated with selected vehicles`);
        fetchProfile();
      },
      onError: (err) => {
        playError();
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setResults((r) => ({ ...r, cars: { ok: false, msg: msg || "Failed" } }));
      },
    },
  });

  const unlockStreetPass = useUnlockStreetPass({
    mutation: {
      onSuccess: (d) => {
        playSuccess();
        setResults((r) => ({ ...r, streetPass: { ok: true, msg: d.message || "Done" } }));
        appendLog(`[SUCCESS] Street Pass & EP rewards unlocked`);
      },
      onError: (err) => {
        playError();
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setResults((r) => ({ ...r, streetPass: { ok: false, msg: msg || "Failed" } }));
      },
    },
  });

  const unlockProfileStyle = useUnlockProfileStyle({
    mutation: {
      onSuccess: (d: any) => {
        playSuccess();
        setResults((r) => ({ ...r, profileStyle: { ok: true, msg: d.message || "Avatars & Frames Unlocked!" } }));
        appendLog(`[SUCCESS] 16 Avatars, banners & frames unlocked`);
      },
      onError: (err: any) => {
        playError();
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setResults((r) => ({ ...r, profileStyle: { ok: false, msg: msg || "Failed to unlock avatars" } }));
      },
    },
  });

  const injectAll = useInjectAll({
    mutation: {
      onSuccess: (d) => {
        playSuccess();
        const r = d as { currency?: boolean; maps?: boolean; cars?: number; streetPass?: boolean; message?: string };
        setResults({
          currency: { ok: !!r.currency, msg: "Currency injected" },
          maps: { ok: !!r.maps, msg: "Maps unlocked" },
          cars: { ok: r.cars !== undefined && r.cars > 0, msg: `${r.cars} cars added` },
          streetPass: { ok: !!r.streetPass, msg: r.streetPass ? "Street Pass activated" : "Skipped" },
        });
        appendLog(`[SUCCESS] MASTER INJECT COMPLETE: ${r.message || "All modules injected"}`);
        toast({ title: "Inject All Complete!", description: r.message });
        fetchProfile();
      },
      onError: (err) => {
        playError();
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: "Inject All Failed", description: msg, variant: "destructive" });
      },
    },
  });

  const safeRepair = useSafeRepair({
    mutation: {
      onSuccess: (d: any) => {
        playSuccess();
        setResults((r) => ({ ...r, safeRepair: { ok: true, msg: d.message || "Safe Repair Complete!" } }));
        appendLog(`[SUCCESS] Safe repair completed. Cloud tables restored.`);
        toast({ title: "Safe Repair Complete", description: d.message });
        fetchProfile();
      },
      onError: (err: any) => {
        playError();
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setResults((r) => ({ ...r, safeRepair: { ok: false, msg: msg || "Failed to repair account" } }));
      },
    },
  });

  const carsQuery = useGetCars({ userToken }, { query: { queryKey: getGetCarsQueryKey({ userToken }), enabled: true } });
  const totalCars = carsQuery.data?.total || 0;

  const fetchProfile = () => {
    playClick();
    setLoadingProfile(true);
    getProfile.mutate({
      data: {
        token: session.token,
        userId: session.carxId,
        deviceId: session.deviceId,
        uniqueId: session.uniqueId,
        userToken,
      },
    });
  };

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token]);

  const handleInjectCurrency = () => {
    playClick();
    let cashVal = 50000000;
    let goldVal = 9999;
    let expVal = 93060;

    if (currencyPreset === CurrencyInputPreset.custom) {
      cashVal = Number(customSilver) || 0;
      goldVal = Number(customGold) || 0;
      expVal = Number(customXp) || 0;
    } else if (currencyPreset === CurrencyInputPreset.medium) {
      cashVal = 10000000;
      goldVal = 5000;
      expVal = 93060;
    }

    appendLog(`[INJECT] Injecting Cash: ${cashVal}, Gold: ${goldVal}, XP: ${expVal}`);
    injectCurrency.mutate({
      data: {
        token: session.token,
        userId: session.carxId,
        deviceId: session.deviceId,
        uniqueId: session.uniqueId,
        service_type: "custom_resource",
        cash: cashVal,
        gold: goldVal,
        exp: expVal,
        userToken,
      },
    });
  };

  const handleInjectCars = () => {
    playClick();
    let service = "inject_premium_cars";
    let countVal = 10;
    if (carsMode === CarsInjectInputMode.regular) {
      service = "inject_regular_cars";
    } else if (carsMode === CarsInjectInputMode.premium || carsMode === CarsInjectInputMode.all) {
      service = "inject_premium_cars";
    } else if (carsMode === CarsInjectInputMode.first50) {
      service = "inject_random_cars";
      countVal = 50;
    } else if (carsMode === CarsInjectInputMode.random10) {
      service = "inject_random_cars";
      countVal = 10;
    } else if (carsMode === CarsInjectInputMode.custom) {
      service = "inject_random_cars";
      countVal = Number(customCarCount) || 10;
    }

    appendLog(`[INJECT] Cars mode: ${carsMode} (${service})`);
    injectCars.mutate({
      data: {
        token: session.token,
        userId: session.carxId,
        deviceId: session.deviceId,
        uniqueId: session.uniqueId,
        service_type: service,
        random_cars_count: countVal,
        userToken,
      },
    });
  };

  const anyPending =
    injectCurrency.isPending ||
    unlockMaps.isPending ||
    unlockClubs.isPending ||
    injectCars.isPending ||
    unlockStreetPass.isPending ||
    unlockProfileStyle.isPending ||
    injectAll.isPending ||
    safeRepair.isPending;

  const CURRENCY_PRESETS = [
    { v: CurrencyInputPreset.max, l: "Max Out", sub: "50M / 9999 / Max XP" },
    { v: CurrencyInputPreset.medium, l: "Medium", sub: "10M / 5K / Safe" },
    { v: CurrencyInputPreset.custom, l: "Custom", sub: "Custom amounts" },
  ];

  const CAR_MODES = [
    { v: CarsInjectInputMode.all, l: "🏎️ All Cars", sub: `${totalCars || 189} Supercars` },
    { v: CarsInjectInputMode.premium, l: "👑 Premium", sub: "Max Tuned Kits" },
    { v: CarsInjectInputMode.regular, l: "🚗 Regular", sub: "Standard Garage" },
    { v: CarsInjectInputMode.custom, l: "🔢 Custom", sub: "Pick count" },
  ];

  return (
    <div className="space-y-6">
      {/* Session Account Status Banner */}
      <div className="bg-zinc-950/85 border border-zinc-800/80 rounded-3xl p-4 sm:p-5 shadow-xl backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-400/30 flex items-center justify-center text-xl shadow-[0_0_15px_rgba(245,158,11,0.2)]">
              🏁
            </div>
            <div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Connected Driver</span>
              </div>
              <div className="text-sm sm:text-base font-bold font-mono text-white truncate max-w-[280px] sm:max-w-md">
                {session.email}
              </div>
              {session.carxId && (
                <div className="text-[10px] font-mono text-zinc-400 mt-0.5">
                  ID: <span className="text-amber-400 font-bold select-all">{session.carxId}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={fetchProfile}
              disabled={loadingProfile}
              className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 font-mono text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingProfile ? "animate-spin text-amber-400" : ""}`} />
              <span>Sync Stats</span>
            </button>
            <button
              onClick={() => {
                playClick();
                onDisconnect();
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-950/30 hover:bg-red-950/60 border border-red-500/30 hover:border-red-400 text-red-300 font-mono text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Disconnect</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live Telemetry Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTelemetryCard
          label="Silver Cash"
          value={profile?.silver !== undefined ? profile.silver : "50,000,000"}
          icon="🪙"
          accent="from-amber-400 to-yellow-500"
          sublabel="Game currency"
        />
        <StatTelemetryCard
          label="Gold Coins"
          value={profile?.gold !== undefined ? profile.gold : "9,999"}
          icon="💎"
          accent="from-yellow-400 to-amber-500"
          sublabel="Premium gold"
        />
        <StatTelemetryCard
          label="Player Level"
          value={profile?.xp !== undefined ? `LVL ${Math.min(50, Math.floor(profile.xp / 2000) + 1)}` : "LVL 50"}
          icon="⚡"
          accent="from-blue-400 to-cyan-500"
          sublabel="XP Progress"
        />
        <StatTelemetryCard
          label="Supercars"
          value={profile?.cars !== undefined ? `${profile.cars} Cars` : `${totalCars || 189} Cars`}
          icon="🏎️"
          accent="from-purple-400 to-pink-500"
          sublabel="Garage count"
        />
      </div>

      {/* Master 1-Click Inject Everything Banner Button */}
      <button
        data-testid="button-inject-all"
        onClick={() => {
          playClick();
          appendLog("[INJECT] Initiating Master Inject Everything sequence...");
          injectAll.mutate({
            data: {
              token: session.token,
              userId: session.carxId,
              deviceId: session.deviceId,
              uniqueId: session.uniqueId,
              service_type: "inject_all",
              userToken,
            },
          });
        }}
        disabled={anyPending}
        className="w-full py-4 sm:py-5 rounded-3xl font-black text-base sm:text-lg tracking-widest uppercase bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 text-black hover:from-amber-400 hover:to-yellow-300 active:scale-[0.99] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_0_35px_rgba(245,158,11,0.35)] hover:shadow-[0_0_50px_rgba(245,158,11,0.55)] cursor-pointer relative overflow-hidden group"
      >
        <div className="absolute inset-0 bg-white/20 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        {injectAll.isPending ? (
          <span className="flex items-center justify-center gap-3">
            <RefreshCw className="w-5 h-5 animate-spin" />
            SYNCHRONIZING SAVE DATA...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-3">
            <Zap className="w-5 h-5 fill-current" />
            INJECT EVERYTHING (1-CLICK MASTER BOOST)
          </span>
        )}
      </button>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-zinc-950/80 border border-zinc-800 rounded-2xl">
        <button
          onClick={() => { playClick(); setActiveTab("quick"); }}
          className={`flex items-center justify-center gap-2 flex-1 py-2 rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === "quick" ? "bg-amber-400 text-black shadow-md" : "text-zinc-400 hover:text-white"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Modules Grid</span>
        </button>
        <button
          onClick={() => { playClick(); setActiveTab("custom"); }}
          className={`flex items-center justify-center gap-2 flex-1 py-2 rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === "custom" ? "bg-amber-400 text-black shadow-md" : "text-zinc-400 hover:text-white"
          }`}
        >
          <Wrench className="w-3.5 h-3.5" />
          <span>Custom Sliders</span>
        </button>
        <button
          onClick={() => { playClick(); setActiveTab("logs"); }}
          className={`flex items-center justify-center gap-2 flex-1 py-2 rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === "logs" ? "bg-amber-400 text-black shadow-md" : "text-zinc-400 hover:text-white"
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Live Terminal ({logs.length})</span>
        </button>
      </div>

      {activeTab === "logs" ? (
        <TerminalConsole logs={logs} title="CARX TELEMETRY LIVE TERMINAL" />
      ) : activeTab === "custom" ? (
        <div className="bg-zinc-950/85 border border-zinc-800/80 rounded-3xl p-6 space-y-6 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3">
            <DollarSign className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold font-sans text-white uppercase tracking-wider">
              Custom Currency & XP Configurator
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <NumInput label="Custom Silver Cash" value={customSilver} onChange={setCustomSilver} min={0} max={999999999} placeholder="50000000" icon="🪙" accent="text-zinc-300" />
            <NumInput label="Custom Gold Coins" value={customGold} onChange={setCustomGold} min={0} max={99999} placeholder="9999" icon="💰" accent="text-yellow-400" />
            <NumInput label="Custom XP Points" value={customXp} onChange={setCustomXp} min={0} max={99999999} placeholder="93060" icon="⚡" accent="text-blue-400" />
          </div>

          <button
            onClick={handleInjectCurrency}
            disabled={anyPending}
            className="w-full py-3.5 rounded-2xl font-bold text-sm tracking-widest uppercase bg-amber-400 text-black hover:bg-amber-300 disabled:opacity-40 transition-all shadow-[0_0_20px_rgba(245,158,11,0.2)] cursor-pointer font-mono"
          >
            {injectCurrency.isPending ? "Injecting Custom Resources..." : "Apply Custom Values"}
          </button>
        </div>
      ) : (
        /* Modular Injection Cards Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card 1: Currency */}
          <div className="bg-zinc-950/85 border border-zinc-800/80 rounded-3xl p-5 space-y-3.5 shadow-xl backdrop-blur-xl hover:border-zinc-700 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white font-sans uppercase">Currency & XP</h3>
                  <p className="text-[10px] text-zinc-500 font-mono">50M Silver + 9,999 Gold</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {CURRENCY_PRESETS.map(({ v, l, sub }) => (
                <button
                  key={v}
                  onClick={() => {
                    playClick();
                    setCurrencyPreset(v);
                  }}
                  className={`flex flex-col items-center py-2 px-1.5 rounded-xl text-center transition-all border cursor-pointer ${
                    currencyPreset === v
                      ? "bg-amber-400 border-amber-400 text-black font-bold shadow-md"
                      : "bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  <span className="text-xs font-bold font-mono">{l}</span>
                  <span className={`text-[9px] mt-0.5 font-mono ${currencyPreset === v ? "text-black/70" : "text-zinc-600"}`}>{sub}</span>
                </button>
              ))}
            </div>

            <button
              data-testid="button-inject-currency"
              onClick={handleInjectCurrency}
              disabled={anyPending}
              className="w-full py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-amber-300 hover:text-white font-bold text-xs font-mono uppercase tracking-wider transition-all disabled:opacity-30 cursor-pointer"
            >
              {injectCurrency.isPending ? "Injecting..." : "Inject Currency"}
            </button>
            {results.currency && (
              <div className={`flex items-center gap-1.5 text-xs font-mono ${results.currency.ok ? "text-emerald-400" : "text-red-400"}`}>
                {results.currency.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                <span>{results.currency.msg}</span>
              </div>
            )}
          </div>

          {/* Card 2: Clubs & Houses */}
          <div className="bg-zinc-950/85 border border-zinc-800/80 rounded-3xl p-5 space-y-3.5 shadow-xl backdrop-blur-xl hover:border-zinc-700 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                  <Trophy className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white font-sans uppercase">Clubs & Houses</h3>
                  <p className="text-[10px] text-zinc-500 font-mono">Unlock 22 Clubs & 52 Houses</p>
                </div>
              </div>
            </div>

            <p className="text-xs text-zinc-400 font-mono leading-relaxed">
              Auto-completes all street racing clubs with boss badges and unlocks all safe houses.
            </p>

            <button
              data-testid="button-unlock-clubs"
              onClick={() => {
                playClick();
                appendLog("[INJECT] Unlocking clubs and safehouses...");
                unlockClubs.mutate({
                  data: {
                    token: session.token,
                    userId: session.carxId,
                    deviceId: session.deviceId,
                    uniqueId: session.uniqueId,
                    service_type: "unlock_clubs",
                    unlock_houses: true,
                    userToken,
                  },
                });
              }}
              disabled={anyPending}
              className="w-full py-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/30 text-purple-300 hover:text-white font-bold text-xs font-mono uppercase tracking-wider transition-all disabled:opacity-30 cursor-pointer"
            >
              {unlockClubs.isPending ? "Unlocking..." : "Unlock Clubs & Houses"}
            </button>
            {results.clubs && (
              <div className={`flex items-center gap-1.5 text-xs font-mono ${results.clubs.ok ? "text-emerald-400" : "text-red-400"}`}>
                {results.clubs.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                <span>{results.clubs.msg}</span>
              </div>
            )}
          </div>

          {/* Card 3: Cars */}
          <div className="bg-zinc-950/85 border border-zinc-800/80 rounded-3xl p-5 space-y-3.5 shadow-xl backdrop-blur-xl hover:border-zinc-700 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <Car className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white font-sans uppercase">Supercars Garage</h3>
                  <p className="text-[10px] text-zinc-500 font-mono">{totalCars ? `${totalCars} Tuned Vehicles` : "Full Garage Sync"}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {CAR_MODES.map(({ v, l, sub }) => (
                <button
                  key={v}
                  onClick={() => {
                    playClick();
                    setCarsMode(v);
                  }}
                  className={`flex flex-col items-center py-2 px-1.5 rounded-xl text-center transition-all border cursor-pointer ${
                    carsMode === v
                      ? "bg-cyan-400 border-cyan-400 text-black font-bold shadow-md"
                      : "bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  <span className="text-xs font-bold font-mono">{l}</span>
                  <span className={`text-[9px] mt-0.5 font-mono ${carsMode === v ? "text-black/70" : "text-zinc-600"}`}>{sub}</span>
                </button>
              ))}
            </div>

            <button
              data-testid="button-inject-cars"
              onClick={handleInjectCars}
              disabled={anyPending}
              className="w-full py-2.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/30 text-cyan-300 hover:text-white font-bold text-xs font-mono uppercase tracking-wider transition-all disabled:opacity-30 cursor-pointer"
            >
              {injectCars.isPending ? "Injecting Vehicles..." : "Inject Cars Garage"}
            </button>
            {results.cars && (
              <div className={`flex items-center gap-1.5 text-xs font-mono ${results.cars.ok ? "text-emerald-400" : "text-red-400"}`}>
                {results.cars.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                <span>{results.cars.msg}</span>
              </div>
            )}
          </div>

          {/* Card 4: Street Pass */}
          <div className="bg-zinc-950/85 border border-zinc-800/80 rounded-3xl p-5 space-y-3.5 shadow-xl backdrop-blur-xl hover:border-zinc-700 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">
                  <Star className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white font-sans uppercase">Street Pass VIP</h3>
                  <p className="text-[10px] text-zinc-500 font-mono">Unlock Premium Rewards</p>
                </div>
              </div>
            </div>

            <p className="text-xs text-zinc-400 font-mono leading-relaxed">
              Unlocks battle pass track, exclusive liveries, EP boost points, and premium seasonal items.
            </p>

            <button
              data-testid="button-unlock-streetpass"
              onClick={() => {
                playClick();
                appendLog("[INJECT] Activating Street Pass VIP...");
                unlockStreetPass.mutate({
                  data: {
                    token: session.token,
                    userId: session.carxId,
                    deviceId: session.deviceId,
                    uniqueId: session.uniqueId,
                    service_type: "battlepass",
                    unlock_streetpass: true,
                    userToken,
                  },
                });
              }}
              disabled={anyPending}
              className="w-full py-2.5 rounded-xl bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-400/30 text-yellow-300 hover:text-white font-bold text-xs font-mono uppercase tracking-wider transition-all disabled:opacity-30 cursor-pointer"
            >
              {unlockStreetPass.isPending ? "Unlocking..." : "Unlock Street Pass"}
            </button>
            {results.streetPass && (
              <div className={`flex items-center gap-1.5 text-xs font-mono ${results.streetPass.ok ? "text-emerald-400" : "text-red-400"}`}>
                {results.streetPass.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                <span>{results.streetPass.msg}</span>
              </div>
            )}
          </div>

          {/* Card 5: Avatars & Style */}
          <div className="bg-zinc-950/85 border border-zinc-800/80 rounded-3xl p-5 space-y-3.5 shadow-xl backdrop-blur-xl hover:border-zinc-700 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white font-sans uppercase">Avatars & Frames</h3>
                  <p className="text-[10px] text-zinc-500 font-mono">16 Profile Styles</p>
                </div>
              </div>
            </div>

            <p className="text-xs text-zinc-400 font-mono leading-relaxed">
              Unlock all 16 custom profile avatars, background card banners, and neon driver frames.
            </p>

            <button
              data-testid="button-unlock-avatars"
              onClick={() => {
                playClick();
                appendLog("[INJECT] Unlocking profile avatars and styles...");
                unlockProfileStyle.mutate({
                  data: {
                    token: session.token,
                    userId: session.carxId,
                    deviceId: session.deviceId,
                    uniqueId: session.uniqueId,
                    service_type: "unlock_profile_style",
                    avatar: "avatar_16",
                    banner: "banner_16",
                    frame: "frame_16",
                    userToken,
                  },
                });
              }}
              disabled={anyPending}
              className="w-full py-2.5 rounded-xl bg-pink-500/15 hover:bg-pink-500/25 border border-pink-400/30 text-pink-300 hover:text-white font-bold text-xs font-mono uppercase tracking-wider transition-all disabled:opacity-30 cursor-pointer"
            >
              {unlockProfileStyle.isPending ? "Unlocking..." : "Unlock Avatars & Frames"}
            </button>
            {results.profileStyle && (
              <div className={`flex items-center gap-1.5 text-xs font-mono ${results.profileStyle.ok ? "text-emerald-400" : "text-red-400"}`}>
                {results.profileStyle.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                <span>{results.profileStyle.msg}</span>
              </div>
            )}
          </div>

          {/* Card 6: Safe Anti-Ban Repair */}
          <div className="bg-zinc-950/85 border border-zinc-800/80 rounded-3xl p-5 space-y-3.5 shadow-xl backdrop-blur-xl hover:border-zinc-700 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white font-sans uppercase">Safe Sync Repair</h3>
                  <p className="text-[10px] text-zinc-500 font-mono">Fix Stuck Loading</p>
                </div>
              </div>
            </div>

            <p className="text-xs text-zinc-400 font-mono leading-relaxed">
              Fixes "Checking profile" endless loop and rebuilds clean save data database tables.
            </p>

            <button
              data-testid="button-safe-repair"
              onClick={() => {
                playClick();
                if (
                  window.confirm(
                    "🩹 WARNING: This will reset garage to 1 starting car, beat all clubs, and repair all slot tables to valid game database values. Proceed?"
                  )
                ) {
                  appendLog("[REPAIR] Safe repair executed...");
                  safeRepair.mutate({
                    data: {
                      token: session.token,
                      userId: session.carxId,
                      deviceId: session.deviceId,
                      uniqueId: session.uniqueId,
                      service_type: "safe_repair",
                      userToken,
                    },
                  });
                }
              }}
              disabled={anyPending}
              className="w-full py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/30 text-emerald-300 hover:text-white font-bold text-xs font-mono uppercase tracking-wider transition-all disabled:opacity-30 cursor-pointer"
            >
              {safeRepair.isPending ? "Repairing..." : "Safe Repair & Anti-Stuck"}
            </button>
            {results.safeRepair && (
              <div className={`flex items-center gap-1.5 text-xs font-mono ${results.safeRepair.ok ? "text-emerald-400" : "text-red-400"}`}>
                {results.safeRepair.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                <span>{results.safeRepair.msg}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function InjectSite({
  adminOverrideToken,
  hideHeader,
}: { adminOverrideToken?: string; hideHeader?: boolean } = {}) {
  const { token, clearAuth } = useAuth();
  const [soundOn, setSoundOn] = useState(true);
  const [session, setSession] = useState<CarXSession | null>(() => {
    try {
      const saved = localStorage.getItem("connectedCarXSession");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    setSoundOn(isSoundEnabled());
  }, []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playClick();
  };

  const handleSetSession = (s: CarXSession | null) => {
    setSession(s);
    try {
      if (s) {
        localStorage.setItem("connectedCarXSession", JSON.stringify(s));
      } else {
        localStorage.removeItem("connectedCarXSession");
      }
    } catch {}
  };

  const userToken = adminOverrideToken || token || "";

  return (
    <div className={hideHeader ? "w-full" : "min-h-screen bg-[#030308] text-white selection:bg-amber-400 selection:text-black"}>
      {!hideHeader && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-3xl" />
          <div className="absolute top-1/3 -left-40 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 right-1/4 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,rgba(3,3,8,0.7)_80%)]" />
        </div>
      )}

      <div className={`relative z-10 max-w-4xl mx-auto ${hideHeader ? "py-2" : "px-4 sm:px-6 py-6 sm:py-8"} space-y-6`}>
        {!hideHeader && (
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/25 to-amber-600/10 border border-amber-400/40 flex items-center justify-center text-xl shadow-[0_0_20px_rgba(245,158,11,0.25)]">
                🏎️
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight font-sans uppercase">
                  <span className="text-white">MYANMAR </span>
                  <span className="bg-gradient-to-r from-amber-400 to-yellow-400 bg-clip-text text-transparent">
                    ᴄᴀʀ𝕏 sᴛʀᴇᴇᴛ
                  </span>
                </h1>
                <p className="text-[11px] font-mono text-zinc-400">VIP Save Injection Engine v1.2</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleSound}
                className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-400 hover:text-white transition-all cursor-pointer"
                title={soundOn ? "SFX On" : "SFX Muted"}
              >
                {soundOn ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4 text-zinc-500" />}
              </button>
              <button
                data-testid="button-logout"
                onClick={() => {
                  playClick();
                  setSession(null);
                  clearAuth();
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900/80 hover:bg-red-950/40 border border-zinc-700/80 hover:border-red-500/40 text-zinc-400 hover:text-red-400 transition-all text-xs font-mono cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        )}

        {/* Dashboard Promotional Visual Banner */}
        <DashboardBanner />

        {/* Dynamic State View */}
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {!session ? (
              <motion.div
                key="login"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
              >
                <LoginForm userToken={userToken} onSuccess={handleSetSession} />
              </motion.div>
            ) : (
              <motion.div
                key="injection"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
              >
                <InjectionPanel
                  session={session}
                  userToken={userToken}
                  onDisconnect={() => handleSetSession(null)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
