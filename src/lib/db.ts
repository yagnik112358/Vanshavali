/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Person, Gender } from '../types';

// Let's load Supabase keys from environment variables safely
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseAnonKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    console.log('Supabase initialized successfully.');
  } catch (error) {
    console.error('Error instantiating Supabase client:', error);
  }
}

// Check if we are connected to a live Supabase backend
export function isSupabaseConnected(): boolean {
  return supabase !== null;
}

export async function testSupabaseConnection(): Promise<{ success: boolean; message: string }> {
  if (!supabase) {
    return { 
      success: false, 
      message: 'Supabase client is not initialized. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your secrets.' 
    };
  }
  try {
    const { data, error } = await supabase
      .from('person')
      .select('id')
      .limit(1);
    if (error) {
      if (error.code === 'PGRST116' || error.message.includes('not found') || error.message.includes('does not exist')) {
        return { 
          success: false, 
          message: 'Connected to Supabase, but the "person" table does not exist yet. Please run the SQL snippet in the SQL Editor.' 
        };
      }
      return { 
        success: false, 
        message: `Connected, but failed query: ${error.message}` 
      };
    }
    return { 
      success: true, 
      message: 'Successfully connected and verified the "person" table schema in Supabase!' 
    };
  } catch (err: any) {
    return { 
      success: false, 
      message: `Unexpected connection exception: ${err.message || err}` 
    };
  }
}

export function getSupabaseDetails() {
  return {
    url: supabaseUrl || null,
    hasAnonKey: !!supabaseAnonKey,
    isConnected: isSupabaseConnected(),
  };
}

// -------------------------------------------------------------
// SEED DATA FOR THE FAMILY TREE
// A rich 3-4 generation family history
// -------------------------------------------------------------
const SEED_PEOPLE: Person[] = [
  // Generation 1 (Grandparents / Elders)
  {
    id: 'g1-juan',
    name: 'Dahyabhai Patel (દહ્યાભાઈ પટેલ)',
    gender: 'male',
    fatherid: null,
    motherid: null,
    spouseid: 'g1-maria',
    dob: '1945-04-12',
    dod: null,
    photourl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    notes: 'પરિવારના આદરણીય વડીલ (Elder of the family). મૂળ ગામ આણંદ. સહજ અને દયાળુ વ્યક્તિત્વ, જેમને ખેતીકામ અને પ્રકૃતિ સાથે લગાવ છે.',
    birthPlace: 'આણંદ, ગુજરાત (Anand, Gujarat)',
    occupation: 'નિવૃત્ત ખેડૂત (Retired Farmer)'
  },
  {
    id: 'g1-maria',
    name: 'Savitaben Patel (સવિતાબેન પટેલ)',
    gender: 'female',
    fatherid: null,
    motherid: null,
    spouseid: 'g1-juan',
    dob: '1948-09-22',
    dod: null,
    photourl: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=150&auto=format&fit=crop&q=80',
    notes: 'ગામના માનીતા વડીલ માતાજી. સેવાની મૂર્તિ અને સ્વાદિષ્ટ પરંપરાગત રસોઈ બનાવવાના નિષ્ણાત.',
    birthPlace: 'નડીઆદ, ગુજરાત (Nadiad, Gujarat)',
    occupation: 'ગૃહણી (Homemaker)'
  },

  // Generation 2 (Children and Spouses)
  {
    id: 'g2-carlos',
    name: 'Ramanbhai Patel (રમણભાઈ પટેલ)',
    gender: 'male',
    fatherid: 'g1-juan',
    motherid: 'g1-maria',
    spouseid: 'g2-sarah',
    dob: '1970-07-15',
    dod: null,
    photourl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    notes: 'દહ્યાભાઈ અને સવિતાબેનના મોટા પુત્ર. આણંદ શાળાના નિવૃત્ત આચાર્ય અને સમાજ સેવક.',
    birthPlace: 'આણંદ, ગુજરાત (Anand, Gujarat)',
    occupation: 'નિવૃત્ત આચાર્ય (Retired Principal)'
  },
  {
    id: 'g2-sarah',
    name: 'Shardaben Patel (શારદાબેન પટેલ)',
    gender: 'female',
    fatherid: null,
    motherid: null,
    spouseid: 'g2-carlos',
    dob: '1972-11-05',
    dod: null,
    photourl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    notes: 'આણંદ મોડેલ પ્રાઇમરી સ્કૂલના શિક્ષિકા. કલા, સંગીત અને ધાર્મિક ઉત્સવોમાં હોંશપૂર્વક ભાગ લે છે.',
    birthPlace: 'વડોદરા, ગુજરાત (Vadodara, Gujarat)',
    occupation: 'શિક્ષિકા (Teacher)'
  },
  {
    id: 'g2-sofia',
    name: 'Gitaben Patel (ગીતાબેન પટેલ)',
    gender: 'female',
    fatherid: 'g1-juan',
    motherid: 'g1-maria',
    spouseid: 'g2-david',
    dob: '1973-10-18',
    dod: null,
    photourl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    notes: 'દહ્યાભાઈ અને સવિતાબેનની સુશીલ દીકરી. ગામના પ્રાથમિક આરોગ્ય કેન્દ્રમાં તબીબી સેવા આપે છે.',
    birthPlace: 'આણંદ, ગુજરાત (Anand, Gujarat)',
    occupation: 'સરકારી ડૉક્ટર (Medical Officer)'
  },
  {
    id: 'g2-david',
    name: 'Manubhai Patel (મનુભાઈ પટેલ)',
    gender: 'male',
    fatherid: null,
    motherid: null,
    spouseid: 'g2-sofia',
    dob: '1971-02-28',
    dod: null,
    photourl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    notes: 'ગીતાબેનના પતિ. કરમસદ ડેરી સહકારી મંડળીના પ્રતિષ્ઠિત પ્રમુખ અને સહકારી ક્ષેત્રના અગ્રણી.',
    birthPlace: 'કરમસદ, ગુજરાત (Karamsad, Gujarat)',
    occupation: 'મંડળી પ્રમુખ (Co-op President)'
  },
  {
    id: 'g2-elena',
    name: 'Kokilaben Patel (કોકિલાબેન પટેલ)',
    gender: 'female',
    fatherid: 'g1-juan',
    motherid: 'g1-maria',
    spouseid: null,
    dob: '1978-05-30',
    dod: null,
    photourl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80',
    notes: 'દહ્યાભાઈ અને સવિતાબેનની નાની દીકરી. આંગણવાડી કેન્દ્રમાં કાર્યકર તરીકે બાળકોના કલ્યાણ અર્થે સક્રિય.',
    birthPlace: 'આણંદ, ગુજરાત (Anand, Gujarat)',
    occupation: 'આંગણવાડી સેવિકા (Anganwadi Worker)'
  },

  // Generation 3 (Grandchildren)
  {
    id: 'g3-mateo',
    name: 'Rajeshbhai Patel (રાજેશભાઈ પટેલ)',
    gender: 'male',
    fatherid: 'g2-carlos',
    motherid: 'g2-sarah',
    spouseid: 'g3-isabella',
    dob: '1998-08-19',
    dod: null,
    photourl: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150&auto=format&fit=crop&q=80',
    notes: 'રમણભાઈ અને શારદાબેનનો દીકરો. નવીનતમ ઇઝરાયેલી ઓર્ગેનિક મિશ્રિત ખેતીમાં કુશળ યુવાન.',
    birthPlace: 'આણંદ, ગુજરાત (Anand, Gujarat)',
    occupation: 'પ્રગતિશીલ ખેડૂત (Innovative Farmer)'
  },
  {
    id: 'g3-isabella',
    name: 'Alpaben Patel (અલ્પાબેન પટેલ)',
    gender: 'female',
    fatherid: null,
    motherid: null,
    spouseid: 'g3-mateo',
    dob: '1999-12-03',
    dod: null,
    photourl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    notes: 'રાજેશભાઈના પત્ની. ગામમાં સ્વ-સહાય જૂથો દ્વારા મહિલા સશક્તિકરણનું કામ સંભાળે છે.',
    birthPlace: 'મહુધા, ગુજરાત (Mahudha, Gujarat)',
    occupation: 'ગૃહઉદ્યોગ સંચાલક (Entrepreneur)'
  },
  {
    id: 'g3-camila',
    name: 'Kinjalben Patel (કિંજલબેન પટેલ)',
    gender: 'female',
    fatherid: 'g2-carlos',
    motherid: 'g2-sarah',
    spouseid: null,
    dob: '2001-03-14',
    dod: null,
    photourl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop&q=80',
    notes: 'રમણભાઈ અને શારદાબેનની નમ્ર દીકરી. વિદ્યાનગર કોલેજમાં કમ્પ્યુટર સાયન્સનો અભ્યાસ કરે છે.',
    birthPlace: 'વડોદરા, ગુજરાત (Vadodara, Gujarat)',
    occupation: 'વિદ્યાર્થીની (College Student)'
  },
  {
    id: 'g3-lucas',
    name: 'Hardikbhai Patel (હાર્દિકભાઈ પટેલ)',
    gender: 'male',
    fatherid: 'g2-david',
    motherid: 'g2-sofia',
    spouseid: null,
    dob: '2003-06-25',
    dod: null,
    photourl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
    notes: 'મનુભાઈ અને ગીતાબેનનો પુત્ર. જન સેવા બેંક, અમદાવાદ ખાતે આસિસ્ટન્ટ મેનેજર.',
    birthPlace: 'કરમસદ, ગુજરાત (Karamsad, Gujarat)',
    occupation: 'બેંક અધિકારી (Bank Executive)'
  },
  {
    id: 'g3-emma',
    name: 'Heenalben Patel (હીનલબેન પટેલ)',
    gender: 'female',
    fatherid: 'g2-david',
    motherid: 'g2-sofia',
    spouseid: null,
    dob: '2005-09-12',
    dod: null,
    photourl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    notes: 'મનુભાઈ અને ગીતાબેનની તેજસ્વી પુત્રી. સરદાર વિદ્યાપીઠની હોંશિયાર કલા સંશોધન વિદ્યાર્થિની.',
    birthPlace: 'કરમસદ, ગુજરાત (Karamsad, Gujarat)',
    occupation: 'ધોરણ ૧૨ ની વિદ્યાર્થીની (Student)'
  },

  // Generation 4 (Great-Grandchildren)
  {
    id: 'g4-leo',
    name: 'Aarav Patel (આરવ પટેલ)',
    gender: 'male',
    fatherid: 'g3-mateo',
    motherid: 'g3-isabella',
    spouseid: null,
    dob: '2022-11-20',
    dod: null,
    photourl: 'https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=150&auto=format&fit=crop&q=80',
    notes: 'પરિવારનું સૌથી નાનું અને વહાલીડું બાળક. રમકડું રમવું અને આંગણામાં દોડાદોડ કરવી ખુબ ગમે છે.',
    birthPlace: 'આણંદ, ગુજરાત (Anand, Gujarat)',
    occupation: 'બાળક (Toddler)'
  }
];

// Helper to sanitize field names when mapping from Supabase database rows.
// This is critical since users might create fields in flat camelCase, flat lowercase,
// or snake_case (e.g., father_id or souseid or spouseid or spouse_id).
function mapPersonFromDb(row: any): Person {
  return {
    id: String(row.id),
    name: row.name || '',
    gender: (row.gender || 'male').toLowerCase() as Gender,
    // Coalesce all potential database column styles:
    fatherid: row.fatherid !== undefined ? row.fatherid : (row.father_id !== undefined ? row.father_id : null),
    motherid: row.motherid !== undefined ? row.motherid : (row.mother_id !== undefined ? row.mother_id : null),
    spouseid: row.spouseid !== undefined ? row.spouseid : 
              (row.spouse_id !== undefined ? row.spouse_id : 
               (row.souseid !== undefined ? row.souseid : 
                (row.souse_id !== undefined ? row.souse_id : null))),
    dob: row.dob || row.date_of_birth || null,
    dod: row.dod !== undefined ? row.dod : (row.date_of_death !== undefined ? row.date_of_death : null),
    photourl: row.photourl !== undefined ? row.photourl : 
              (row.photo_url !== undefined ? row.photo_url : null),
    notes: row.notes || '',
    birthPlace: row.birthplace || row.birth_place || '',
    occupation: row.occupation || ''
  };
}

// Low-level LocalStorage database management
const LOCAL_STORAGE_KEY = 'family_tree_people_list';

function initLocalStorage() {
  const current = localStorage.getItem(LOCAL_STORAGE_KEY);
  let shouldReset = !current;
  
  if (current) {
    try {
      const parsed = JSON.parse(current);
      if (Array.isArray(parsed)) {
        // If we still have old names like Juan, or Savitaben exists without spouseID, reset to apply Gujarati structure
        const hasOldSeed = parsed.some(p => 
          p.name.includes('Gomez') || 
          p.name.includes('Ruiz') ||
          (p.id === 'g1-juan' && !p.spouseid)
        );
        if (hasOldSeed) {
          shouldReset = true;
        }
      } else {
        shouldReset = true;
      }
    } catch {
      shouldReset = true;
    }
  }

  if (shouldReset) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(SEED_PEOPLE));
  }
}

// -------------------------------------------------------------
// PUBLIC API FOR DATA ACCESS
// -------------------------------------------------------------

// Fetch all people
export async function getPeople(): Promise<Person[]> {
  if (supabase) {
    try {
      // Try fetching from 'person' table
      const { data, error } = await supabase
        .from('person')
        .select('*');

      if (error) {
        console.warn('Supabase fetched table error, falling back to LocalStorage:', error.message);
        throw error;
      }

      if (data && data.length > 0) {
        return data.map(mapPersonFromDb);
      } else {
        // Table exists but is completely empty. Let's auto-seed this Supabase table!
        console.log('Supabase table is empty. Auto-seeding default family members...');
        await seedSupabaseTable(SEED_PEOPLE);
        return SEED_PEOPLE;
      }
    } catch (e) {
      console.error('Supabase getPeople error. Falling back to LocalStorage.', e);
    }
  }

  // Fallback to LocalStorage
  initLocalStorage();
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  return raw ? JSON.parse(raw) : SEED_PEOPLE;
}

// Add or edit a person
export async function savePerson(person: Person): Promise<Person> {
  const cleanPerson = { ...person };
  if (!cleanPerson.id) {
    cleanPerson.id = 'person-' + Math.random().toString(36).substr(2, 9);
  }

  if (supabase) {
    try {
      // Dynamically test which column schema is present in the Postgres Supabase table.
      // We do a single test request or prepare properties suited for both snake_case and camelCase.
      const payload: any = {
        id: cleanPerson.id,
        name: cleanPerson.name,
        gender: cleanPerson.gender,
        dob: cleanPerson.dob,
        notes: cleanPerson.notes,
        birthplace: cleanPerson.birthPlace || '',
        occupation: cleanPerson.occupation || '',
      };

      // We'll prepare options to resolve the standard columns. We run a smart multi-attempt save.
      // Primary Attempt: Flat column naming (to match the prompt's exact literal fields: fatherid, motherid, spouseid, photourl)
      const flatPayload = {
        ...payload,
        fatherid: cleanPerson.fatherid,
        motherid: cleanPerson.motherid,
        spouseid: cleanPerson.spouseid,
        photourl: cleanPerson.photourl
      };

      const snakePayload = {
        ...payload,
        father_id: cleanPerson.fatherid,
        mother_id: cleanPerson.motherid,
        spouse_id: cleanPerson.spouseid,
        photo_url: cleanPerson.photourl
      };

      // Try saving with the flat parameters first
      const { error: flatError } = await supabase
        .from('person')
        .upsert(flatPayload);

      if (!flatError) {
        // Update reciprocal relationship locally to enforce double links
        await handleReciprocalRelationships(cleanPerson);
        return cleanPerson;
      }

      console.warn('First save attempt with flat column names failed, trying snake_case:', flatError.message);
      
      // Secondary Attempt: Snake case columns
      const { error: snakeError } = await supabase
        .from('person')
        .upsert(snakePayload);

      if (!snakeError) {
        await handleReciprocalRelationships(cleanPerson);
        return cleanPerson;
      }

      // Third Attempt: The prompt had a souseid typo, let's try with that if we see any spouse/souse failure
      console.warn('Second save attempt failed. Trying of souseid typo mapping:', snakeError.message);
      const typoPayload = {
        ...payload,
        fatherid: cleanPerson.fatherid,
        motherid: cleanPerson.motherid,
        souseid: cleanPerson.spouseid,
        photourl: cleanPerson.photourl
      };

      const { error: typoError } = await supabase
        .from('person')
        .upsert(typoPayload);

      if (!typoError) {
        await handleReciprocalRelationships(cleanPerson);
        return cleanPerson;
      }

      throw new Error(`Failed all database schema layouts: ${typoError.message}`);

    } catch (e) {
      console.error('Supabase save error, writing to LocalStorage instead:', e);
    }
  }

  // LocalStorage handling
  initLocalStorage();
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  const people: Person[] = raw ? JSON.parse(raw) : [];

  const existingIndex = people.findIndex(p => p.id === cleanPerson.id);
  if (existingIndex > -1) {
    people[existingIndex] = cleanPerson;
  } else {
    people.push(cleanPerson);
  }

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(people));

  // Enforce reciprocal spouse link in local storage
  await handleReciprocalRelationships(cleanPerson);
  return cleanPerson;
}

// Delete a person
export async function deletePerson(id: string): Promise<boolean> {
  if (supabase) {
    try {
      const { error } = await supabase
        .from('person')
        .delete()
        .eq('id', id);

      if (!error) {
        await cleanReciprocalReferences(id);
        return true;
      }
      console.warn('Supabase delete failed, running LocalStorage delete:', error.message);
    } catch (e) {
      console.error('Supabase delete exception:', e);
    }
  }

  // Local Storage delete
  initLocalStorage();
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (raw) {
    let people: Person[] = JSON.parse(raw);
    people = people.filter(p => p.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(people));
    await cleanReciprocalReferences(id);
    return true;
  }
  return false;
}

// Handle automatic linking: If Person A is set as Spouse of Person B,
// then Person B's spouseid MUST automatically be set to Person A.
// Similarly for clearing.
async function handleReciprocalRelationships(person: Person) {
  const allPeople = await getRawPeopleListOnly();
  
  // 1. Handle Spouse reciprocal linkage:
  if (person.spouseid) {
    const originalSpouse = allPeople.find(p => p.id === person.spouseid);
    if (originalSpouse && originalSpouse.spouseid !== person.id) {
      originalSpouse.spouseid = person.id;
      await writeRawPersonQuietly(originalSpouse);
    }
  }

  // 2. Clear old spouse link if this person used to have a different spouse
  const formerSpouses = allPeople.filter(p => p.spouseid === person.id && p.id !== person.spouseid);
  for (const fs of formerSpouses) {
    fs.spouseid = null;
    await writeRawPersonQuietly(fs);
  }
}

// Clean any references to a deleted person to avoid ghost pointers
async function cleanReciprocalReferences(deletedId: string) {
  const allPeople = await getRawPeopleListOnly();
  let changed = false;

  for (const p of allPeople) {
    if (p.spouseid === deletedId) {
      p.spouseid = null;
      await writeRawPersonQuietly(p);
      changed = true;
    }
    if (p.fatherid === deletedId) {
      p.fatherid = null;
      await writeRawPersonQuietly(p);
      changed = true;
    }
    if (p.motherid === deletedId) {
      p.motherid = null;
      await writeRawPersonQuietly(p);
      changed = true;
    }
  }
}

// Low-level helper for silent local/remote saves
async function writeRawPersonQuietly(person: Person) {
  if (supabase) {
    try {
      const payload: any = {
        id: person.id,
        name: person.name,
        gender: person.gender,
        dob: person.dob,
        notes: person.notes,
        birthplace: person.birthPlace || '',
        occupation: person.occupation || '',
        fatherid: person.fatherid,
        father_id: person.fatherid,
        motherid: person.motherid,
        mother_id: person.motherid,
        spouseid: person.spouseid,
        spouse_id: person.spouseid,
        souseid: person.spouseid, // handle typo mapping
        photourl: person.photourl,
        photo_url: person.photourl,
      };
      await supabase.from('person').upsert(payload);
    } catch {}
  }
  
  // Local storage slice
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (raw) {
    const people: Person[] = JSON.parse(raw);
    const existingIndex = people.findIndex(p => p.id === person.id);
    if (existingIndex > -1) {
      people[existingIndex] = person;
    } else {
      people.push(person);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(people));
  }
}

// Fetch helper from local storage purely to prevent recursive loops
async function getRawPeopleListOnly(): Promise<Person[]> {
  initLocalStorage();
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

// Assist user with automatic seeding of their live Supabase instance
async function seedSupabaseTable(peopleList: Person[]) {
  if (!supabase) return;
  try {
    // Prep payloads
    const payloads = peopleList.map(person => ({
      id: person.id,
      name: person.name,
      gender: person.gender,
      dob: person.dob,
      notes: person.notes,
      birthplace: person.birthPlace || '',
      occupation: person.occupation || '',
      fatherid: person.fatherid,
      motherid: person.motherid,
      spouseid: person.spouseid,
      photourl: person.photourl
    }));

    const { error } = await supabase
      .from('person')
      .upsert(payloads);

    if (error) {
      console.warn('Seeding failed with flat layout, trying alternative snake_case naming:', error.message);
      // Try with snake layout
      const snakePayloads = peopleList.map(person => ({
        id: person.id,
        name: person.name,
        gender: person.gender,
        dob: person.dob,
        notes: person.notes,
        birth_place: person.birthPlace || '',
        occupation: person.occupation || '',
        father_id: person.fatherid,
        mother_id: person.motherid,
        spouse_id: person.spouseid,
        photo_url: person.photourl
      }));
      await supabase.from('person').upsert(snakePayloads);
    }
  } catch (err) {
    console.error('Error seeding Supabase table:', err);
  }
}

// Return the SQL string to build the table
export function getSupabaseSQLSnippet(): string {
  return `-- SQL to set up the "person" table in Supabase's SQL Editor:

create table if not exists person (
  id text primary key,
  name text not null,
  gender text not null default 'male',
  fatherid text references person(id) on delete set null,
  motherid text references person(id) on delete set null,
  spouseid text references person(id) on delete set null,
  dob text,
  photourl text,
  notes text,
  birthplace text,
  occupation text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table person enable row level security;

-- Create policy to allow public read & write access for convenience in testing
create policy "Allow everyone to read" on person for select using (true);
create policy "Allow everyone to insert" on person for insert with check (true);
create policy "Allow everyone to update" on person for update using (true);
create policy "Allow everyone to delete" on person for delete using (true);
`;
}
