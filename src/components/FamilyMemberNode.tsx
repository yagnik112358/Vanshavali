/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Person } from '../types';
import { Sparkles, MapPin, Heart, ChevronDown } from 'lucide-react';

interface FamilyMemberNodeProps {
  data: {
    person: Person;
    isFocused: boolean;
    onViewProfile: (p: Person) => void;
    onEditMember: (p: Person) => void;
    onFocusSelect: (id: string | null) => void;
  };
}

// Calculate age helper
function obtainAgeString(dobString: string | null, dodString?: string | null): string {
  if (!dobString) return '';
  try {
    const dob = new Date(dobString);
    const end = dodString ? new Date(dodString) : new Date();
    
    if (isNaN(dob.getTime())) return '';
    
    let age = end.getFullYear() - dob.getFullYear();
    const monthDiff = end.getMonth() - dob.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < dob.getDate())) {
      age--;
    }
    
    if (dodString) {
      return `Passed away at ${age}`;
    }
    return `${age} years old`;
  } catch {
    return '';
  }
}

// Year scope helper
function obtainYearRange(dob: string | null, dod?: string | null): string {
  if (!dob) return 'Unknown - Present';
  const birthYear = dob.split('-')[0] || 'Unknown';
  if (dod) {
    const deathYear = dod.split('-')[0] || 'Present';
    return `${birthYear} - ${deathYear}`;
  }
  return `${birthYear} - Present`;
}

export const FamilyMemberNode = memo(({ data }: FamilyMemberNodeProps) => {
  const { person, isFocused, onViewProfile, onEditMember, onFocusSelect } = data;

  // Custom visual settings based on gender with warm earthy "Artistic Flair" palette
  const genderConfigs = {
    male: {
      accentBorder: 'border-l-stone-600',
      avatarBg: 'bg-stone-100 text-stone-800 border-stone-200',
      badgeClass: 'bg-stone-50 text-stone-800 border-stone-100',
      genderLabel: 'Male',
    },
    female: {
      accentBorder: 'border-l-[var(--color-brand)]',
      avatarBg: 'bg-[var(--color-brand-light)] text-[var(--color-brand)] border-[var(--color-brand-border)]',
      badgeClass: 'bg-[var(--color-brand-beige)] text-[var(--color-brand)] border-[var(--color-brand-border)]',
      genderLabel: 'Female',
    },
    other: {
      accentBorder: 'border-l-slate-400',
      avatarBg: 'bg-slate-100 text-slate-800 border-slate-200',
      badgeClass: 'bg-slate-50 text-slate-800 border-slate-100',
      genderLabel: 'Non-Binary',
    },
  };

  const config = genderConfigs[person.gender] || genderConfigs.other;

  // Get initials for avatar fallback
  const initials = person.name
    .split(' ')
    .slice(0, 2)
    .map(name => name[0])
    .join('')
    .toUpperCase() || '?';

  return (
    <div className="nodrag">
      {/* Target handle at top for parent-child lines */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        style={{ background: '#5A5A40', width: 10, height: 10, border: '2px solid white' }}
      />
      
      {/* Handle on Left for spouse connections */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{ background: '#5A5A40', width: 8, height: 8, border: '1.5px solid white' }}
      />

      <div
        style={{ width: '280px' }}
        className={`bg-white rounded-xl shadow-xs border-l-4 ${config.accentBorder} p-3.5 text-slate-800 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 border border-[var(--color-brand-border)] ${
          isFocused ? 'ring-2 ring-[var(--color-brand)] ring-offset-2' : ''
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Circular avatar with picture or gendered initials */}
          {person.photourl ? (
            <img
              src={person.photourl}
              alt={person.name}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-full object-cover border border-[var(--color-brand-border)] bg-slate-50 flex-shrink-0"
              onError={(e) => {
                // Remove photourl so avatar fallback triggers
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xs font-serif font-bold border ${config.avatarBg} flex-shrink-0`}>
              {initials}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-serif font-bold text-[#1a1a1a] truncate leading-tight mb-0.5">
              {person.name}
            </h4>
            
            <p className="text-[10px] text-[var(--color-brand-muted)] font-medium uppercase tracking-wider">
              {obtainYearRange(person.dob, person.dod)}
            </p>

            {person.occupation && (
              <p className="text-[10px] text-slate-500 truncate flex items-center gap-1 mt-0.5 font-medium">
                <Sparkles className="w-2.5 h-2.5 text-[var(--color-brand)]" />
                {person.occupation}
              </p>
            )}
          </div>
        </div>

        {/* Mini action toolbar inside the card for premium touch control */}
        <div className="flex items-center justify-between border-t border-[var(--color-brand-light)] mt-2.5 pt-2">
          <button
            onClick={() => onViewProfile(person)}
            className="text-[10px] text-[var(--color-brand)] hover:text-[var(--color-brand-dark)] font-bold px-1 rounded hover:bg-stone-50 transition-colors shrink-0 cursor-pointer"
          >
            Details
          </button>

          <div className="flex gap-1.5">
            <button
              onClick={() => onEditMember(person)}
              className="text-[10px] text-stone-500 hover:text-stone-800 font-bold px-1 rounded hover:bg-stone-55 transition-colors cursor-pointer"
            >
              Edit
            </button>
            <button
              onClick={() => onFocusSelect(isFocused ? null : person.id)}
              className={`text-[9px] flex items-center gap-0.5 font-black uppercase tracking-wider px-2 py-0.5 rounded cursor-pointer transition-colors ${
                isFocused
                  ? 'bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]'
                  : 'bg-[var(--color-brand-light)] text-[var(--color-brand)] hover:bg-[var(--color-brand-border)]'
              }`}
            >
              Show
            </button>
          </div>
        </div>
      </div>

      {/* Handle on Right for spouse connections */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{ background: '#5A5A40', width: 8, height: 8, border: '1.5px solid white' }}
      />

      {/* Source handle at bottom for parent-child lines */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={{ background: '#5A5A40', width: 10, height: 10, border: '2px solid white' }}
      />
    </div>
  );
});

FamilyMemberNode.displayName = 'FamilyMemberNode';
