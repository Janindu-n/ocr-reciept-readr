"use client";

export const dynamic = "force-dynamic";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { getAuthInstance, getFirestoreInstance } from "@/lib/firebase";
import {
  collection,
  addDoc,
  doc,
  setDoc,
  arrayUnion,
  query,
  where,
  getDocs,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { Camera, Loader2, LogOut, Check } from "lucide-react";

type ReceiptData = {
  vendor_name: string;
  date: string;
  total_amount: number;
  tax_amount: number;
  category: string;
};

type ReceiptEntry = ReceiptData & {
  id: string;
  userId: string;
  accountName: string;
  createdAt: Timestamp;
};

type AccountSummary = {
  name: string;
  receiptCount: number;
  totalAmount: number;
};

const USD_TO_LKR = 300;

const MOCK_CLIENTS = ["Acme Corp", "Global Industries", "Internal Expenses"];

function fmtAmount(usd: number) {
  const lkr = usd * USD_TO_LKR;
  const us = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(usd);
  const lk = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", maximumFractionDigits: 0 }).format(lkr);
  return { usd: us, lkr: lk };
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ReceiptData | null>(null);
  const [error, setError] = useState("");
  const [accountName, setAccountName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [allEntries, setAllEntries] = useState<ReceiptEntry[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  const fetchAll = async () => {
    if (!user) return;
    setLoadingData(true);
    try {
      const db = getFirestoreInstance();
      const q = query(
        collection(db, "receipts"),
        where("userId", "==", user.uid)
      );
      const snap = await getDocs(q);
      const list: ReceiptEntry[] = snap.docs.map((d) => {
        const data = d.data() as Omit<ReceiptEntry, "id">;
        return { id: d.id, ...data };
      });
      list.sort((a, b) => {
        const ta = a.createdAt as Timestamp | undefined;
        const tb = b.createdAt as Timestamp | undefined;
        if (ta && tb) return tb.seconds - ta.seconds || tb.nanoseconds - ta.nanoseconds;
        return 0;
      });
      setAllEntries(list);
    } catch (err) {
      console.error("fetch receipts error:", err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [user]);

  const accounts: AccountSummary[] = (() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const e of allEntries) {
      const cur = map.get(e.accountName) || { count: 0, total: 0 };
      cur.count++;
      cur.total += Number(e.total_amount) || 0;
      map.set(e.accountName, cur);
    }
    return Array.from(map.entries())
      .map(([name, { count, total }]) => ({ name, receiptCount: count, totalAmount: total }))
      .sort((a, b) => b.receiptCount - a.receiptCount || b.totalAmount - a.totalAmount);
  })();

  const accountNames = accounts.map((a) => a.name);

  const filteredEntries = selectedAccount
    ? allEntries.filter((e) => e.accountName === selectedAccount)
    : allEntries;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
    setResult(null);
    setError("");
    setSaved(false);

    const fd = new FormData();
    fd.append("receipt", file);

    try {
      const res = await fetch("/api/scan", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!user || !result || !accountName.trim()) return;
    setSaving(true);
    try {
      const db = getFirestoreInstance();
      const name = accountName.trim();

      const receiptRef = await addDoc(collection(db, "receipts"), {
        userId: user.uid,
        accountName: name,
        vendor_name: result.vendor_name,
        date: result.date,
        total_amount: result.total_amount,
        tax_amount: result.tax_amount,
        category: result.category,
        createdAt: serverTimestamp(),
      });

      const accountDocRef = doc(db, "accounts", name);
      await setDoc(
        accountDocRef,
        {
          userId: user.uid,
          accountName: name,
          receiptIds: arrayUnion(receiptRef.id),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setAccountName("");
      setResult(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);

      fetchAll();
    } catch (err) {
      console.error("save error:", err);
      setError("Failed to save receipt");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">SimpleBook OCR</h1>
          <p className="text-xs text-zinc-500">{user?.email}</p>
        </div>
        <button
          onClick={() => signOut(getAuthInstance())}
          className="rounded-lg p-2 text-zinc-400 hover:text-zinc-600"
        >
          <LogOut size={18} />
        </button>
      </div>

      <label className="mb-6 flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-zinc-300 px-6 py-10 text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-600">
        <Camera size={32} />
        <span className="text-sm font-medium">Scan Receipt</span>
        <span className="text-xs">Tap to take a photo or choose an image</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
          disabled={scanning}
        />
      </label>

      {scanning && (
        <div className="mb-4 flex items-center justify-center gap-2 py-4 text-sm text-zinc-500">
          <Loader2 size={18} className="animate-spin" />
          Scanning receipt…
        </div>
      )}

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      {saved && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          <Check size={16} />
          Receipt saved to account
        </div>
      )}

      {result && (
        <div className="mb-6 rounded-xl border border-zinc-200 p-4 text-sm">
          <h2 className="mb-3 text-base font-medium">Extracted Receipt</h2>
          <div className="mb-4 flex flex-col gap-2">
            <Row label="Vendor" value={result.vendor_name} />
            <Row label="Date" value={result.date} />
            <Row label="Category" value={result.category} />
            <AmountRow label="Total" usd={Number(result.total_amount)} />
            <AmountRow label="Tax" usd={Number(result.tax_amount)} />
          </div>

          <input
            className="mb-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            type="text"
            placeholder="Account / Client Name"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            list="clients"
          />
          <datalist id="clients">
            {MOCK_CLIENTS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          <button
            onClick={handleSave}
            disabled={saving || !accountName.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving…
              </>
            ) : (
              "Save to Account"
            )}
          </button>
        </div>
      )}

      {/* Accounts section */}
      <div className="mb-6">
        <h2 className="mb-3 text-base font-medium">Accounts</h2>
        {loadingData ? (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-zinc-500">
            <Loader2 size={16} className="animate-spin" />
            Loading accounts…
          </div>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No accounts yet. Scan and save a receipt to get started.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {accounts.map((a) => (
              <div
                key={a.name}
                className="rounded-lg border border-zinc-200 px-4 py-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-right">
                    <span className="block font-semibold">{fmtAmount(a.totalAmount).usd}</span>
                    <span className="block text-xs text-zinc-400">{fmtAmount(a.totalAmount).lkr}</span>
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {a.receiptCount} receipt{a.receiptCount !== 1 ? "s" : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent activity */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-medium">Recent Activity</h2>
        {accountNames.length > 0 && (
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
          >
            <option value="">All Receipts</option>
            {accountNames.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
      </div>

      {loadingData ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
          <Loader2 size={16} className="animate-spin" />
          Loading receipts…
        </div>
      ) : filteredEntries.length === 0 ? (
        <p className="text-sm text-zinc-400">
          {selectedAccount
            ? "No receipts for this account yet."
            : "No entries yet. Scan your first receipt."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredEntries.map((e) => (
            <div
              key={e.id}
              className="rounded-lg border border-zinc-200 px-4 py-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{e.accountName}</span>
                <span className="text-right">
                  <span className="block text-zinc-400">{fmtAmount(e.total_amount).usd}</span>
                  <span className="block text-xs text-zinc-300">{fmtAmount(e.total_amount).lkr}</span>
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-xs text-zinc-400">
                <span>
                  {e.vendor_name} &middot; {e.category}
                </span>
                <span>{e.date}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-zinc-100 py-1 last:border-0">
      <span className="text-zinc-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function AmountRow({ label, usd }: { label: string; usd: number }) {
  const f = fmtAmount(usd);
  return (
    <div className="flex justify-between border-b border-zinc-100 py-1 last:border-0">
      <span className="text-zinc-400">{label}</span>
      <span className="text-right">
        <span className="block font-medium">{f.usd}</span>
        <span className="block text-xs text-zinc-400">{f.lkr}</span>
      </span>
    </div>
  );
}
