/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Lock, Unlock, Key, X, AlertCircle, Check, Shield } from 'lucide-react';

interface EditLockModalProps {
  isOpen: boolean;
  onClose: () => void;
  isUnlocked: boolean;
  onUnlock: (pin: string) => boolean;
  onLock: () => void;
  onUpdatePasscode: (newPin: string) => void;
}

export default function EditLockModal({
  isOpen,
  onClose,
  isUnlocked,
  onUnlock,
  onLock,
  onUpdatePasscode,
}: EditLockModalProps) {
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // Custom pin changing settings
  const [showChangePin, setShowChangePin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [changeError, setChangeError] = useState('');

  if (!isOpen) return null;

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    
    if (!pinInput.trim()) {
      setErrorMsg('કૃપા કરીને પિન દાખલ કરો (Please enter passcode PIN)');
      return;
    }

    const success = onUnlock(pinInput.trim());
    if (success) {
      setPinInput('');
      setSuccessMsg('અનલૉક સફળ! એડિટર મોડ સક્રિય. (Unlocked successfully!)');
      setErrorMsg('');
      setTimeout(() => {
        setSuccessMsg('');
        onClose();
      }, 1200);
    } else {
      setErrorMsg('ખોટો પિન! ફરીથી પ્રયાસ કરો. (Incorrect PIN. Try again.)');
    }
  };

  const handleChangePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setChangeError('');
    
    if (newPin.trim().length < 4) {
      setChangeError('નવો પિન ઓછામાં ઓછો 4 અક્ષરનો હોવો જોઈએ. (PIN must be at least 4 characters)');
      return;
    }

    if (newPin.trim() !== confirmNewPin.trim()) {
      setChangeError('દાખલ કરેલા બંને પિન મેળ ખાતા નથી. (PINs do not match)');
      return;
    }

    onUpdatePasscode(newPin.trim());
    setNewPin('');
    setConfirmNewPin('');
    setShowChangePin(false);
    setSuccessMsg('પિન બદલાઈ ગયો છે! (Passcode PIN changed successfully!)');
    setTimeout(() => {
      setSuccessMsg('');
    }, 2000);
  };

  return (
    <>
      {/* Background overlay backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/60 z-[200] backdrop-blur-xs transition-opacity cursor-pointer"
        onClick={onClose}
      />

      {/* Main pin locking dialogue box */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-md bg-white rounded-3xl shadow-2xl z-[201] border border-[var(--color-brand-border)] p-6 overflow-hidden select-none">
        
        {/* Header toolbar */}
        <div className="flex items-center justify-between border-b border-stone-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[var(--color-brand)]" />
            <h3 className="text-sm font-serif font-black italic text-[var(--color-brand)]">
              સંપાદન નિયંત્રણ (Edit Access Control)
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 hover:scale-105 active:scale-95 transition-all p-1.5 rounded-full cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {successMsg && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 flex items-center gap-2 text-xs font-semibold animate-pulse">
            <Check className="w-5 h-5 text-emerald-500 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 1. LOCKED MODE SCREEN */}
        {!isUnlocked ? (
          <form onSubmit={handleUnlockSubmit} className="space-y-4">
            <div className="bg-[var(--color-brand-light)] border border-[var(--color-brand-border)] rounded-2xl p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-white border border-[var(--color-brand-border)] flex items-center justify-center mx-auto mb-2 text-[var(--color-brand)] shadow-xs">
                <Lock className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-black uppercase text-[var(--color-brand)] tracking-widest mb-1 font-sans">
                ટ્રી સંપાદન લૉક છે (Editing is Locked)
              </h4>
              <p className="text-[11px] text-stone-600 leading-relaxed font-serif pt-1">
                આ ફેમિલી ટ્રીમાં સભ્યો ઉમેરવા, સુધારવા કે ડિલીટ કરવા માટે એડિટર લૉક ખોલો.
              </p>
              <p className="text-[10px] text-stone-450 italic font-serif mt-1">
                To insert spouses, children or modify profiles, unlock Editor Mode below.
              </p>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="text-[10px] font-extrabold text-stone-500 uppercase tracking-wider block">
                પિન પાસકોડ દાખલ કરો (Enter Passcode PIN)
              </label>
              <div className="relative">
                <Key className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={pinInput}
                  onChange={e => setPinInput(e.target.value)}
                  placeholder="પાસકોડ દાખલ કરો..."
                  className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-[var(--color-brand-border)] rounded-xl text-center text-sm font-bold tracking-widest focus:outline-hidden focus:ring-2 focus:ring-[var(--color-brand)]/20 focus:bg-white text-stone-900"
                  autoFocus
                />
              </div>
            </div>

            {errorMsg && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-2.5 flex items-center gap-2 text-[11px] font-medium leading-normal">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-[var(--color-brand)] hover:bg-[var(--color-brand-dark)] text-white text-xs font-bold py-2.5 rounded-xl uppercase tracking-wider cursor-pointer shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              <Unlock className="w-3.5 h-3.5" /> અનલૉક કરો (Unlock Now)
            </button>
          </form>
        ) : (
          /* 2. UNLOCKED EDITOR MODE SCREEN */
          <div className="space-y-4">
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-white border border-emerald-200 flex items-center justify-center mx-auto mb-2 text-emerald-600 shadow-xs">
                <Unlock className="w-5 h-5 animate-bounce" />
              </div>
              <h4 className="text-xs font-black uppercase text-emerald-800 tracking-widest mb-1 font-sans">
                એડિટર મોડ સક્રિય છે (Editor Mode Active)
              </h4>
              <p className="text-[11px] text-stone-600 leading-relaxed font-serif pt-1">
                હવે કોઈ પણ સભ્યની પ્રોફાઇલ બદલી શકાશે અથવા નવા સભ્ય જોડી શકાશે.
              </p>
              <p className="text-[10px] text-stone-450 italic font-serif mt-1">
                Additions, relational connections and database deletions are now fully enabled.
              </p>
            </div>

            <div className="space-y-2 border-t border-stone-100 pt-3 flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setShowChangePin(!showChangePin)}
                className="text-xs text-[var(--color-brand)] hover:underline font-serif font-bold italic block text-center cursor-pointer py-1"
              >
                {showChangePin ? 'પિન બદલવાનું રદ કરો (Cancel Pin Change)' : '🔒 સિક્યોરિટી પિન બદલો (Change Security PIN)'}
              </button>

              {showChangePin && (
                <form onSubmit={handleChangePinSubmit} className="bg-[#fafaf7] p-3.5 rounded-xl border border-stone-200/60 mt-1 space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-extrabold text-stone-500 uppercase tracking-widest block">
                      નવો સિક્યોરિટી પિન (New PIN Passcode)
                    </label>
                    <input
                      type="password"
                      value={newPin}
                      onChange={e => setNewPin(e.target.value)}
                      placeholder="નવો 4 કે તેથી વધુ અક્ષરનો પિન..."
                      className="w-full px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-center text-xs font-bold tracking-widest text-stone-900 focus:outline-hidden"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-extrabold text-stone-500 uppercase tracking-widest block">
                      નવા પિનની ખાતરી કરો (Confirm New PIN)
                    </label>
                    <input
                      type="password"
                      value={confirmNewPin}
                      onChange={e => setConfirmNewPin(e.target.value)}
                      placeholder="ફરીથી નવો પિન લખો..."
                      className="w-full px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-center text-xs font-bold tracking-widest text-stone-900 focus:outline-hidden"
                    />
                  </div>

                  {changeError && (
                    <p className="text-[10px] text-rose-700 font-bold italic leading-tight">{changeError}</p>
                  )}

                  <button
                    type="submit"
                    className="w-full bg-[var(--color-brand)] hover:bg-[var(--color-brand-dark)] text-white text-[10px] font-bold py-1.5 rounded-lg uppercase tracking-wider cursor-pointer transition-all"
                  >
                    પિન સાચવો (Update Passcode PIN)
                  </button>
                </form>
              )}
            </div>

            <div className="border-t border-stone-100 pt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={onLock}
                className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-850 text-xs font-bold py-2.5 rounded-xl uppercase tracking-wider cursor-pointer shadow-xs transition-all flex items-center justify-center gap-1.5 border border-stone-250"
              >
                <Lock className="w-3.5 h-3.5 text-stone-605" /> લૉક પાછું કરો (Exit Editor)
              </button>
              
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-[var(--color-brand-light)] hover:bg-[var(--color-brand-border)] text-[var(--color-brand)] text-xs font-bold py-2.5 rounded-xl uppercase tracking-wider cursor-pointer transition-all border border-[var(--color-brand-border)]"
              >
                સંપાદન ચાલુ રાખો (Done)
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
