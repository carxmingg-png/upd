import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListKeys,
  useGenerateKey,
  useRevokeKey,
  useGetStrings,
  useUpdateStrings,
  useGetCars,
  getListKeysQueryKey,
  getGetStringsQueryKey,
  getGetCarsQueryKey,
} from "@/lib/api-client";
import { GenerateKeyInputDuration } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import InjectSite from "@/pages/inject-site";
import {
  Key, Plus, Trash2, LogOut, Car, FileText, Copy, Check,
  Upload, RefreshCw, Clock, Infinity, Calendar, ChevronDown, ChevronUp, Search, Zap
} from "lucide-react";

const TABS = [
  { id: "keys", label: "Keys", icon: Key },
  { id: "injector", label: "Account Injector & Batch", icon: Zap },
  { id: "cars", label: "Cars", icon: Car },
];

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all text-xs"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      {label || (copied ? "Copied!" : "Copy")}
    </button>
  );
}

const ALL_FEATURES = [
  { id: "cash_gold", label: "💵 Cash & Gold" },
  { id: "level_xp", label: "⚡ Level / XP" },
  { id: "unlock_clubs", label: "🏆 Unlock Clubs" },
  { id: "get_all_cars", label: "🚗 All Cars" },
  { id: "safe_repair", label: "🩹 Safe Repair" },
  { id: "battlepass", label: "🎟 Street Pass" },
  { id: "streetpass_ep", label: "🎖 EP Points" },
  { id: "bulk_generate", label: "👥 Bulk Generate" },
  { id: "premium", label: "👑 Premium" },
];

const DURATION_OPTIONS = [
  { label: "1 Day", val: 1, unit: "d" },
  { label: "7 Days", val: 7, unit: "d" },
  { label: "30 Days", val: 30, unit: "d" },
  { label: "Lifetime", val: null, unit: "unlim" },
];

function KeysTab({ adminToken }: { adminToken: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Generate key form state
  const [durationIdx, setDurationIdx] = useState(0);
  const [credits, setCredits] = useState(50);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(ALL_FEATURES.map(f => f.id));
  const [customKey, setCustomKey] = useState("");

  const keysQuery = useListKeys({ adminToken });
  const generateKey = useGenerateKey({
    mutation: {
      onSuccess: (data: any) => {
        toast({ title: "✅ Key Generated", description: data.key });
        qc.invalidateQueries({ queryKey: getListKeysQueryKey() });
        setCustomKey("");
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.message || err?.response?.data?.error || "Failed to generate key";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });
  const revokeKey = useRevokeKey({
    mutation: {
      onSuccess: () => {
        toast({ title: "Key Revoked" });
        qc.invalidateQueries({ queryKey: getListKeysQueryKey() });
      },
      onError: () => toast({ title: "Error", description: "Failed to revoke key", variant: "destructive" }),
    },
  });

  const keys = keysQuery.data || [];
  const filtered = keys.filter((k: any) => !search || k.key.includes(search.toUpperCase()));

  const handleGenerate = () => {
    const dur = DURATION_OPTIONS[durationIdx];
    generateKey.mutate({
      data: {
        adminToken,
        type: "user",
        duration_val: dur.val,
        duration_unit: dur.unit,
        credits,
        enabled_features: selectedFeatures,
        custom_key: customKey.trim() || null,
      }
    });
  };

  const toggleFeature = (id: string) => {
    setSelectedFeatures(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      {/* Generate Key Form */}
      <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-4 space-y-4">
        <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Generate New Key</div>

        {/* Duration */}
        <div>
          <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1.5 block">Duration</label>
          <div className="flex gap-2 flex-wrap">
            {DURATION_OPTIONS.map((d, i) => (
              <button
                key={d.label}
                onClick={() => setDurationIdx(i)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  durationIdx === i ? "bg-amber-500 text-black" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Credits + Custom Key */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1.5 block">Credits</label>
            <input
              type="number"
              min={1}
              value={credits}
              onChange={(e) => setCredits(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full bg-zinc-800/80 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500/60 transition-all"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1.5 block">Custom Key Name (optional)</label>
            <input
              type="text"
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value)}
              placeholder="e.g. MYKEY-001"
              className="w-full bg-zinc-800/80 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500/60 transition-all placeholder:text-zinc-600"
            />
          </div>
        </div>

        {/* Features */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Features</label>
            <div className="flex gap-2">
              <button onClick={() => setSelectedFeatures(ALL_FEATURES.map(f => f.id))} className="text-[10px] text-amber-500 hover:text-amber-400 font-mono">All</button>
              <button onClick={() => setSelectedFeatures([])} className="text-[10px] text-zinc-500 hover:text-zinc-400 font-mono">None</button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {ALL_FEATURES.map(f => (
              <label key={f.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-all border ${
                selectedFeatures.includes(f.id)
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-300"
                  : "bg-zinc-800/60 border-zinc-700/40 text-zinc-500 hover:border-zinc-600"
              }`}>
                <input
                  type="checkbox"
                  checked={selectedFeatures.includes(f.id)}
                  onChange={() => toggleFeature(f.id)}
                  className="accent-amber-500 w-3 h-3"
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        <button
          data-testid="button-generate-key"
          onClick={handleGenerate}
          disabled={generateKey.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all disabled:opacity-50 w-full justify-center"
        >
          <Plus className="w-3.5 h-3.5" />
          {generateKey.isPending ? "Generating..." : "Generate Key"}
        </button>
      </div>

      {/* Search + Key List */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search keys..."
            className="pl-8 pr-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 w-full"
          />
        </div>
        <button
        onClick={() => qc.invalidateQueries({ queryKey: getListKeysQueryKey() })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 text-xs transition-all"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      <div className="space-y-2">
        {keysQuery.isLoading && (
          <div className="flex items-center justify-center py-8 text-zinc-500 text-sm">Loading keys...</div>
        )}
        {filtered.length === 0 && !keysQuery.isLoading && (
          <div className="flex items-center justify-center py-8 text-zinc-600 text-sm">No keys found</div>
        )}
        {filtered.map((k: any) => (
          <motion.div
            key={k.key}
            layout
            className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <div className={`w-2 h-2 rounded-full ${k.used ? "bg-red-400" : "bg-green-400"}`} />
              <span className="font-mono text-xs text-white flex-1 tracking-widest truncate">{k.key}</span>
              {k.credits !== undefined && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-mono">{k.credits} cr</span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                (k.duration_unit === "unlim" || !k.duration_unit) ? "bg-purple-500/20 text-purple-300" :
                k.duration_unit === "d" && k.duration_val >= 30 ? "bg-blue-500/20 text-blue-300" :
                "bg-zinc-700/60 text-zinc-400"
              }`}>
                {k.duration_unit === "unlim" ? "Lifetime" : k.duration_val ? `${k.duration_val}${k.duration_unit}` : k.duration || "—"}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${k.used ? "bg-red-500/20 text-red-300" : "bg-green-500/20 text-green-300"}`}>
                {k.used ? "Used" : "Available"}
              </span>
              <CopyButton text={k.key} />
              <button
                onClick={() => setExpandedKey(expandedKey === k.key ? null : k.key)}
                className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {expandedKey === k.key ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <button
                data-testid={`button-revoke-${k.key}`}
                onClick={() => revokeKey.mutate({ data: { adminToken, key: k.key } })}
                disabled={revokeKey.isPending}
                className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <AnimatePresence>
              {expandedKey === k.key && (
                <motion.div
                  initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                  className="overflow-hidden border-t border-zinc-800/60"
                >
                  <div className="px-4 py-3 space-y-2 text-xs text-zinc-500">
                    <div className="grid grid-cols-2 gap-2">
                      <span>Created: {k.created_at ? new Date(k.created_at * 1000).toLocaleString() : k.createdAt ? new Date(k.createdAt).toLocaleString() : "—"}</span>
                      <span>Expires: {k.expires_at ? new Date(k.expires_at * 1000).toLocaleString() : "Never"}</span>
                    </div>
                    {k.enabled_features && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(k.enabled_features as string[]).map(f => (
                          <span key={f} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono text-[10px]">{f}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      <div className="text-xs text-zinc-600 text-right">{keys.length} keys total</div>
    </div>
  );
}

function StringsTab({ adminToken }: { adminToken: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const carsFileRef = useRef<HTMLInputElement>(null);
  const bpFileRef = useRef<HTMLInputElement>(null);

  const [carsValue, setCarsValue] = useState("");
  const [bpValue, setBpValue] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [carsDirty, setCarsDirty] = useState(false);
  const [bpDirty, setBpDirty] = useState(false);

  const stringsQuery = useGetStrings({ adminToken }, { query: { queryKey: getGetStringsQueryKey({ adminToken }) } });

  useEffect(() => {
    if (stringsQuery.data && !initialized) {
      setCarsValue(stringsQuery.data.carsString || "");
      setBpValue(stringsQuery.data.blueprintString || "");
      setInitialized(true);
    }
  }, [stringsQuery.data, initialized]);

  const updateStrings = useUpdateStrings({
    mutation: {
      onSuccess: (_data, variables) => {
        toast({ title: "✅ Saved", description: "Strings updated on server" });
        const v = variables.data;
        if (v.carsString !== null && v.carsString !== undefined) setCarsDirty(false);
        if (v.blueprintString !== null && v.blueprintString !== undefined) setBpDirty(false);
        qc.invalidateQueries({ queryKey: getGetStringsQueryKey({ adminToken }) });
        qc.invalidateQueries({ queryKey: getGetCarsQueryKey() });
      },
      onError: (err) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: "Error", description: msg || "Failed to update strings", variant: "destructive" });
      },
    },
  });

  const handleFileRead = (file: File, setter: (v: string) => void, dirtyFn: (v: boolean) => void) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const content = String(e.target.result).trim();
        setter(content);
        dirtyFn(true);
        toast({ title: "📂 File loaded", description: `${content.length.toLocaleString()} characters ready — click Save to apply` });
      }
    };
    reader.readAsText(file);
  };

  const handleSave = (which: "cars" | "blueprint" | "both") => {
    const carsString = which !== "blueprint" ? carsValue : null;
    const blueprintString = which !== "cars" ? bpValue : null;
    updateStrings.mutate({ data: { adminToken, carsString, blueprintString } });
  };

  const strings = stringsQuery.data;

  return (
    <div className="space-y-6">
      {stringsQuery.isLoading && <div className="text-zinc-500 text-sm text-center py-8">Loading strings...</div>}

      {/* Cars String */}
      <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              COMPRESSED_CARS_STRING
              {carsDirty && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold">Unsaved</span>}
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {carsValue ? `${carsValue.length.toLocaleString()} characters` : "Not set"}
              {strings?.carsString && carsValue !== strings.carsString && (
                <span className="ml-2 text-amber-400">(changed from {strings.carsString.length.toLocaleString()})</span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => carsFileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-all"
            >
              <Upload className="w-3.5 h-3.5" />Upload File
            </button>
            <input
              ref={carsFileRef}
              type="file"
              accept=".txt"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileRead(e.target.files[0], setCarsValue, setCarsDirty);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => handleSave("cars")}
              disabled={updateStrings.isPending || !carsValue}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black rounded-lg text-xs font-bold transition-all disabled:opacity-50"
            >
              {updateStrings.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
              Save
            </button>
          </div>
        </div>
        <textarea
          value={carsValue}
          onChange={(e) => { setCarsValue(e.target.value); setCarsDirty(true); }}
          placeholder="Paste COMPRESSED_CARS_STRING here or upload a .txt file..."
          rows={5}
          className="w-full bg-zinc-800/60 border border-zinc-700/40 rounded-lg px-3 py-2 text-xs font-mono text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/40 resize-y"
        />
      </div>

      {/* Blueprint String */}
      <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              COMPRESSED_STRING (Blueprint)
              {bpDirty && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold">Unsaved</span>}
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {bpValue ? `${bpValue.length.toLocaleString()} characters` : "Not set"}
              {strings?.blueprintString && bpValue !== strings.blueprintString && (
                <span className="ml-2 text-amber-400">(changed from {strings.blueprintString.length.toLocaleString()})</span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => bpFileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-all"
            >
              <Upload className="w-3.5 h-3.5" />Upload File
            </button>
            <input
              ref={bpFileRef}
              type="file"
              accept=".txt"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileRead(e.target.files[0], setBpValue, setBpDirty);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => handleSave("blueprint")}
              disabled={updateStrings.isPending || !bpValue}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black rounded-lg text-xs font-bold transition-all disabled:opacity-50"
            >
              {updateStrings.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
              Save
            </button>
          </div>
        </div>
        <textarea
          value={bpValue}
          onChange={(e) => { setBpValue(e.target.value); setBpDirty(true); }}
          placeholder="Paste COMPRESSED_STRING here or upload a .txt file..."
          rows={5}
          className="w-full bg-zinc-800/60 border border-zinc-700/40 rounded-lg px-3 py-2 text-xs font-mono text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/40 resize-y"
        />
      </div>

      {strings?.updatedAt && (
        <p className="text-xs text-zinc-600 text-right">Server last updated: {new Date(strings.updatedAt).toLocaleString()}</p>
      )}
    </div>
  );
}

function CarsTab({ adminToken }: { adminToken: string }) {
  const [search, setSearch] = useState("");
  const carsQuery = useGetCars({ userToken: adminToken }, { query: { queryKey: getGetCarsQueryKey({ userToken: adminToken }) } });
  const cars = carsQuery.data?.cars || [];
  const filtered = cars.filter((c) => !search || c.descId.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search car ID..."
            className="w-full pl-9 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
          />
        </div>
        <button
          onClick={() => carsQuery.refetch()}
          className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${carsQuery.isFetching ? "animate-spin" : ""}`} />
        </button>
        <span className="text-xs text-zinc-500 whitespace-nowrap">{cars.length} cars</span>
      </div>

      {carsQuery.isLoading && <div className="text-center py-8 text-zinc-500 text-sm">Loading cars...</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[500px] overflow-y-auto pr-1">
        {filtered.slice(0, 200).map((car) => (
          <div key={car.id} className="bg-zinc-900/60 border border-zinc-800/40 rounded-xl px-3 py-2.5 flex items-center gap-3">
            <span className="text-2xl">🚗</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono text-white truncate">{car.descId}</p>
              <p className="text-xs text-zinc-600">ID: {car.id}</p>
            </div>
          </div>
        ))}
        {filtered.length > 200 && (
          <div className="col-span-2 text-center py-2 text-xs text-zinc-600">Showing first 200 of {filtered.length}</div>
        )}
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const { token, clearAuth } = useAuth();
  const [tab, setTab] = useState("keys");
  const adminToken = token || "";

  return (
    <div className="min-h-screen bg-[#050508]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-black text-white">
              <span className="text-amber-400">Admin</span> Panel
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">Myanmar ᴄᴀʀ𝕏 sᴛʀᴇᴇᴛ — Management Console</p>
          </div>
          <button
            data-testid="button-logout"
            onClick={clearAuth}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-500/30 transition-all text-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>

        <div className="flex gap-1 p-1 bg-zinc-900/60 border border-zinc-800/60 rounded-xl mb-6">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              data-testid={`tab-${id}`}
              className={`flex items-center gap-2 flex-1 justify-center px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === id ? "bg-amber-500 text-black shadow-lg" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {tab === "keys" && <KeysTab adminToken={adminToken} />}
            {tab === "injector" && <InjectSite adminOverrideToken={adminToken} hideHeader />}
            {tab === "cars" && <CarsTab adminToken={adminToken} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
