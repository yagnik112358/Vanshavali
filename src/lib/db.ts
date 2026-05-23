/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Person, Gender, SpouseRelation } from '../types';

// Let's load Supabase keys from environment variables safely
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';
const photoBucketName = (import.meta as any).env.VITE_SUPABASE_PHOTO_BUCKET || 'family-photos';
const MAX_ORIGINAL_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_UPLOADED_PHOTO_BYTES = 180 * 1024;
const PHOTO_COMPRESSION_ATTEMPTS = [
  { maxDimension: 900, quality: 0.72 },
  { maxDimension: 720, quality: 0.62 },
  { maxDimension: 560, quality: 0.52 },
  { maxDimension: 420, quality: 0.42 },
] as const;

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

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not read selected photo.'));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function compressImageToBlob(
  image: HTMLImageElement,
  maxDimension: number,
  quality: number,
): Promise<Blob> {
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Photo compression is not supported in this browser.');
  }

  context.drawImage(image, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      compressedBlob => {
        if (!compressedBlob) {
          reject(new Error('Photo compression failed.'));
          return;
        }
        resolve(compressedBlob);
      },
      'image/jpeg',
      quality,
    );
  });
}

async function compressPhoto(file: File): Promise<File> {
  if (file.size <= MAX_UPLOADED_PHOTO_BYTES) {
    return file;
  }

  const image = await loadImageFromFile(file);
  let smallestBlob: Blob | null = null;

  for (const attempt of PHOTO_COMPRESSION_ATTEMPTS) {
    const blob = await compressImageToBlob(image, attempt.maxDimension, attempt.quality);
    if (!smallestBlob || blob.size < smallestBlob.size) {
      smallestBlob = blob;
    }

    if (blob.size <= MAX_UPLOADED_PHOTO_BYTES) {
      const originalName = file.name.replace(/\.[^/.]+$/, '');
      return new File([blob], `${originalName || 'photo'}.jpg`, { type: 'image/jpeg' });
    }
  }

  if (smallestBlob) {
    const sizeKb = Math.ceil(smallestBlob.size / 1024);
    throw new Error(`Image limit exceeded. Photo is ${sizeKb} KB after compression. Please choose a smaller photo so it can fit under 200 KB.`);
  }

  throw new Error('Photo compression failed. Please choose a smaller photo.');
}

export async function uploadPersonPhoto(file: File, personId: string): Promise<string> {
  if (!supabase) {
    throw new Error('Supabase is not connected. Add Supabase keys before uploading photos.');
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image file.');
  }

  if (file.size > MAX_ORIGINAL_PHOTO_BYTES) {
    throw new Error('Photo is too large. Please choose an image under 8 MB.');
  }

  const uploadFile = await compressPhoto(file);
  const extension = uploadFile.name.split('.').pop()?.toLowerCase() || 'jpg';
  const cleanPersonId = personId.replace(/[^a-zA-Z0-9-_]/g, '-');
  const filePath = `${cleanPersonId}/${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(photoBucketName)
    .upload(filePath, uploadFile, {
      cacheControl: '3600',
      contentType: uploadFile.type,
      upsert: true,
    });

  if (error) {
    if (error.message.toLowerCase().includes('row-level security')) {
      throw new Error('Photo upload blocked by Supabase Storage policy. Run the Storage policy SQL from the Supabase setup panel.');
    }
    if (
      error.message.toLowerCase().includes('object') &&
      (error.message.toLowerCase().includes('large') || error.message.toLowerCase().includes('bigger'))
    ) {
      throw new Error('Image limit exceeded. Please upload a smaller photo that can be compressed under 200 KB.');
    }
    throw new Error(`Photo upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(photoBucketName).getPublicUrl(filePath);
  return data.publicUrl;
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
function parseSpouseRelations(value: unknown): SpouseRelation[] {
  if (!value) return [];
  if (Array.isArray(value)) return normalizeSpouseRelations(value as SpouseRelation[]);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? normalizeSpouseRelations(parsed as SpouseRelation[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeSpouseRelations(relations: SpouseRelation[] | undefined, fallbackSpouseId?: string | null): SpouseRelation[] {
  const relationMap = new Map<string, SpouseRelation>();

  (relations || []).forEach(relation => {
    if (!relation?.personId) return;
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

function getPrimarySpouseId(spouses: SpouseRelation[]): string | null {
  return spouses.find(relation => relation.status === 'current')?.personId || spouses[0]?.personId || null;
}

function mapPersonFromDb(row: any): Person {
  const spouseid = row.spouseid !== undefined ? row.spouseid : 
              (row.spouse_id !== undefined ? row.spouse_id : 
               (row.souseid !== undefined ? row.souseid : 
                (row.souse_id !== undefined ? row.souse_id : null)));
  const spouses = normalizeSpouseRelations(
    parseSpouseRelations(row.spouses !== undefined ? row.spouses : row.spouse_relations),
    spouseid,
  );

  return {
    id: String(row.id),
    name: row.name || '',
    gender: (row.gender || 'male').toLowerCase() as Gender,
    // Coalesce all potential database column styles:
    fatherid: row.fatherid !== undefined ? row.fatherid : (row.father_id !== undefined ? row.father_id : null),
    motherid: row.motherid !== undefined ? row.motherid : (row.mother_id !== undefined ? row.mother_id : null),
    spouseid: getPrimarySpouseId(spouses),
    dob: row.dob || row.date_of_birth || null,
    dod: row.dod !== undefined ? row.dod : (row.date_of_death !== undefined ? row.date_of_death : null),
    photourl: row.photourl !== undefined ? row.photourl : 
              (row.photo_url !== undefined ? row.photo_url : null),
    notes: row.notes || '',
    birthPlace: row.birthplace || row.birth_place || '',
    occupation: row.occupation || '',
    spouses,
  };
}

function normalizePersonRecord(person: Person): Person {
  const spouses = normalizeSpouseRelations(person.spouses, person.spouseid);
  return {
    ...person,
    spouseid: getPrimarySpouseId(spouses),
    spouses,
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
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(SEED_PEOPLE.map(normalizePersonRecord)));
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
        return SEED_PEOPLE.map(normalizePersonRecord);
      }
    } catch (e) {
      console.error('Supabase getPeople error. Falling back to LocalStorage.', e);
    }
  }

  // Fallback to LocalStorage
  initLocalStorage();
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Person[]).map(normalizePersonRecord) : SEED_PEOPLE.map(normalizePersonRecord);
}

// Add or edit a person
export async function savePerson(person: Person): Promise<Person> {
  const cleanPerson = normalizePersonRecord({ ...person });
  if (!cleanPerson.id) {
    cleanPerson.id = 'person-' + Math.random().toString(36).substr(2, 9);
  }
  cleanPerson.spouses = normalizeSpouseRelations(cleanPerson.spouses, cleanPerson.spouseid);
  cleanPerson.spouseid = getPrimarySpouseId(cleanPerson.spouses);

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
        dod: cleanPerson.dod,
        fatherid: cleanPerson.fatherid,
        motherid: cleanPerson.motherid,
        spouseid: cleanPerson.spouseid,
        spouses: cleanPerson.spouses,
        photourl: cleanPerson.photourl
      };

      const snakePayload = {
        ...payload,
        date_of_death: cleanPerson.dod,
        father_id: cleanPerson.fatherid,
        mother_id: cleanPerson.motherid,
        spouse_id: cleanPerson.spouseid,
        spouse_relations: cleanPerson.spouses,
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
        dod: cleanPerson.dod,
        fatherid: cleanPerson.fatherid,
        motherid: cleanPerson.motherid,
        souseid: cleanPerson.spouseid,
        spouses: cleanPerson.spouses,
        photourl: cleanPerson.photourl
      };

      const { error: typoError } = await supabase
        .from('person')
        .upsert(typoPayload);

      if (!typoError) {
        await handleReciprocalRelationships(cleanPerson);
        return cleanPerson;
      }

      const { spouses, ...legacyFlatPayload } = flatPayload;
      const { spouse_relations, ...legacySnakePayload } = snakePayload;
      const { spouses: typoSpouses, ...legacyTypoPayload } = typoPayload;

      const { error: legacyFlatError } = await supabase.from('person').upsert(legacyFlatPayload);
      if (!legacyFlatError) {
        await handleReciprocalRelationships(cleanPerson);
        return cleanPerson;
      }

      const { error: legacySnakeError } = await supabase.from('person').upsert(legacySnakePayload);
      if (!legacySnakeError) {
        await handleReciprocalRelationships(cleanPerson);
        return cleanPerson;
      }

      const { error: legacyTypoError } = await supabase.from('person').upsert(legacyTypoPayload);
      if (!legacyTypoError) {
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

// Handle automatic multi-spouse linking. If Person A includes Person B in spouses,
// Person B receives/updates the reciprocal spouse relation without deleting older spouses.
async function handleReciprocalRelationships(person: Person) {
  const allPeople = await getRawPeopleListOnly();
  const currentPerson = allPeople.find(p => p.id === person.id) || person;
  currentPerson.spouses = normalizeSpouseRelations(person.spouses, person.spouseid);
  currentPerson.spouseid = getPrimarySpouseId(currentPerson.spouses);

  // Keep local fallback in sync with the latest saved person before adjusting relatives.
  await writeRawPersonQuietly(currentPerson);

  for (const relation of currentPerson.spouses || []) {
    const spouse = allPeople.find(p => p.id === relation.personId);
    if (!spouse) continue;

    const spouseRelations = normalizeSpouseRelations(spouse.spouses, spouse.spouseid);
    const existingIndex = spouseRelations.findIndex(item => item.personId === person.id);
    const reciprocalRelation: SpouseRelation = {
      personId: person.id,
      status: relation.status || 'current',
      startDate: relation.startDate || null,
      endDate: relation.endDate || null,
      childrenIds: Array.from(new Set(relation.childrenIds || [])),
    };

    if (existingIndex >= 0) {
      spouseRelations[existingIndex] = reciprocalRelation;
    } else {
      spouseRelations.push(reciprocalRelation);
    }

    spouse.spouses = spouseRelations;
    spouse.spouseid = getPrimarySpouseId(spouseRelations);
    await writeRawPersonQuietly(spouse);

    for (const childId of relation.childrenIds || []) {
      const child = allPeople.find(p => p.id === childId);
      if (!child) continue;

      if (currentPerson.gender === 'male') child.fatherid = currentPerson.id;
      if (currentPerson.gender === 'female') child.motherid = currentPerson.id;
      if (spouse.gender === 'male') child.fatherid = spouse.id;
      if (spouse.gender === 'female') child.motherid = spouse.id;

      await writeRawPersonQuietly(child);
    }
  }
}

// Clean any references to a deleted person to avoid ghost pointers
async function cleanReciprocalReferences(deletedId: string) {
  const allPeople = await getRawPeopleListOnly();
  let changed = false;

  for (const p of allPeople) {
    if (p.spouseid === deletedId) {
      p.spouseid = null;
      changed = true;
    }
    const spouses = normalizeSpouseRelations(p.spouses, p.spouseid).filter(relation => relation.personId !== deletedId);
    if ((p.spouses || []).length !== spouses.length) {
      p.spouses = spouses;
      p.spouseid = getPrimarySpouseId(spouses);
      changed = true;
    }
    if (p.fatherid === deletedId) {
      p.fatherid = null;
      changed = true;
    }
    if (p.motherid === deletedId) {
      p.motherid = null;
      changed = true;
    }
    if (changed) {
      await writeRawPersonQuietly(p);
      changed = false;
    }
  }
}

// Low-level helper for silent local/remote saves
async function writeRawPersonQuietly(person: Person) {
  const normalizedPerson = normalizePersonRecord(person);
  if (supabase) {
    try {
      const basePayload = {
        id: normalizedPerson.id,
        name: normalizedPerson.name,
        gender: normalizedPerson.gender,
        dob: normalizedPerson.dob,
        dod: normalizedPerson.dod,
        notes: normalizedPerson.notes,
        birthplace: normalizedPerson.birthPlace || '',
        occupation: normalizedPerson.occupation || '',
      };

      const flatPayload = {
        ...basePayload,
        fatherid: normalizedPerson.fatherid,
        motherid: normalizedPerson.motherid,
        spouseid: normalizedPerson.spouseid,
        spouses: normalizedPerson.spouses,
        photourl: normalizedPerson.photourl,
      };

      const snakePayload = {
        ...basePayload,
        date_of_death: normalizedPerson.dod,
        father_id: normalizedPerson.fatherid,
        mother_id: normalizedPerson.motherid,
        spouse_id: normalizedPerson.spouseid,
        spouse_relations: normalizedPerson.spouses,
        photo_url: normalizedPerson.photourl,
      };

      const typoPayload = {
        ...basePayload,
        fatherid: normalizedPerson.fatherid,
        motherid: normalizedPerson.motherid,
        souseid: normalizedPerson.spouseid,
        spouses: normalizedPerson.spouses,
        photourl: normalizedPerson.photourl,
      };

      const { error: flatError } = await supabase.from('person').upsert(flatPayload);
      if (!flatError) return;

      const { error: snakeError } = await supabase.from('person').upsert(snakePayload);
      if (!snakeError) return;

      const { error: typoError } = await supabase.from('person').upsert(typoPayload);
      if (!typoError) return;

      const { spouses, ...legacyFlatPayload } = flatPayload;
      const { spouse_relations, ...legacySnakePayload } = snakePayload;
      const { spouses: typoSpouses, ...legacyTypoPayload } = typoPayload;
      const { error: legacyFlatError } = await supabase.from('person').upsert(legacyFlatPayload);
      if (!legacyFlatError) return;
      const { error: legacySnakeError } = await supabase.from('person').upsert(legacySnakePayload);
      if (!legacySnakeError) return;
      await supabase.from('person').upsert(legacyTypoPayload);
    } catch {}
  }
  
  // Local storage slice
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (raw) {
    const people: Person[] = JSON.parse(raw);
    const existingIndex = people.findIndex(p => p.id === normalizedPerson.id);
    if (existingIndex > -1) {
      people[existingIndex] = normalizedPerson;
    } else {
      people.push(normalizedPerson);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(people));
  }
}

// Fetch helper from local storage purely to prevent recursive loops
async function getRawPeopleListOnly(): Promise<Person[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('person')
        .select('*');

      if (!error && data) {
        return data.map(mapPersonFromDb);
      }
    } catch {}
  }

  initLocalStorage();
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Person[]).map(normalizePersonRecord) : [];
}

// Assist user with automatic seeding of their live Supabase instance
async function seedSupabaseTable(peopleList: Person[]) {
  if (!supabase) return;
  try {
    // Prep payloads
    const payloads = peopleList.map(person => {
      const normalizedPerson = normalizePersonRecord(person);
      return ({
      id: person.id,
      name: person.name,
      gender: person.gender,
      dob: person.dob,
      dod: person.dod,
      notes: person.notes,
      birthplace: person.birthPlace || '',
      occupation: person.occupation || '',
      fatherid: person.fatherid,
      motherid: person.motherid,
      spouseid: normalizedPerson.spouseid,
      spouses: normalizedPerson.spouses,
      photourl: person.photourl
    });
    });

    const { error } = await supabase
      .from('person')
      .upsert(payloads);

    if (error) {
      console.warn('Seeding failed with flat layout, trying alternative snake_case naming:', error.message);
      // Try with snake layout
      const snakePayloads = peopleList.map(person => {
        const normalizedPerson = normalizePersonRecord(person);
        return ({
        id: person.id,
        name: person.name,
        gender: person.gender,
        dob: person.dob,
        date_of_death: person.dod,
        notes: person.notes,
        birth_place: person.birthPlace || '',
        occupation: person.occupation || '',
        father_id: person.fatherid,
        mother_id: person.motherid,
        spouse_id: normalizedPerson.spouseid,
        spouse_relations: normalizedPerson.spouses,
        photo_url: person.photourl
      });
      });
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
  dod text,
  photourl text,
  notes text,
  birthplace text,
  occupation text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table person add column if not exists dod text;
alter table person add column if not exists spouses jsonb not null default '[]'::jsonb;

-- Enable Row Level Security (RLS)
alter table person enable row level security;

-- Create policy to allow public read & write access for convenience in testing
create policy "Allow everyone to read" on person for select using (true);
create policy "Allow everyone to insert" on person for insert with check (true);
create policy "Allow everyone to update" on person for update using (true);
create policy "Allow everyone to delete" on person for delete using (true);

-- SQL to set up the "${photoBucketName}" photo bucket and public test policies:
insert into storage.buckets (id, name, public)
values ('${photoBucketName}', '${photoBucketName}', true)
on conflict (id) do update set public = true;

drop policy if exists "Allow public photo read" on storage.objects;
drop policy if exists "Allow public photo upload" on storage.objects;
drop policy if exists "Allow public photo update" on storage.objects;
drop policy if exists "Allow public photo delete" on storage.objects;

create policy "Allow public photo read"
on storage.objects for select
using (bucket_id = '${photoBucketName}');

create policy "Allow public photo upload"
on storage.objects for insert
with check (bucket_id = '${photoBucketName}');

create policy "Allow public photo update"
on storage.objects for update
using (bucket_id = '${photoBucketName}')
with check (bucket_id = '${photoBucketName}');

create policy "Allow public photo delete"
on storage.objects for delete
using (bucket_id = '${photoBucketName}');
`;
}
