/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { Person, SpouseRelation } from '../types';
import { X, Calendar, MapPin, Heart, ChevronRight, UserPlus, Briefcase, FileText, User, Camera } from 'lucide-react';

interface MemberProfileSheetProps {
  person: Person | null;
  isOpen: boolean;
  onClose: () => void;
  allPeople: Person[];
  onFocusMember: (id: string) => void;
  onEditMember: (person: Person) => void;
  onUploadPhoto: (person: Person, file: File) => Promise<void>;
  canEdit: boolean;
  onRequireUnlock: () => void;
}

export default function MemberProfileSheet({
  person,
  isOpen,
  onClose,
  allPeople,
  onFocusMember,
  onEditMember,
  onUploadPhoto,
  canEdit,
  onRequireUnlock,
}: MemberProfileSheetProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState('');

  if (!isOpen || !person) return null;

  const spouseRelations = normalizeSpouseRelations(person.spouses, person.spouseid);
  const father = person.fatherid ? allPeople.find(p => p.id === person.fatherid) : null;
  const mother = person.motherid ? allPeople.find(p => p.id === person.motherid) : null;
  
  // Find children (people who have this person as father or mother)
  const children = allPeople.filter(p => p.fatherid === person.id || p.motherid === person.id);

  // Find siblings (people who have the same father or mother, excluding self)
  const siblings = allPeople.filter(p => 
    p.id !== person.id && 
    ((person.fatherid && p.fatherid === person.fatherid) || 
     (person.motherid && p.motherid === person.motherid))
  );

  // Formatting date helper
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  // Age helper
  const getAge = (dobStr: string | null, dodStr?: string | null) => {
    if (!dobStr) return null;
    try {
      const dob = new Date(dobStr);
      const end = dodStr ? new Date(dodStr) : new Date();
      let age = end.getFullYear() - dob.getFullYear();
      const monthDiff = end.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < dob.getDate())) {
        age--;
      }
      return age;
    } catch {
      return null;
    }
  };

  const age = getAge(person.dob, person.dod);
  const initials = person.name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase() || '?';

  function normalizeSpouseRelations(relations: SpouseRelation[] | undefined, fallbackSpouseId?: string | null): SpouseRelation[] {
    const relationMap = new Map<string, SpouseRelation>();
    (relations || []).forEach(relation => {
      if (!relation.personId) return;
      relationMap.set(relation.personId, {
        personId: relation.personId,
        status: relation.status || 'current',
        startDate: relation.startDate || null,
        endDate: relation.endDate || null,
        childrenIds: relation.childrenIds || [],
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

  const handlePhotoButtonClick = () => {
    setPhotoUploadError('');
    if (!canEdit) {
      onRequireUnlock();
      return;
    }
    photoInputRef.current?.click();
  };

  const handlePhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsUploadingPhoto(true);
    setPhotoUploadError('');
    try {
      await onUploadPhoto(person, file);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Photo upload failed.';
      setPhotoUploadError(message);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  return (
    <>
      {/* Background Dim */}
      <div 
        className="fixed inset-0 bg-slate-900/40 z-[200] transition-opacity backdrop-blur-xs cursor-pointer"
        onClick={onClose}
      />

      {/* Slide sheet container */}
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-[#fdfdfb] shadow-2xl z-[201] flex flex-col border-l border-[var(--color-brand-border)] overflow-y-auto transform transition-transform duration-300">
        
        {/* Profile Header Block */}
        <div className="relative bg-[#fafaf7] text-stone-900 p-6 pt-10 pb-6 border-b border-[var(--color-brand-border)] shrink-0">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-[var(--color-brand)] hover:scale-110 active:scale-95 bg-white border border-[var(--color-brand-border)] rounded-full p-1.5 shadow-xs transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              {/* Huge Avatar - Artistic Flair style */}
              {person.photourl ? (
                <img 
                  src={person.photourl} 
                  alt={person.name}
                  referrerPolicy="no-referrer"
                  className="w-18 h-18 rounded-full object-cover border-2 border-[var(--color-brand)] shadow-sm bg-stone-100"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-18 h-18 rounded-full flex items-center justify-center text-xl font-serif font-black bg-[var(--color-brand)] text-white border-2 border-white shadow-sm">
                  {initials}
                </div>
              )}
              <button
                type="button"
                onClick={handlePhotoButtonClick}
                disabled={isUploadingPhoto}
                title={isUploadingPhoto ? 'Uploading photo...' : 'Upload photo'}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white border border-[var(--color-brand-border)] text-[var(--color-brand)] shadow-md flex items-center justify-center hover:bg-[var(--color-brand-light)] active:scale-95 transition-all cursor-pointer disabled:cursor-wait disabled:opacity-70"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelected}
                className="hidden"
              />
            </div>

            <div className="min-w-0 flex-1">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-widest uppercase mb-1 bg-[var(--color-brand-light)] text-[var(--color-brand)] border border-[var(--color-brand-border)]">
                {person.gender}
              </span>
              <h2 className="text-2xl font-serif font-extrabold tracking-tight text-stone-900 truncate leading-tight">
                {person.name}
              </h2>
              <p className="text-xs font-serif italic text-stone-600 mt-1">
                {person.dob ? `${person.dob.split('-')[0]} — ${person.dod ? person.dod.split('-')[0] : 'Present'}` : 'Dates not added'}
                {age !== null && ` • ${person.dod ? `Passed at age ${age}` : `${age} years old`}`}
              </p>
              {isUploadingPhoto && (
                <p className="text-[10px] font-bold text-[var(--color-brand)] mt-1">Uploading photo...</p>
              )}
              {photoUploadError && (
                <p className="text-[10px] font-bold text-red-600 mt-1">{photoUploadError}</p>
              )}
            </div>
          </div>
        </div>

        {/* Details Content Body */}
        <div className="flex-1 p-6 space-y-6">
          
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-3.5">
            <div className="bg-white rounded-xl p-3.5 border border-[var(--color-brand-border)] shadow-xs">
              <div className="flex items-center gap-1.5 text-[var(--color-brand-muted)] mb-1">
                <Calendar className="w-3.5 h-3.5 text-[var(--color-brand)]" />
                <span className="text-[10px] uppercase tracking-wider font-extrabold font-sans">Birth Date</span>
              </div>
              <p className="text-xs font-serif font-bold text-stone-800">{formatDate(person.dob)}</p>
            </div>

            <div className="bg-white rounded-xl p-3.5 border border-[var(--color-brand-border)] shadow-xs">
              <div className="flex items-center gap-1.5 text-[var(--color-brand-muted)] mb-1">
                <MapPin className="w-3.5 h-3.5 text-[var(--color-brand)]" />
                <span className="text-[10px] uppercase tracking-wider font-extrabold font-sans">Birth Place</span>
              </div>
              <p className="text-xs font-serif font-bold text-stone-800 truncate">{person.birthPlace || 'Not added'}</p>
            </div>

            <div className="bg-white rounded-xl p-3.5 border border-[var(--color-brand-border)] shadow-xs">
              <div className="flex items-center gap-1.5 text-[var(--color-brand-muted)] mb-1">
                <Briefcase className="w-3.5 h-3.5 text-[var(--color-brand)]" />
                <span className="text-[10px] uppercase tracking-wider font-extrabold font-sans">Work</span>
              </div>
              <p className="text-xs font-serif font-bold text-stone-800 truncate">{person.occupation || 'Not added'}</p>
            </div>

            <div className="bg-white rounded-xl p-3.5 border border-[var(--color-brand-border)] shadow-xs">
              <div className="flex items-center gap-1.5 text-[var(--color-brand-muted)] mb-1">
                <User className="w-3.5 h-3.5 text-[var(--color-brand)]" />
                <span className="text-[10px] uppercase tracking-wider font-extrabold font-sans">Status</span>
              </div>
              <p className="text-xs font-serif font-bold text-stone-800">
                {person.dod ? `Passed Away` : 'Living'}
              </p>
            </div>
          </div>

          {/* Biography Notes */}
          {person.notes && (
            <div className="bg-[#fafaf7] rounded-xl p-4 border border-[var(--color-brand-border)]">
              <div className="flex items-center gap-1.5 text-[var(--color-brand-muted)] mb-2">
                <FileText className="w-4 h-4 text-[var(--color-brand)]" />
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#5A5A40]">NOTES</span>
              </div>
              <p className="text-xs text-[#4A4A4A] leading-relaxed italic font-serif whitespace-pre-wrap">
                "{person.notes}"
              </p>
            </div>
          )}

          {/* Relational Quick Views */}
          <div className="space-y-4 pt-1">
            <h3 className="text-xs font-serif font-bold italic tracking-wide text-[var(--color-brand)] mb-3 border-b border-[var(--color-brand-border)] pb-1.5">
              Family Details
            </h3>

            {/* Spouses */}
            <div className="bg-white rounded-xl border border-[var(--color-brand-border)] shadow-2xs p-3 space-y-2">
              <p className="text-[9px] text-[var(--color-brand-muted)] font-black uppercase tracking-wider border-b border-[#f5f5f0] pb-1">
                SPOUSES ({spouseRelations.length})
              </p>
              {spouseRelations.length > 0 ? spouseRelations.map(relation => {
                const spouse = allPeople.find(p => p.id === relation.personId);
                const relationChildren = (relation.childrenIds || [])
                  .map(childId => allPeople.find(p => p.id === childId))
                  .filter((child): child is Person => !!child);
                return (
                  <div key={relation.personId} className="flex items-start justify-between gap-2 py-1.5 border-b border-stone-50 last:border-0">
                    <div className="flex items-start gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-[var(--color-brand-light)] border border-[var(--color-brand-border)] flex items-center justify-center text-[var(--color-brand)] shrink-0">
                        <Heart className="w-4 h-4 fill-[var(--color-brand)] text-[var(--color-brand)]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-serif font-bold text-stone-800 truncate">
                          {spouse ? spouse.name : 'Unknown spouse'}
                        </p>
                        <p className="text-[10px] text-stone-400 font-bold uppercase">
                          {relation.status || 'current'}{relation.startDate ? ` • ${relation.startDate}` : ''}{relation.endDate ? ` - ${relation.endDate}` : ''}
                        </p>
                        {relationChildren.length > 0 && (
                          <p className="text-[10px] text-stone-500 mt-1">
                            Children: {relationChildren.map(child => child.name).join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                    {spouse && (
                      <button
                        onClick={() => onFocusMember(spouse.id)}
                        className="p-1 px-1.5 text-xs text-[var(--color-brand)] hover:bg-[var(--color-brand-light)] rounded-lg border border-transparent hover:border-[var(--color-brand-border)] transition-all cursor-pointer font-serif italic shrink-0"
                        title="Center on Tree"
                      >
                        Go to <ChevronRight className="inline w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              }) : (
                <p className="text-[11px] text-stone-400 italic font-serif">No spouse recorded</p>
              )}
            </div>

            {/* Parents Row */}
            <div className="grid grid-cols-2 gap-3.5">
              {/* Father */}
              <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-[var(--color-brand-border)] shadow-2xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center text-[9px] font-bold text-stone-600">
                    FA
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] text-[var(--color-brand-muted)] font-black uppercase leading-none mb-1">Father</p>
                    <p className="text-xs font-serif font-bold text-stone-700 truncate">
                      {father ? father.name : 'Unknown'}
                    </p>
                  </div>
                </div>
                {father && (
                  <button 
                    onClick={() => onFocusMember(father.id)}
                    className="p-1 text-[var(--color-brand)] hover:scale-105 transition-all cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Mother */}
              <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-[var(--color-brand-border)] shadow-2xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-[var(--color-brand-light)] border border-[var(--color-brand-border)] flex items-center justify-center text-[9px] font-bold text-[var(--color-brand)]">
                    MO
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] text-[var(--color-brand-muted)] font-black uppercase leading-none mb-1">Mother</p>
                    <p className="text-xs font-serif font-bold text-stone-700 truncate">
                      {mother ? mother.name : 'Unknown'}
                    </p>
                  </div>
                </div>
                {mother && (
                  <button 
                    onClick={() => onFocusMember(mother.id)}
                    className="p-1 text-[var(--color-brand)] hover:scale-105 transition-all cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Siblings */}
            <div className="bg-white rounded-xl border border-[var(--color-brand-border)] p-3 shadow-2xs">
              <p className="text-[9px] text-[var(--color-brand-muted)] font-black uppercase tracking-wider mb-2 border-b border-[#f5f5f0] pb-1">
                SIBLINGS ({siblings.length})
              </p>
              {siblings.length > 0 ? (
                <div className="space-y-1">
                  {siblings.map(sib => (
                    <div key={sib.id} className="flex items-center justify-between text-xs py-1.5 border-b border-stone-50 last:border-0">
                      <span className="text-stone-800 font-serif font-semibold truncate pr-2">{sib.name}</span>
                      <button 
                        onClick={() => onFocusMember(sib.id)}
                        className="text-[10px] text-[var(--color-brand)] hover:underline cursor-pointer flex items-center shrink-0 font-serif italic font-bold"
                      >
                        View <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-stone-400 italic font-serif">No siblings recorded</p>
              )}
            </div>

            {/* Children */}
            <div className="bg-white rounded-xl border border-[var(--color-brand-border)] p-3 shadow-2xs">
              <p className="text-[9px] text-[var(--color-brand-muted)] font-black uppercase tracking-wider mb-2 border-b border-[#f5f5f0] pb-1">
                CHILDREN ({children.length})
              </p>
              {children.length > 0 ? (
                <div className="space-y-1">
                  {children.map(kid => (
                    <div key={kid.id} className="flex items-center justify-between text-xs py-1.5 border-b border-stone-50 last:border-0">
                      <span className="text-stone-800 font-serif font-semibold truncate pr-2">{kid.name}</span>
                      <button 
                        onClick={() => onFocusMember(kid.id)}
                        className="text-[10px] text-[var(--color-brand)] hover:underline cursor-pointer flex items-center shrink-0 font-serif italic font-bold"
                      >
                        View <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-stone-400 italic font-serif">No children recorded</p>
              )}
            </div>
          </div>
        </div>

        {/* Action controls footer */}
        <div className="p-5 border-t border-[var(--color-brand-border)] bg-[#fafaf7] flex flex-col gap-2 shrink-0">
          <button
            onClick={() => onEditMember(person)}
            className="w-full bg-[var(--color-brand)] hover:bg-[var(--color-brand-dark)] text-white font-extrabold py-2.5 px-4 rounded-full text-center text-xs tracking-wider uppercase transition-all shadow-xs cursor-pointer hover:shadow-md"
          >
            Edit Details
          </button>
          <button
            onClick={() => {
              onFocusMember(person.id);
              onClose();
            }}
            className="w-full bg-white hover:bg-[var(--color-brand-light)] text-[var(--color-brand)] border border-[var(--color-brand-border)] font-bold py-2.5 px-4 rounded-full text-xs transition-colors truncate cursor-pointer"
          >
            Show in Tree
          </button>
        </div>
      </div>
    </>
  );
}
