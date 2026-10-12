import { UserProfile } from '../engine/types';
import demoSeedProfile from '../../seed/demo-profile.json';

const STORAGE_KEY_PROFILE = 'reach_user_profile';
const STORAGE_KEY_ACTIVE_PATIENT = 'reach_active_patient_id';
const STORAGE_KEY_PATIENTS_CACHE = 'reach_patients_cache';

export const defaultProfile: UserProfile = {
  ...(demoSeedProfile as any),
  id: 'patient_1',
  name: 'Rachel',
  bed: 'Bed 7',
  assignedCaregiver: 'Priya',
  active: true,
  notes: 'Post-op recovery, right hand preference',
  updatedAt: Date.now(),
};

/**
 * Gets currently active patient ID
 */
export function getActivePatientId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_ACTIVE_PATIENT);
    if (stored) return stored;
  } catch (e) {}
  return 'patient_1';
}

/**
 * Sets active patient ID
 */
export function setActivePatientId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_PATIENT, id);
    // Also trigger custom event so open views react immediately
    window.dispatchEvent(new CustomEvent('reach:patient-changed', { detail: { patientId: id } }));
  } catch (e) {}
}

/**
 * Synchronous read of active patient profile (from localStorage cache or default)
 */
export function getStoredProfile(): UserProfile {
  try {
    const activeId = getActivePatientId();

    // Check cached patients list first
    const cachedList = localStorage.getItem(STORAGE_KEY_PATIENTS_CACHE);
    if (cachedList) {
      const parsed: UserProfile[] = JSON.parse(cachedList);
      const match = parsed.find((p) => p.id === activeId);
      if (match) return match;
    }

    // Check legacy single profile key
    const raw = localStorage.getItem(STORAGE_KEY_PROFILE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.id === activeId || !activeId)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load profile from localStorage:', err);
  }
  return defaultProfile;
}

/**
 * Fetches all patients from backend server with localStorage fallback
 */
export async function getAllPatients(): Promise<UserProfile[]> {
  try {
    const res = await fetch('/api/patients');
    if (res.ok) {
      const data: UserProfile[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        localStorage.setItem(STORAGE_KEY_PATIENTS_CACHE, JSON.stringify(data));
        return data;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch patients from server, using local cache:', err);
  }

  // Fallback to cached list
  try {
    const cached = localStorage.getItem(STORAGE_KEY_PATIENTS_CACHE);
    if (cached) {
      const parsed: UserProfile[] = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}

  return [defaultProfile];
}

/**
 * Fetches active patient profile from server or local cache
 */
export async function getActivePatient(): Promise<UserProfile> {
  const activeId = getActivePatientId();
  try {
    const res = await fetch(`/api/patients/${activeId}`);
    if (res.ok) {
      const profile: UserProfile = await res.json();
      savePatientToLocalCache(profile);
      return profile;
    }
  } catch (err) {
    console.warn('Failed to fetch active patient from server:', err);
  }
  return getStoredProfile();
}

/**
 * Helper to update patient inside local cache
 */
function savePatientToLocalCache(profile: UserProfile) {
  try {
    const cached = localStorage.getItem(STORAGE_KEY_PATIENTS_CACHE);
    let list: UserProfile[] = cached ? JSON.parse(cached) : [];
    const idx = list.findIndex((p) => p.id === profile.id);
    if (idx >= 0) {
      list[idx] = profile;
    } else {
      list.push(profile);
    }
    localStorage.setItem(STORAGE_KEY_PATIENTS_CACHE, JSON.stringify(list));

    if (profile.id === getActivePatientId()) {
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(profile));
    }
  } catch (e) {}
}

/**
 * Saves/updates a patient profile to disk and server
 */
export async function savePatient(profile: UserProfile): Promise<boolean> {
  try {
    profile.updatedAt = Date.now();
    savePatientToLocalCache(profile);

    const response = await fetch(`/api/patients/${profile.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });

    return response.ok;
  } catch (err) {
    console.warn('Failed to sync patient to server, saved locally:', err);
    return false;
  }
}

/**
 * Creates a new patient
 */
export async function createPatient(data: Partial<UserProfile>): Promise<UserProfile | null> {
  try {
    const response = await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      const created: UserProfile = await response.json();
      savePatientToLocalCache(created);
      return created;
    }
  } catch (err) {
    console.warn('Failed to create patient on server:', err);
  }

  // Fallback offline creation
  const offlinePatient: UserProfile = {
    id: data.id || `patient_${Date.now()}`,
    name: data.name || 'New Patient',
    bed: data.bed || 'Bed 1',
    assignedCaregiver: data.assignedCaregiver || 'Priya',
    active: true,
    notes: data.notes || '',
    gestures: data.gestures || [],
    restSamples: data.restSamples || [],
    settings: data.settings || defaultProfile.settings,
    updatedAt: Date.now(),
  };
  savePatientToLocalCache(offlinePatient);
  return offlinePatient;
}

/**
 * Deactivates or removes a patient
 */
export async function deletePatient(id: string, hard: boolean = false): Promise<boolean> {
  try {
    const res = await fetch(`/api/patients/${id}?hard=${hard}`, {
      method: 'DELETE',
    });
    // Remove from local cache
    const cached = localStorage.getItem(STORAGE_KEY_PATIENTS_CACHE);
    if (cached) {
      let list: UserProfile[] = JSON.parse(cached);
      if (hard) {
        list = list.filter((p) => p.id !== id);
      } else {
        list = list.map((p) => (p.id === id ? { ...p, active: false } : p));
      }
      localStorage.setItem(STORAGE_KEY_PATIENTS_CACHE, JSON.stringify(list));
    }
    return res.ok;
  } catch (err) {
    return false;
  }
}

/**
 * Backwards compatibility: saves current profile
 */
export async function saveProfile(profile: UserProfile): Promise<boolean> {
  return savePatient(profile);
}
