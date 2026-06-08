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
  orderBy,
  limit,
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

const MOCK_CLIENTS = ["Acme Corp", "Global Industries", "Internal Expenses"];

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
  const [entries, setEntries] = useState<ReceiptEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  const fetchEntries = async () => {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const db = getFirestoreInstance();
      const q = query(
        collection(db, "receipts"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc"),
        limit(20)
      );
      const snap = await getDocs(q);
      const list: ReceiptEntry[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ReceiptEntry, "id">),
      }));
      setEntries(list);
    } catch {
      // Firestore may not be enabled yet
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, [user]);

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

      fetchEntries();
    } catch {
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
          <h1 className="text-xl font-semibold">Receipts</h1>
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
            <Row label="Total" value={`$${Number(result.total_amount).toFixed(2)}`} />
            <Row label="Tax" value={`$${Number(result.tax_amount).toFixed(2)}`} />
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

      <h2 className="mb-3 text-base font-medium">Recent Activity</h2>

      {loadingHistory ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
          <Loader2 size={16} className="animate-spin" />
          Loading history…
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-zinc-400">No entries yet. Scan your first receipt.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((e) => (
            <div
              key={e.id}
              className="rounded-lg border border-zinc-200 px-4 py-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{e.accountName}</span>
                <span className="text-zinc-400">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                  }).format(e.total_amount)}
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
