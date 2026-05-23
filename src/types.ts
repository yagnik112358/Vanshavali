/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Gender = 'male' | 'female' | 'other';

export interface Person {
  id: string;
  name: string;
  gender: Gender;
  fatherid: string | null;  // supports both snake_case father_id & camelCase
  motherid: string | null;  // supports both snake_case mother_id & camelCase
  spouseid: string | null;  // supports both snake_case spouse_id & camelCase
  dob: string | null;       // Date of Birth: YYYY-MM-DD
  dod?: string | null;      // Date of Death (optional additions for robust historical logs)
  photourl: string | null;  // Photo URL
  notes: string | null;     // General notes
  
  // Helpers for mapping UI state
  birthPlace?: string;
  occupation?: string;
}

export interface TreeFilterOptions {
  focusPersonId: string | null;
  maxGenerations: number; // 1 to 5 generations
  showSpouses: boolean;
  showSiblings: boolean;
  genderFilter: 'all' | 'male' | 'female' | 'other';
  searchQuery: string;
}

export interface SupabaseConfig {
  url: string | null;
  anonKey: string | null;
  isConnected: boolean;
}
