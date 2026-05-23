/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Person, Gender } from '../types';
import { X, Save, Trash2, HelpCircle } from 'lucide-react';

interface MemberEditModalProps {
  person: Person | null; // Null means adding a new person
  isOpen: boolean;
  onClose: () => void;
  onSave: (person: Person) => void;
  onDelete?: (id: string) => void;
  allPeople: Person[];
  relationPreset?: {
    type: 'child' | 'spouse' | 'parent';
    relativeId: string;
  } | null;
}

export default function MemberEditModal({
  person,
  isOpen,
  onClose,
  onSave,
  onDelete,
  allPeople,
  relationPreset,
}: MemberEditModalProps) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [dob, setDob] = useState('');
  const [dod, setDod] = useState('');
  const [photourl, setPhotourl] = useState('');
  const [notes, setNotes] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [occupation, setOccupation] = useState('');
  
  // Relations
  const [fatherid, setFatherid] = useState<string>('');
  const [motherid, setMotherid] = useState<string>('');
  const [spouseid, setSpouseid] = useState<string>('');

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (isOpen) {
      setErrors({});
      if (person) {
        // Editing existing person
        setName(person.name || '');
        setGender(person.gender || 'male');
        setDob(person.dob || '');
        setDod(person.dod || '');
        setPhotourl(person.photourl || '');
        setNotes(person.notes || '');
        setBirthPlace(person.birthPlace || '');
        setOccupation(person.occupation || '');
        setFatherid(person.fatherid || '');
        setMotherid(person.motherid || '');
        setSpouseid(person.spouseid || '');
      } else {
        // Adding new person
        setName('');
        setGender('male');
        setDob('');
        setDod('');
        setPhotourl('');
        setNotes('');
        setBirthPlace('');
        setOccupation('');
        setFatherid('');
        setMotherid('');
        setSpouseid('');

        // Apply pre-fill relationship presets if they were requested (e.g. from context quick buttons)
        if (relationPreset) {
          const { type, relativeId } = relationPreset;
          const relative = allPeople.find(p => p.id === relativeId);
          if (relative) {
            if (type === 'spouse') {
              setSpouseid(relativeId);
              // Oppose gender standard preset for couples
              setGender(relative.gender === 'male' ? 'female' : 'male');
            } else if (type === 'child') {
              if (relative.gender === 'male') {
                setFatherid(relativeId);
                // Pre-fill mother with the relative's spouse if present
                if (relative.spouseid) {
                  setMotherid(relative.spouseid);
                }
              } else {
                setMotherid(relativeId);
                if (relative.spouseid) {
                  setFatherid(relative.spouseid);
                }
              }
            } else if (type === 'parent') {
              // The relative is the child of our soon-to-be-created parent
              // We'll hook it up on save, but we can't fully pre-select. 
              // We will alert the user.
            }
          }
        }
      }
    }
  }, [isOpen, person, relationPreset, allPeople]);

  if (!isOpen) return null;

  // Filter out self and people who would create cyclical loops
  // To keep it simple: we cannot choose the person themselves as father/mother/spouse.
  // We should also prevent selecting descendants of this person.
  const getEligibleFamily = (): Person[] => {
    if (!person) return allPeople;
    
    // Find all descendants recursively
    const descendants = new Set<string>();
    
    function collectDescendants(parentId: string) {
      allPeople.forEach(p => {
        if (p.fatherid === parentId || p.motherid === parentId) {
          if (!descendants.has(p.id)) {
            descendants.add(p.id);
            collectDescendants(p.id);
          }
        }
      });
    }

    collectDescendants(person.id);

    return allPeople.filter(p => p.id !== person.id && !descendants.has(p.id));
  };

  const eligiblePeople = getEligibleFamily();
  const fathers = eligiblePeople.filter(p => p.gender === 'male');
  const mothers = eligiblePeople.filter(p => p.gender === 'female');
  const spouses = eligiblePeople; // Spouses can be any gender

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { [key: string]: string } = {};

    if (!name.trim()) {
      newErrors.name = 'Full name is strictly required.';
    }

    if (dob && dod) {
      if (new Date(dob) > new Date(dod)) {
        newErrors.dod = 'Date of death cannot be earlier than the birthdate!';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Map fields
    const updatedPerson: Person = {
      id: person ? person.id : 'person-' + Math.random().toString(36).substr(2, 9),
      name: name.trim(),
      gender,
      dob: dob || null,
      dod: dod || null,
      photourl: photourl.trim() || null,
      notes: notes.trim() || null,
      birthPlace: birthPlace.trim() || null,
      occupation: occupation.trim() || null,
      fatherid: fatherid || null,
      motherid: motherid || null,
      spouseid: spouseid || null,
    };

    onSave(updatedPerson);
  };

  const handleDeleteClick = () => {
    if (person && onDelete && window.confirm(`Delete ${person.name}? This will remove this person from parent, child, and spouse links.`)) {
      onDelete(person.id);
    }
  };

  return (
    <>
      {/* Background Dim */}
      <div 
        className="fixed inset-0 bg-stone-900/55 z-50 transition-opacity backdrop-blur-xs cursor-pointer"
        onClick={onClose}
      />

      {/* Dialog box */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#fdfdfb] rounded-2xl w-full max-w-lg p-6 shadow-2xl z-50 border border-[var(--color-brand-border)] flex flex-col max-h-[90vh] overflow-y-auto font-sans">
        
        {/* Modal Title header */}
        <div className="flex items-center justify-between border-b border-[var(--color-brand-border)] pb-3 mb-4 shrink-0">
          <h3 className="text-lg font-serif font-black italic text-[var(--color-brand)]">
            {person ? `Edit Details: ${person.name}` : 'Add Family Member'}
          </h3>
          <button 
            onClick={onClose}
            className="text-[var(--color-brand)] hover:scale-110 active:scale-95 bg-white border border-[var(--color-brand-border)] rounded-full p-1 cursor-pointer transition-transform"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-semibold text-stone-700">
          
          {/* Main Info Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-stone-600 font-extrabold mb-1">Full Name *</label>
              <input 
                type="text" 
                value={name} 
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Rameshbhai Patel"
                className={`w-full px-3 py-2.5 rounded-xl border bg-white text-stone-900 font-semibold text-xs focus:ring-1 focus:ring-[var(--color-brand)] focus:outline-hidden ${
                  errors.name ? 'border-red-400 focus:ring-red-400' : 'border-[var(--color-brand-border)]'
                }`}
              />
              {errors.name && <p className="text-[10px] text-red-500 font-bold mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-stone-600 font-extrabold mb-1">Gender</label>
              <div className="grid grid-cols-3 gap-1 bg-[#fafaf7] border border-[var(--color-brand-border)] p-1 rounded-xl">
                {(['male', 'female', 'other'] as Gender[]).map(g => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`py-1.5 px-2 rounded-lg text-[9px] uppercase tracking-wider cursor-pointer transition-all ${
                      gender === g 
                        ? 'bg-[var(--color-brand)] text-white shadow-xs font-black' 
                        : 'text-stone-500 hover:text-stone-850'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Dates Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-stone-600 font-extrabold mb-1">Date of Birth</label>
              <input 
                type="date" 
                value={dob} 
                onChange={e => setDob(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-brand-border)] bg-white text-stone-900 font-semibold text-xs focus:ring-1 focus:ring-[var(--color-brand)] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-stone-600 font-extrabold mb-1 flex items-center gap-1.5">
                Date of Death
                <span className="text-[9px] text-stone-400 font-normal italic">(blank if living)</span>
              </label>
              <input 
                type="date" 
                value={dod} 
                onChange={e => setDod(e.target.value)}
                className={`w-full px-3 py-2.5 rounded-xl border bg-white text-stone-900 font-semibold text-xs focus:ring-1 focus:ring-[var(--color-brand)] focus:outline-hidden ${
                  errors.dod ? 'border-red-400 focus:ring-red-400' : 'border-[var(--color-brand-border)]'
                }`}
              />
              {errors.dod && <p className="text-[10px] text-red-500 font-bold mt-1">{errors.dod}</p>}
            </div>
          </div>

          {/* Background Meta Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-stone-600 font-extrabold mb-1">Birth Place / Village</label>
              <input 
                type="text" 
                value={birthPlace} 
                onChange={e => setBirthPlace(e.target.value)}
                placeholder="e.g. Anand, Gujarat"
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-brand-border)] bg-white text-stone-900 font-semibold text-xs focus:ring-1 focus:ring-[var(--color-brand)]"
              />
            </div>

            <div>
              <label className="block text-stone-600 font-extrabold mb-1">Work</label>
              <input 
                type="text" 
                value={occupation} 
                onChange={e => setOccupation(e.target.value)}
                placeholder="e.g. Farmer"
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-brand-border)] bg-white text-stone-900 font-semibold text-xs focus:ring-1 focus:ring-[var(--color-brand)]"
              />
            </div>
          </div>

          {/* Photo & Notes Row */}
          <div className="space-y-4">
            <div>
              <label className="block text-stone-600 font-extrabold mb-1 flex items-center justify-between">
                <span>Photo URL</span>
                <span className="text-[9px] text-stone-400 font-normal">Public image link</span>
              </label>
              <input 
                type="url" 
                value={photourl} 
                onChange={e => setPhotourl(e.target.value)}
                placeholder="https://images.unsplash.com/photo-..."
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-brand-border)] bg-white text-stone-900 font-mono text-[10px] focus:ring-1 focus:ring-[var(--color-brand)]"
              />
            </div>

            <div>
              <label className="block text-stone-600 font-extrabold mb-1">Notes</label>
              <textarea 
                value={notes} 
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Add simple family notes, village, work, or any memory..."
                className="w-full px-3 py-2 rounded-xl border border-[var(--color-brand-border)] bg-white text-stone-900 font-serif italic text-xs focus:ring-1 focus:ring-[var(--color-brand)]"
              />
            </div>
          </div>

          {/* Relationships Selector Area */}
          <div className="border-t border-[var(--color-brand-border)] pt-4 mt-6 space-y-4">
            <h4 className="text-xs font-serif font-bold italic tracking-wider text-[var(--color-brand)] mb-2 border-b border-[#f5f5f0] pb-1 flex items-center gap-1">
              Family Links
            </h4>

            {/* Parents Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-stone-600 font-extrabold mb-1">Father</label>
                <select
                  value={fatherid}
                  onChange={e => setFatherid(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--color-brand-border)] bg-white text-stone-900 font-semibold text-xs focus:ring-1 focus:ring-[var(--color-brand)] cursor-pointer"
                >
                  <option value="">-- No Father / Unknown --</option>
                  {fathers.map(f => (
                    <option key={f.id} value={f.id}>{f.name} ({f.dob ? f.dob.split('-')[0] : 'N/A'})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-stone-600 font-extrabold mb-1">Mother</label>
                <select
                  value={motherid}
                  onChange={e => setMotherid(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--color-brand-border)] bg-white text-stone-900 font-semibold text-xs focus:ring-1 focus:ring-[var(--color-brand)] cursor-pointer"
                >
                  <option value="">-- No Mother / Unknown --</option>
                  {mothers.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.dob ? m.dob.split('-')[0] : 'N/A'})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Spouse Link */}
            <div>
              <label className="block text-stone-600 font-extrabold mb-1.5 flex items-center justify-between">
                <span>Spouse / Husband / Wife</span>
                <span className="text-[9px] text-stone-400 font-normal">Shows spouse link in tree</span>
              </label>
              <select
                value={spouseid}
                onChange={e => setSpouseid(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[var(--color-brand-border)] bg-white text-stone-900 font-semibold text-xs focus:ring-1 focus:ring-[var(--color-brand)] cursor-pointer"
              >
                <option value="">-- No Spouse --</option>
                {spouses.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.dob ? s.dob.split('-')[0] : 'N/A'})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Submission Footer */}
          <div className="border-t border-[var(--color-brand-border)] pt-4 mt-6 flex items-center justify-between gap-3 shrink-0">
            {person && onDelete ? (
              <button
                type="button"
                onClick={handleDeleteClick}
                className="flex items-center gap-1.5 text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-150 border border-red-200 rounded-full px-4 py-2 text-xs font-bold cursor-pointer shrink-0 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Record
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold py-2 px-4 rounded-full text-xs cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-[var(--color-brand)] hover:bg-[var(--color-brand-dark)] text-white font-bold py-2 px-5 rounded-full text-xs flex items-center gap-1.5 shadow-sm hover:shadow-md transition-all cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Preserve Record
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
