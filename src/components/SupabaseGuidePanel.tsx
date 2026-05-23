/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { getSupabaseDetails, getSupabaseSQLSnippet, testSupabaseConnection } from '../lib/db';
import { Database, CheckCircle2, AlertTriangle, Copy, Check, Terminal, ExternalLink, RefreshCw, X } from 'lucide-react';

interface SupabaseGuidePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SupabaseGuidePanel({ isOpen, onClose }: SupabaseGuidePanelProps) {
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; checked: boolean }>({
    success: false,
    message: '',
    checked: false,
  });

  const details = getSupabaseDetails();
  const sqlSnippet = getSupabaseSQLSnippet();

  const handleCopy = () => {
    navigator.clipboard.writeText(sqlSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const runConnectionCheck = async () => {
    if (!details.isConnected) return;
    setTesting(true);
    try {
      const res = await testSupabaseConnection();
      setTestResult({
        success: res.success,
        message: res.message,
        checked: true
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Connection check failed: ${err.message || err}`,
        checked: true
      });
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runConnectionCheck();
    }
  }, [isOpen, details.isConnected]);

  if (!isOpen) return null;

  // Choose statuses
  let statusBg = 'bg-amber-950/40 border-amber-900/60 text-amber-300';
  let statusHeader = 'Local Storage Fallback (Offline)';
  let statusDesc = 'Using robust LocalStorage. App works immediately! Any edits are preserved locally. To unlock multi-device cloud storage, connect Supabase.';
  let StatusIcon = AlertTriangle;

  if (details.isConnected) {
    if (testing) {
      statusBg = 'bg-stone-900/40 border-stone-700/60 text-stone-300';
      statusHeader = 'Verifying Database Connection...';
      statusDesc = 'Testing active table queries against your custom Supabase instance...';
      StatusIcon = RefreshCw;
    } else if (testResult.checked && testResult.success) {
      statusBg = 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300';
      statusHeader = 'Verified Supabase Connected!';
      statusDesc = testResult.message;
      StatusIcon = CheckCircle2;
    } else if (testResult.checked && !testResult.success) {
      statusBg = 'bg-rose-950/40 border-rose-900/65 text-rose-300';
      statusHeader = 'Supabase Table Setup Required';
      statusDesc = testResult.message;
      StatusIcon = AlertTriangle;
    } else {
      statusBg = 'bg-[#5A5A40]/10 border-[#5A5A40]/40 text-[#5A5A40]';
      statusHeader = 'Keys Defined (Not Verified)';
      statusDesc = 'Credentials detected in settings. Tap the refresh button to run a live database query test.';
      StatusIcon = Database;
    }
  }

  return (
    <>
      {/* Dim backdrop */}
      <div 
        className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-55 cursor-pointer"
        onClick={onClose}
      />

      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-sm w-[92vw] sm:w-112 bg-stone-950 border border-stone-800 text-stone-300 rounded-2xl shadow-2xl p-4.5 sm:p-5 z-55 space-y-4 font-sans text-xs flex flex-col transition-all duration-300 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-stone-800 shrink-0">
          <div className="flex items-center gap-2">
            <Database className="w-4.5 h-4.5 text-[#e0e0d8]" />
            <span className="font-bold text-stone-100 text-[11px] tracking-wide uppercase font-mono">SUPABASE CONSOLE</span>
          </div>
          
          <div className="flex items-center gap-2">
            {details.isConnected && (
              <button
                onClick={runConnectionCheck}
                disabled={testing}
                className="text-stone-400 hover:text-white rounded-full p-1 cursor-pointer transition-colors"
                title="Re-test live connection"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button 
              onClick={onClose}
              className="text-stone-500 hover:text-stone-300 rounded-full p-0.5 cursor-pointer"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Integration Status Badge */}
        <div className={`p-3 rounded-xl border flex items-start gap-3 transition-colors ${statusBg}`}>
          <StatusIcon className={`w-5 h-5 shrink-0 mt-0.5 ${testing && StatusIcon === RefreshCw ? 'animate-spin' : ''}`} />

          <div className="space-y-1">
            <h4 className="font-bold pr-1">
              {statusHeader}
            </h4>
            <p className="text-[10px] leading-relaxed text-stone-400">
              {statusDesc}
            </p>
          </div>
        </div>

      {/* Setup instructions (if not connected) */}
      {!details.isConnected && (
        <div className="space-y-2">
          <p className="font-bold text-slate-300 text-[10px] uppercase tracking-wide">Cloud Setup Instructions:</p>
          <ol className="list-decimal list-inside space-y-1 pl-1 text-[11px] text-slate-400 leading-relaxed font-semibold">
            <li>Create a project on <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline inline-flex items-center gap-0.5">supabase.com <ExternalLink className="w-2.5 h-2.5" /></a></li>
            <li>Add these two variables to your workspace secrets/environment:
              <div className="bg-slate-900 border border-slate-800/80 p-1.5 rounded-lg my-1 text-[9px] font-mono leading-normal text-slate-300 whitespace-pre">
                VITE_SUPABASE_URL="https://...supabase.co"<br />
                VITE_SUPABASE_ANON_KEY="..."
              </div>
            </li>
            <li>Run the SQL snippet below in the Supabase SQL Editor:</li>
          </ol>
        </div>
      )}

      {/* Database Schema Codeblock */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase flex items-center gap-1">
            <Terminal className="w-3.5 h-3.5 text-indigo-400" />
            Person Table Schema SQL
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 bg-indigo-900/50 hover:bg-indigo-800 border border-indigo-700 text-indigo-200 hover:text-white px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy SQL
              </>
            )}
          </button>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 max-h-36 overflow-y-auto text-[10px] font-mono leading-normal text-slate-300 whitespace-pre-wrap">
          {sqlSnippet}
        </div>
      </div>
    </div>
    </>
  );
}
