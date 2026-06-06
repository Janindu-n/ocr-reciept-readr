"use client";

export const dynamic = "force-dynamic";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { getAuthInstance } from "@/lib/firebase";
import { Camera, Loader2, LogOut } from "lucide-react";

type ReceiptData = {
  vendor_name: string;
  date: string;
  total_amount: number;
  tax_amount: number;
  category: string;
};

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ReceiptData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
    setResult(null);
    setError("");

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
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
          <Loader2 size={18} className="animate-spin" />
          Scanning receipt…
        </div>
      )}

      {error && (
        <p className="mb-4 text-sm text-red-500">{error}</p>
      )}

      {result && (
        <div className="rounded-xl border border-zinc-200 p-4 text-sm">
          <h2 className="mb-3 text-base font-medium">Extracted Receipt</h2>
          <div className="flex flex-col gap-2">
            <Row label="Vendor" value={result.vendor_name} />
            <Row label="Date" value={result.date} />
            <Row label="Category" value={result.category} />
            <Row label="Total" value={`$${Number(result.total_amount).toFixed(2)}`} />
            <Row label="Tax" value={`$${Number(result.tax_amount).toFixed(2)}`} />
          </div>
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
