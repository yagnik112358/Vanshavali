/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Person, Gender, SpouseRelation, SpouseStatus } from '../types';
import { uploadPersonPhoto } from '../lib/db';
import { X, Save, Trash2, Upload, Image as ImageIcon } from 'lucide-react';

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
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState('');
  const [notes, setNotes] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [occupation, setOccupation] = useState('');
  
  // Relations
  const [fatherid, setFatherid] = useState<string>('');
  const [motherid, setMotherid] = useState<string>('');
  const [spouseid, setSpouseid] = useState<string>('');
  const [spouseRelations, setSpouseRelations] = useState<SpouseRelation[]>([]);

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (isOpen) {
      setErrors({});
      setPhotoFile(null);
      setPhotoUploadError('');
      setUploadingPhoto(false);
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
        setSpouseRelations(normalizeSpouseRelations(person.spouses, person.spouseid));
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
        setSpouseRelations([]);

        // Apply pre-fill relationship presets if they were requested (e.g. from context quick buttons)
        if (relationPreset) {
          const { type, relativeId } = relationPreset;
          const relative = allPeople.find(p => p.id === relativeId);
          if (relative) {
            if (type === 'spouse') {
              setSpouseid(relativeId);
              setSpouseRelations([{ personId: relativeId, status: 'current', startDate: null, endDate: null, childrenIds: [] }]);
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

  function normalizeSpouseRelations(relations: SpouseRelation[] | undefined, fallbackSpouseId?: string | null): SpouseRelation[] {
    const relationMap = new Map<string, SpouseRelation>();

    (relations || []).forEach(relation => {
      if (!relation.personId) return;
      relationMap.set(relation.personId, {
        personId: relation.personId,
        status: relation.status || 'current',
        startDate: relation.startDate || null,
        endDate: relation.endDate || null,
        childrenIds: Array.from(new Set(relation.childrenIds || [])),
      });
    });

    if (fallbackSpouseId && !relationMap.has(fallbackSpouseId)) {
      relationMap.set(fallbackSpouseId, {
        personId: fallbackSpouseId,
        status: 'current',
        startDate: null,
        endDate: null,
        childrenIds: [],
      });
    }

    return Array.from(relationMap.values());
  }

  const addSpouseRelation = () => {
    setSpouseRelations(prev => [
      ...prev,
      { personId: '', status: 'current', startDate: null, endDate: null, childrenIds: [] },
    ]);
  };

  const updateSpouseRelation = (index: number, updates: Partial<SpouseRelation>) => {
    setSpouseRelations(prev => prev.map((relation, relationIndex) => (
      relationIndex === index ? { ...relation, ...updates } : relation
    )));
  };

  const removeSpouseRelation = (index: number) => {
    setSpouseRelations(prev => prev.filter((_, relationIndex) => relationIndex !== index));
  };

  const getChildOptionsForRelation = (relation: SpouseRelation): Person[] => {
    const selectedChildren = new Set(relation.childrenIds || []);
    const spouse = allPeople.find(p => p.id === relation.personId);
    const hasMaleParent = gender === 'male' || spouse?.gender === 'male';
    const hasFemaleParent = gender === 'female' || spouse?.gender === 'female';

    return allPeople.filter(candidate => {
      if (candidate.id === person?.id || candidate.id === relation.personId) return false;
      if (selectedChildren.has(candidate.id)) return true;
      if (hasMaleParent && candidate.fatherid) return false;
      if (hasFemaleParent && candidate.motherid) return false;
      return true;
    });
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
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

    const personId = person ? person.id : 'person-' + Math.random().toString(36).substr(2, 9);
    let finalPhotoUrl = photourl.trim() || null;

    if (photoFile) {
      setUploadingPhoto(true);
      setPhotoUploadError('');
      try {
        finalPhotoUrl = await uploadPersonPhoto(photoFile, personId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Photo upload failed.';
        setPhotoUploadError(message);
        setUploadingPhoto(false);
        return;
      }
      setUploadingPhoto(false);
    }

    const cleanSpouseRelations = normalizeSpouseRelations(spouseRelations);
    const primarySpouseId = cleanSpouseRelations.find(relation => relation.status === 'current')?.personId || cleanSpouseRelations[0]?.personId || null;

    // Map fields
    const updatedPerson: Person = {
      id: personId,
      name: name.trim(),
      gender,
      dob: dob || null,
      dod: dod || null,
      photourl: finalPhotoUrl,
      notes: notes.trim() || null,
      birthPlace: birthPlace.trim() || null,
      occupation: occupation.trim() || null,
      fatherid: fatherid || null,
      motherid: motherid || null,
      spouseid: primarySpouseId,
      spouses: cleanSpouseRelations,
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
        className="fixed inset-0 bg-stone-900/55 z-[200] transition-opacity backdrop-blur-xs cursor-pointer"
        onClick={onClose}
      />

      {/* Dialog box */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#fdfdfb] rounded-2xl w-full max-w-lg p-6 shadow-2xl z-[201] border border-[var(--color-brand-border)] flex flex-col max-h-[90vh] overflow-y-auto font-sans">
        
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
                <span>Photo</span>
                <span className="text-[9px] text-stone-400 font-normal">Upload image or paste link</span>
              </label>
              <label className="w-full px-3 py-3 rounded-xl border border-dashed border-[var(--color-brand-border)] bg-[#fafaf7] text-stone-700 font-bold text-xs cursor-pointer flex items-center justify-center gap-2 hover:bg-white transition-colors">
                <Upload className="w-4 h-4 text-[var(--color-brand)]" />
                <span>{photoFile ? photoFile.name : 'Choose photo from device'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => {
                    const file = e.target.files?.[0] || null;
                    setPhotoFile(file);
                    setPhotoUploadError('');
                  }}
                  className="hidden"
                />
              </label>
              {photourl && (
                <div className="mt-2 flex items-center gap-2 text-[10px] text-stone-500">
                  <ImageIcon className="w-3.5 h-3.5 text-[var(--color-brand)]" />
                  Current photo is saved.
                </div>
              )}
              {photoUploadError && (
                <p className="text-[10px] text-red-600 font-bold mt-1">{photoUploadError}</p>
              )}
              <input 
                type="url" 
                value={photourl} 
                onChange={e => setPhotourl(e.target.value)}
                placeholder="Or paste photo link"
                className="w-full mt-2 px-3 py-2.5 rounded-xl border border-[var(--color-brand-border)] bg-white text-stone-900 font-mono text-[10px] focus:ring-1 focus:ring-[var(--color-brand)]"
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

            {/* Spouse Links */}
            <div>
              <label className="block text-stone-600 font-extrabold mb-1.5 flex items-center justify-between">
                <span>Spouses / Husband / Wife</span>
                <button
                  type="button"
                  onClick={addSpouseRelation}
                  className="text-[10px] text-[var(--color-brand)] font-black hover:underline cursor-pointer"
                >
                  + Add spouse
                </button>
              </label>
              <div className="space-y-3">
                {spouseRelations.length === 0 ? (
                  <p className="text-[11px] text-stone-400 italic font-serif bg-white border border-dashed border-[var(--color-brand-border)] rounded-xl p-3">
                    No spouse recorded. Use Add spouse to add current or past spouse relations.
                  </p>
                ) : spouseRelations.map((relation, index) => (
                  <div key={`${relation.personId || 'new'}-${index}`} className="bg-white border border-[var(--color-brand-border)] rounded-xl p-3 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px] gap-2">
                      <select
                        value={relation.personId}
                        onChange={e => updateSpouseRelation(index, { personId: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-[var(--color-brand-border)] bg-white text-stone-900 font-semibold text-xs focus:ring-1 focus:ring-[var(--color-brand)] cursor-pointer"
                      >
                        <option value="">-- Select spouse --</option>
                        {spouses.map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.dob ? s.dob.split('-')[0] : 'N/A'})</option>
                        ))}
                      </select>
                      <select
                        value={relation.status || 'current'}
                        onChange={e => updateSpouseRelation(index, { status: e.target.value as SpouseStatus })}
                        className="w-full px-2 py-2 rounded-xl border border-[var(--color-brand-border)] bg-white text-stone-900 font-semibold text-xs cursor-pointer"
                      >
                        <option value="current">Current</option>
                        <option value="former">Former</option>
                        <option value="widowed">Widowed</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={relation.startDate || ''}
                        onChange={e => updateSpouseRelation(index, { startDate: e.target.value || null })}
                        className="w-full px-3 py-2 rounded-xl border border-[var(--color-brand-border)] bg-white text-stone-900 font-semibold text-xs"
                        aria-label="Spouse relationship start date"
                      />
                      <input
                        type="date"
                        value={relation.endDate || ''}
                        onChange={e => updateSpouseRelation(index, { endDate: e.target.value || null })}
                        className="w-full px-3 py-2 rounded-xl border border-[var(--color-brand-border)] bg-white text-stone-900 font-semibold text-xs"
                        aria-label="Spouse relationship end date"
                      />
                    </div>
                    <label className="block text-[10px] text-stone-500 font-bold">
                      Children in this relationship
                    </label>
                    <select
                      multiple
                      value={relation.childrenIds || []}
                      onChange={e => updateSpouseRelation(index, {
                        childrenIds: Array.from(e.currentTarget.selectedOptions as HTMLCollectionOf<HTMLOptionElement>).map(option => option.value),
                      })}
                      className="w-full min-h-20 px-3 py-2 rounded-xl border border-[var(--color-brand-border)] bg-white text-stone-900 font-semibold text-xs cursor-pointer"
                    >
                      {getChildOptionsForRelation(relation).map(child => (
                        <option key={child.id} value={child.id}>{child.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeSpouseRelation(index)}
                      className="text-[10px] text-red-600 font-black hover:underline cursor-pointer"
                    >
                      Remove spouse relation
                    </button>
                  </div>
                ))}
              </div>
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
                disabled={uploadingPhoto}
                className="bg-[var(--color-brand)] hover:bg-[var(--color-brand-dark)] text-white font-bold py-2 px-5 rounded-full text-xs flex items-center gap-1.5 shadow-sm hover:shadow-md transition-all cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                {uploadingPhoto ? 'Uploading Photo...' : 'Preserve Record'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
