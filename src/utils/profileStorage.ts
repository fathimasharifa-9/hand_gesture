import { UserProfile } from '../engine/types';
import demoSeedProfile from '../../seed/demo-profile.json';

const STORAGE_KEY = 'reach_user_profile';

export const defaultProfile: UserProfile = demoSeedProfile as UserProfile;

export function getStoredProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.gestures && parsed.gestures.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load profile from localStorage:', err);
  }
  return defaultProfile;
}

export async function saveProfile(profile: UserProfile): Promise<boolean> {
  try {
    profile.updatedAt = Date.now();
    // 1. LocalStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));

    // 2. Server API
    const response = await fetch(`/api/profile/${profile.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });

    return response.ok;
  } catch (err) {
    console.warn('Failed to sync profile to server, saved locally:', err);
    return false;
  }
}
