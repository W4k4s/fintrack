"use client";

import { useState, useCallback } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, HelpCircle, ChevronDown, ChevronUp } from "lucide-react";

type Step = "upload" | "preview" | "done";

export default function ImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<any>(null);
  const [showGuide, setShowGuide] = useState(false);

  const handleFiles = useCallback(async (newFiles: File[]) => {
    const pdfs = newFiles.filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    if (!pdfs.length) { setError("Please upload PDF files"); return; }
    setFiles(pdfs);
    setError(null);
    setLoading(true);

    const formData = new FormData();
    pdfs.forEach(f => formData.append("files", f));

    try {
      const res = await fetch("/api/import/trade-republic", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPreview(data);
      setStep("preview");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/import/trade-republic/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preview),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setImported(data.imported);
      setStep("done");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import</h1>
        <p className="text-sm text-muted mt-1">Import your Trade Republic data</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {step === "upload" && (
        <>
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
              dragOver ? "border-accent bg-accent/5" : "border-border hover:border-accent/50"
            }`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(Array.from(e.dataTransfer.files)); }}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file"; input.multiple = true; input.accept = ".pdf";
              input.onchange = () => input.files && handleFiles(Array.from(input.files));
              input.click();
            }}
          >
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted">Parsing {files.length} PDF{files.length > 1 ? "s" : ""}...</p>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-muted mx-auto mb-3" />
                <p className="font-medium">Drop Trade Republic PDFs here</p>
                <p className="text-sm text-muted mt-1">or click to browse</p>
                <p className="text-xs text-muted mt-3">Supports: Securities Statement, Crypto Statement, Bank Statement</p>
              </>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="w-full flex items-center justify-between p-4 hover:bg-[var(--hover-bg)] transition-colors"
            >
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium">How to export from Trade Republic</span>
              </div>
              {showGuide ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
            </button>
            {showGuide && (
              <div className="px-4 pb-4 text-sm text-muted space-y-2 border-t border-border pt-3">
                <p>1. Open the <strong>Trade Republic app</strong></p>
                <p>2. Go to <strong>Profile → Documents</strong></p>
                <p>3. Download these 3 documents:</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li><strong>Extracto de Cuenta de Valores</strong> — your stocks & ETFs</li>
                  <li><strong>Extracto de Criptomonedas</strong> — your crypto holdings</li>
                  <li><strong>Estado de Cuenta</strong> — your bank statement with all transactions</li>
                </ul>
                <p>4. Upload all 3 PDFs here</p>
              </div>
            )}
          </div>
        </>
      )}

      {step === "preview" && preview && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold">Preview — Data found in your PDFs</h2>

            {preview.securities.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted mb-2">Securities ({preview.securities.length})</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-muted uppercase border-b border-border">
                      <th className="text-left py-2 px-3">Symbol</th>
                      <th className="text-left py-2 px-3">Name</th>
                      <th className="text-right py-2 px-3">Qty</th>
                      <th className="text-right py-2 px-3">Price (€)</th>
                      <th className="text-right py-2 px-3">Value (€)</th>
                    </tr></thead>
                    <tbody>{preview.securities.map((s: any, i: number) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2 px-3 font-medium">{s.symbol}</td>
                        <td className="py-2 px-3 text-muted">{s.name.substring(0, 40)}</td>
                        <td className="py-2 px-3 text-right">{s.quantity.toFixed(6)}</td>
                        <td className="py-2 px-3 text-right">€{s.priceEur.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right font-medium">€{s.valueEur.toLocaleString()}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {preview.crypto.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted mb-2">Crypto ({preview.crypto.length})</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-muted uppercase border-b border-border">
                      <th className="text-left py-2 px-3">Symbol</th>
                      <th className="text-right py-2 px-3">Qty</th>
                      <th className="text-right py-2 px-3">Price (€)</th>
                      <th className="text-right py-2 px-3">P/L</th>
                      <th className="text-right py-2 px-3">Value (€)</th>
                    </tr></thead>
                    <tbody>{preview.crypto.map((c: any, i: number) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2 px-3 font-medium">{c.symbol}</td>
                        <td className="py-2 px-3 text-right">{c.quantity.toFixed(6)}</td>
                        <td className="py-2 px-3 text-right">€{c.priceEur.toLocaleString()}</td>
                        <td className={`py-2 px-3 text-right ${c.gainPct >= 0 ? "text-accent" : "text-destructive"}`}>{c.gainPct.toFixed(1)}%</td>
                        <td className="py-2 px-3 text-right font-medium">€{c.valueEur.toLocaleString()}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {preview.cashBalance != null && (
              <div className="flex items-center justify-between p-3 bg-accent/5 rounded-lg">
                <span className="text-sm font-medium">Cash Balance</span>
                <span className="text-lg font-bold">€{preview.cashBalance.toLocaleString()}</span>
              </div>
            )}

            {preview.transactionCount > 0 && (
              <div className="flex items-center justify-between p-3 bg-blue-500/5 rounded-lg">
                <span className="text-sm font-medium">Bank Transactions</span>
                <span className="text-sm text-muted">{preview.transactionCount} transactions ready to import</span>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setStep("upload"); setPreview(null); setFiles([]); }}
              className="px-4 py-2.5 text-sm bg-card hover:bg-[var(--hover-bg)] border border-border rounded-lg transition-colors">
              Back
            </button>
            <button onClick={handleConfirm} disabled={loading}
              className="px-6 py-2.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50">
              {loading ? "Importing..." : "Confirm Import"}
            </button>
          </div>
        </div>
      )}

      {step === "done" && imported && (
        <div className="bg-card border border-accent/30 rounded-xl p-8 text-center space-y-4">
          <CheckCircle className="w-12 h-12 text-accent mx-auto" />
          <h2 className="text-xl font-bold">Import Complete!</h2>
          <div className="text-sm text-muted space-y-1">
            <p>{imported.securities} securities imported</p>
            <p>{imported.crypto} crypto positions imported</p>
            {imported.cash > 0 && <p>Cash balance added</p>}
            <p>{imported.transactions} bank transactions imported</p>
          </div>
          <div className="flex gap-3 justify-center pt-2">
            <a href="/" className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">View Dashboard</a>
            <a href="/expenses" className="px-4 py-2 text-sm bg-card hover:bg-[var(--hover-bg)] border border-border rounded-lg transition-colors">View Expenses</a>
            <button onClick={() => { setStep("upload"); setPreview(null); setFiles([]); setImported(null); }}
              className="px-4 py-2 text-sm bg-card hover:bg-[var(--hover-bg)] border border-border rounded-lg transition-colors">
              Import More
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
