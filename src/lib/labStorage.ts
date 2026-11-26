/**
 * The labs' own device storage (MIC-080): saved test queries and good / bad verdicts. Web uses
 * localStorage, native AsyncStorage. Never a database: the labs write nothing to the server.
 */
const PREFIX = 'michi.lab.';

export async function readLab(key: string): Promise<string | null> {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(PREFIX + key);
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    return await AsyncStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export async function writeLab(key: string, value: string): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PREFIX + key, value);
      return;
    }
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(PREFIX + key, value);
  } catch {
    /* a lab that forgets its verdicts is still a lab */
  }
}
