import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListKeys,
  useGenerateKey,
  useRevokeKey,
  useGetStrings,
  useUpdateStrings,
  useGetCars,
  useExtractAccount,
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
  Upload, RefreshCw, Clock, Infinity, Calendar, ChevronDown, ChevronUp, Search, Zap, Download, ShieldCheck, Sparkles
} from "lucide-react";

import { playClick, playSuccess, playError } from "@/lib/sound";

const TABS = [
  { id: "keys", label: "Keys", icon: Key },
  { id: "injector", label: "Account Injector & Batch", icon: Zap },
  { id: "strings", label: "Car Strings Config", icon: FileText },
  { id: "cars", label: "Cars", icon: Car },
];

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    playClick();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all text-xs font-mono cursor-pointer"
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
        playSuccess();
        toast({ title: "✅ Key Generated", description: data.key });
        qc.invalidateQueries({ queryKey: getListKeysQueryKey() });
        setCustomKey("");
      },
      onError: (err: any) => {
        playError();
        const msg = err?.response?.data?.message || err?.response?.data?.error || "Failed to generate key";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });
  const revokeKey = useRevokeKey({
    mutation: {
      onSuccess: () => {
        playSuccess();
        toast({ title: "Key Revoked" });
        qc.invalidateQueries({ queryKey: getListKeysQueryKey() });
      },
      onError: () => {
        playError();
        toast({ title: "Error", description: "Failed to revoke key", variant: "destructive" });
      },
    },
  });

  const keys = keysQuery.data || [];
  const filtered = keys.filter((k: any) => !search || k.key.includes(search.toUpperCase()));
  const activeKeysCount = keys.filter((k: any) => !k.used).length;
  const usedKeysCount = keys.filter((k: any) => k.used).length;

  const handleGenerate = () => {
    playClick();
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
    playClick();
    setSelectedFeatures(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-zinc-950/85 border border-zinc-800/80 rounded-2xl p-3.5 backdrop-blur-xl">
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Total Keys</div>
          <div className="text-xl font-bold font-mono text-white mt-0.5">{keys.length}</div>
        </div>
        <div className="bg-zinc-950/85 border border-zinc-800/80 rounded-2xl p-3.5 backdrop-blur-xl">
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Available</div>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">{activeKeysCount}</div>
        </div>
        <div className="bg-zinc-950/85 border border-zinc-800/80 rounded-2xl p-3.5 backdrop-blur-xl">
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Used / Expired</div>
          <div className="text-xl font-bold font-mono text-zinc-400 mt-0.5">{usedKeysCount}</div>
        </div>
        <div className="bg-zinc-950/85 border border-zinc-800/80 rounded-2xl p-3.5 backdrop-blur-xl">
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Fleet Status</div>
          <div className="text-xl font-bold font-mono text-amber-400 mt-0.5">Active ⚡</div>
        </div>
      </div>
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

interface StringEditorCardProps {
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  icon: string;
  value: string;
  originalValue: string;
  onChange: (val: string) => void;
  onSave: () => void;
  isSaving: boolean;
  isDirty: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  maxMB?: number;
}

function StringEditorCard({
  title,
  subtitle,
  badge,
  badgeColor,
  icon,
  value,
  originalValue,
  onChange,
  onSave,
  isSaving,
  isDirty,
  fileInputRef,
  onFileSelect,
  placeholder,
  maxMB = 10
}: StringEditorCardProps) {
  const byteLength = new Blob([value]).size;
  const sizeMB = byteLength / (1024 * 1024);
  const percentUsed = Math.min(100, (sizeMB / maxMB) * 100);
  const isOverLimit = sizeMB > maxMB;

  return (
    <div className={`bg-zinc-900/70 border rounded-2xl p-5 space-y-4 transition-all ${
      isDirty ? "border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.08)]" : "border-zinc-800/80"
    }`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl p-2 rounded-xl bg-zinc-800/80 border border-zinc-700/60">{icon}</span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white tracking-wide">{title}</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold border ${badgeColor}`}>
                {badge}
              </span>
              {isDirty && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold animate-pulse">
                  Unsaved Changes
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <input
            ref={fileInputRef as any}
            type="file"
            accept=".txt,.json,.dat"
            className="hidden"
            onChange={onFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white rounded-xl text-xs font-semibold transition-all"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload File
          </button>
          <CopyButton text={value} label="Copy String" />
          {value ? (
            <button
              onClick={() => onChange("")}
              className="px-2.5 py-1.5 bg-zinc-800/60 hover:bg-red-950/40 text-zinc-400 hover:text-red-400 border border-zinc-700/60 hover:border-red-500/40 rounded-xl text-xs transition-all"
              title="Clear / Revert to Default"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : null}
          <button
            onClick={onSave}
            disabled={isSaving || (!isDirty && value === originalValue)}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-black rounded-xl text-xs transition-all disabled:opacity-40 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
          >
            {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>

      {/* Capacity & Size Meter */}
      <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <span>📊 Payload Size:</span>
            <span className={`font-bold ${isOverLimit ? "text-red-400" : sizeMB > 8 ? "text-amber-400" : "text-emerald-400"}`}>
              {formatBytes(byteLength)}
            </span>
            <span className="text-zinc-600">/ {maxMB} MB Max</span>
          </span>
          <span className="text-zinc-500">
            {value ? `${value.length.toLocaleString()} characters` : "Empty string"}
          </span>
        </div>

        <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isOverLimit ? "bg-red-500" : sizeMB > 8 ? "bg-amber-500" : "bg-emerald-500"
            }`}
            style={{ width: `${percentUsed}%` }}
          />
        </div>
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || `Paste ${title} here or upload a file (up to ${maxMB} MB)...`}
        rows={6}
        className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 text-xs font-mono text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 resize-y transition-all leading-relaxed"
      />
    </div>
  );
}

function AccountExtractorForm({
  adminToken,
  onExtracted,
}: {
  adminToken: string;
  onExtracted: (str: string, targetSlot: "regular" | "premium" | "blueprint") => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [format, setFormat] = useState<"compressed" | "json">("compressed");
  const [targetSlot, setTargetSlot] = useState<"regular" | "premium" | "blueprint">("premium");
  const [extractedData, setExtractedData] = useState<{
    carsCount: number;
    rawStr: string;
    stats?: any;
  } | null>(null);

  const extractMutation = useExtractAccount({
    mutation: {
      onSuccess: (data: any) => {
        playSuccess();
        const rawStr = data.extractedString || JSON.stringify(data.rawProfile || {});
        setExtractedData({
          carsCount: data.totalCars || 0,
          rawStr,
          stats: data.stats,
        });
        toast({
          title: "🎉 Account Profile Extracted!",
          description: `Found ${data.totalCars || 0} cars in account garage.`,
        });
      },
      onError: (err: any) => {
        playError();
        const msg =
          err?.response?.data?.message || err?.message || "Failed to extract account profile";
        toast({
          title: "Extraction Error",
          description: msg,
          variant: "destructive",
        });
      },
    },
  });

  const handleExtract = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Validation Error", description: "Email and password are required", variant: "destructive" });
      return;
    }
    playClick();
    extractMutation.mutate({
      data: {
        email: email.trim(),
        password: password.trim(),
        format,
        target: targetSlot === "blueprint" ? "full" : "cars",
        adminToken,
      },
    });
  };

  const handleApplyToSlot = () => {
    if (!extractedData?.rawStr) return;
    playSuccess();
    onExtracted(extractedData.rawStr, targetSlot);
  };

  return (
    <div className="mt-4 space-y-4">
      <form onSubmit={handleExtract} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
            CarX Account Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="driver@example.com"
            className="w-full px-3 py-2 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        <div>
          <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
            Account Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        <div>
          <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
            Target Config Slot
          </label>
          <select
            value={targetSlot}
            onChange={(e) => setTargetSlot(e.target.value as any)}
            className="w-full px-3 py-2 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-amber-500/50"
          >
            <option value="premium">👑 Premium Cars String</option>
            <option value="regular">🚗 Regular Cars String</option>
            <option value="blueprint">📄 Blueprint String</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={extractMutation.isPending}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-black font-black rounded-xl text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(245,158,11,0.25)] h-[38px]"
        >
          {extractMutation.isPending ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Extracting...</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              <span>Extract Strings</span>
            </>
          )}
        </button>
      </form>

      {/* Extracted preview banner */}
      {extractedData && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
              ✓
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-300">
                Successfully extracted {extractedData.carsCount} Cars ({formatBytes(extractedData.rawStr.length)})
              </p>
              <p className="text-[11px] text-zinc-400">
                Level {extractedData.stats?.level || 1} • Cash: {Number(extractedData.stats?.cash || 0).toLocaleString()} • Ready to populate
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <CopyButton text={extractedData.rawStr} label="Copy Raw" />
            <button
              type="button"
              onClick={handleApplyToSlot}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg text-xs transition-all shadow-[0_0_10px_rgba(16,185,129,0.3)]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Apply to {targetSlot.toUpperCase()} Card</span>
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function StringsTab({ adminToken }: { adminToken: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const regFileRef = useRef<HTMLInputElement>(null);
  const premFileRef = useRef<HTMLInputElement>(null);
  const bpFileRef = useRef<HTMLInputElement>(null);

  const [regularValue, setRegularValue] = useState("");
  const [premiumValue, setPremiumValue] = useState("");
  const [bpValue, setBpValue] = useState("");

  const [regularDirty, setRegularDirty] = useState(false);
  const [premiumDirty, setPremiumDirty] = useState(false);
  const [bpDirty, setBpDirty] = useState(false);

  const stringsQuery = useGetStrings({ adminToken }, { query: { queryKey: getGetStringsQueryKey({ adminToken }) } });

  useEffect(() => {
    if (stringsQuery.data) {
      const d = stringsQuery.data;
      if (!regularDirty) {
        setRegularValue(d.regularCarsString || d.regular_cars_string || "");
      }
      if (!premiumDirty) {
        setPremiumValue(d.premiumCarsString || d.premium_cars_string || d.carsString || d.cars_string || "");
      }
      if (!bpDirty) {
        setBpValue(d.blueprintString || d.blueprint_string || "");
      }
    }
  }, [stringsQuery.data, regularDirty, premiumDirty, bpDirty]);

  const updateStrings = useUpdateStrings({
    mutation: {
      onSuccess: (data: any, variables) => {
        toast({ title: "✅ Saved Successfully", description: data?.message || "Car strings updated on server database" });
        const v = variables.data;
        if (v.regularCarsString !== undefined && v.regularCarsString !== null) setRegularDirty(false);
        if (v.premiumCarsString !== undefined && v.premiumCarsString !== null) setPremiumDirty(false);
        if (v.blueprintString !== undefined && v.blueprintString !== null) setBpDirty(false);
        qc.invalidateQueries({ queryKey: getGetStringsQueryKey({ adminToken }) });
        qc.invalidateQueries({ queryKey: getGetCarsQueryKey() });
      },
      onError: (err) => {
        const msg = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.message
          || (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: "Error", description: msg || "Failed to update strings", variant: "destructive" });
      },
    },
  });

  const handleFileRead = (file: File, setter: (v: string) => void, dirtyFn: (v: boolean) => void, label: string) => {
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: `File size (${formatBytes(file.size)}) exceeds 20MB limit.`, variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const content = String(e.target.result).trim();
        setter(content);
        dirtyFn(true);
        toast({
          title: `📂 ${label} Loaded`,
          description: `${content.length.toLocaleString()} characters (${formatBytes(file.size)}) ready — click Save to apply.`
        });
      }
    };
    reader.readAsText(file);
  };

  const handleRefresh = async () => {
    setRegularDirty(false);
    setPremiumDirty(false);
    setBpDirty(false);
    const res = await stringsQuery.refetch();
    if (res.data) {
      const d = res.data;
      setRegularValue(d.regularCarsString || d.regular_cars_string || "");
      setPremiumValue(d.premiumCarsString || d.premium_cars_string || d.carsString || d.cars_string || "");
      setBpValue(d.blueprintString || d.blueprint_string || "");
      toast({ title: "🔄 Refreshed", description: "Strings reloaded directly from server database." });
    }
  };

  const handleSaveIndividual = (target: "regular" | "premium" | "blueprint") => {
    const payload: any = { adminToken };
    if (target === "regular") {
      payload.regularCarsString = regularValue;
      setRegularDirty(false);
    }
    if (target === "premium") {
      payload.premiumCarsString = premiumValue;
      setPremiumDirty(false);
    }
    if (target === "blueprint") {
      payload.blueprintString = bpValue;
      setBpDirty(false);
    }
    updateStrings.mutate({ data: payload });
  };

  const handleSaveAll = () => {
    setRegularDirty(false);
    setPremiumDirty(false);
    setBpDirty(false);
    updateStrings.mutate({
      data: {
        adminToken,
        regularCarsString: regularValue,
        premiumCarsString: premiumValue,
        blueprintString: bpValue,
      }
    });
  };

  const strings = stringsQuery.data;
  const anyDirty = regularDirty || premiumDirty || bpDirty;

  return (
    <div className="space-y-6">
      {/* Top Banner with Stats & Save All */}
      <div className="bg-gradient-to-r from-zinc-900/80 via-zinc-900/60 to-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xl">
            ⚡
          </div>
          <div>
            <h2 className="text-sm font-black text-white flex items-center gap-2">
              Replaceable Car Strings Engine
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                10 MB Supported
              </span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Paste or upload custom regular and premium profile car strings. Server decodes gzip base64 & JSON payloads.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            onClick={handleRefresh}
            disabled={stringsQuery.isFetching}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl text-xs transition-all disabled:opacity-50"
            title="Refresh from server"
          >
            <RefreshCw className={`w-4 h-4 ${stringsQuery.isFetching ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleSaveAll}
            disabled={updateStrings.isPending || !anyDirty}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-black font-black rounded-xl text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(245,158,11,0.25)]"
          >
            {updateStrings.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save All Strings
          </button>
        </div>
      </div>

      {/* ⚡ Auto-Extract String from CarX Account Card */}
      <div className="bg-gradient-to-br from-zinc-900/90 via-zinc-900/70 to-zinc-950/90 border border-amber-500/30 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 blur-3xl pointer-events-none rounded-full" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500/20 to-yellow-400/20 border border-amber-500/30 flex items-center justify-center text-xl shadow-[0_0_15px_rgba(245,158,11,0.2)]">
              🔑
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Account String Extractor</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono font-bold flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> 1-Click Auto Save
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Login with any CarX account to instantly extract its live garage profile, cars, and blueprints without manual copying.
              </p>
            </div>
          </div>
        </div>

        <AccountExtractorForm
          adminToken={adminToken}
          onExtracted={(extractedStr, targetSlot) => {
            if (targetSlot === "regular") {
              setRegularValue(extractedStr);
              setRegularDirty(true);
              toast({ title: "🚗 Applied to Regular Cars", description: "Click Save All or Save below to store to database." });
            } else if (targetSlot === "premium") {
              setPremiumValue(extractedStr);
              setPremiumDirty(true);
              toast({ title: "👑 Applied to Premium Cars", description: "Click Save All or Save below to store to database." });
            } else if (targetSlot === "blueprint") {
              setBpValue(extractedStr);
              setBpDirty(true);
              toast({ title: "📄 Applied to Blueprint", description: "Click Save All or Save below to store to database." });
            }
          }}
        />
      </div>

      {stringsQuery.isLoading && (
        <div className="text-zinc-500 text-sm text-center py-8 animate-pulse">Loading car strings from server database...</div>
      )}

      {/* 1. Regular Cars String Card */}
      <StringEditorCard
        title="REGULAR CARS STRING"
        subtitle="Template for Standard / Regular Cars Package injection"
        badge="Regular Package"
        badgeColor="bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
        icon="🚗"
        value={regularValue}
        originalValue={strings?.regularCarsString || ""}
        onChange={(v) => { setRegularValue(v); setRegularDirty(true); }}
        onSave={() => handleSaveIndividual("regular")}
        isSaving={updateStrings.isPending}
        isDirty={regularDirty}
        fileInputRef={regFileRef}
        onFileSelect={(e) => {
          if (e.target.files?.[0]) handleFileRead(e.target.files[0], setRegularValue, setRegularDirty, "Regular Cars String");
          e.target.value = "";
        }}
        placeholder="Paste REGULAR_CARS_STRING (Base64 compressed or JSON) here or upload .txt / .json file..."
        maxMB={10}
      />

      {/* 2. Premium Cars String Card */}
      <StringEditorCard
        title="PREMIUM CARS STRING"
        subtitle="Template for Full Luxury / Max Tuned Premium Cars Package injection"
        badge="Premium Package"
        badgeColor="bg-amber-500/10 text-amber-400 border-amber-500/30"
        icon="👑"
        value={premiumValue}
        originalValue={strings?.premiumCarsString || strings?.carsString || ""}
        onChange={(v) => { setPremiumValue(v); setPremiumDirty(true); }}
        onSave={() => handleSaveIndividual("premium")}
        isSaving={updateStrings.isPending}
        isDirty={premiumDirty}
        fileInputRef={premFileRef}
        onFileSelect={(e) => {
          if (e.target.files?.[0]) handleFileRead(e.target.files[0], setPremiumValue, setPremiumDirty, "Premium Cars String");
          e.target.value = "";
        }}
        placeholder="Paste PREMIUM_CARS_STRING (Base64 compressed or JSON) here or upload .txt / .json file..."
        maxMB={10}
      />

      {/* 3. Blueprint String Card */}
      <StringEditorCard
        title="COMPRESSED_STRING (Blueprint)"
        subtitle="Blueprint template string for full account structure"
        badge="Blueprint"
        badgeColor="bg-purple-500/10 text-purple-400 border-purple-500/30"
        icon="📄"
        value={bpValue}
        originalValue={strings?.blueprintString || ""}
        onChange={(v) => { setBpValue(v); setBpDirty(true); }}
        onSave={() => handleSaveIndividual("blueprint")}
        isSaving={updateStrings.isPending}
        isDirty={bpDirty}
        fileInputRef={bpFileRef}
        onFileSelect={(e) => {
          if (e.target.files?.[0]) handleFileRead(e.target.files[0], setBpValue, setBpDirty, "Blueprint String");
          e.target.value = "";
        }}
        placeholder="Paste COMPRESSED_STRING (Blueprint) here..."
        maxMB={10}
      />

      {strings?.updatedAt && (
        <div className="flex items-center justify-between text-xs text-zinc-500 font-mono px-1">
          <span>🛡️ Server sync active</span>
          <span>Last modified: {new Date(strings.updatedAt).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

function CarsTab({ adminToken }: { adminToken: string }) {
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "regular" | "premium">("all");
  const carsQuery = useGetCars({ userToken: adminToken }, { query: { queryKey: getGetCarsQueryKey({ userToken: adminToken }) } });
  const cars = carsQuery.data?.cars || [];

  const filtered = cars.filter((c) => {
    const matchesSearch = !search || c.descId.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const displayedCars = filterMode === "regular"
    ? filtered.slice(0, 30)
    : filtered;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
          <button
            onClick={() => setFilterMode("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterMode === "all" ? "bg-amber-500 text-black font-bold" : "text-zinc-400 hover:text-white"
            }`}
          >
            All Cars ({cars.length})
          </button>
          <button
            onClick={() => setFilterMode("regular")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterMode === "regular" ? "bg-cyan-500 text-black font-bold" : "text-zinc-400 hover:text-white"
            }`}
          >
            🚗 Regular Package (30)
          </button>
          <button
            onClick={() => setFilterMode("premium")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterMode === "premium" ? "bg-amber-400 text-black font-bold" : "text-zinc-400 hover:text-white"
            }`}
          >
            👑 Premium Package ({cars.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search car model..."
              className="w-full pl-9 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <button
            onClick={() => carsQuery.refetch()}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${carsQuery.isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {carsQuery.isLoading && <div className="text-center py-8 text-zinc-500 text-sm">Loading cars catalog...</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[520px] overflow-y-auto pr-1">
        {displayedCars.slice(0, 150).map((car, idx) => (
          <div key={car.id || idx} className="bg-zinc-900/60 border border-zinc-800/60 hover:border-zinc-700 rounded-xl p-3 flex items-center gap-3 transition-all hover:bg-zinc-900/90">
            <span className="text-2xl">{idx < 30 ? "🚗" : "🏎️"}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold font-mono text-white truncate">{car.descId}</p>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[10px] text-zinc-500 font-mono">ID: {car.id}</span>
                <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                  idx < 30 ? "bg-cyan-500/10 text-cyan-400" : "bg-amber-500/10 text-amber-400"
                }`}>
                  {idx < 30 ? "Regular" : "Premium"}
                </span>
              </div>
            </div>
          </div>
        ))}
        {displayedCars.length > 150 && (
          <div className="col-span-full text-center py-2 text-xs text-zinc-500">
            Showing first 150 of {displayedCars.length} models
          </div>
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
              className={`flex items-center gap-2 flex-1 justify-center px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                tab === id ? "bg-amber-500 text-black shadow-lg font-bold" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
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
            {tab === "strings" && <StringsTab adminToken={adminToken} />}
            {tab === "cars" && <CarsTab adminToken={adminToken} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
