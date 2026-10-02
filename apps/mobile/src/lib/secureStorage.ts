import AsyncStorage from '@react-native-async-storage/async-storage';
import { utf8Decode, utf8Encode } from '@pickledeals/shared';
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Supabase session storage (§5). The session is larger than SecureStore allows, so it is sealed with
 * AES-256-GCM and kept in AsyncStorage; only the key lives in the Keychain. The key is device-only,
 * so a restored backup never carries a usable session to another phone.
 */
const KEY_NAME = 'pd.session-key.v1';
const keychain = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

let keyPromise: Promise<AESEncryptionKey> | null = null;

function encryptionKey(): Promise<AESEncryptionKey> {
  keyPromise ??= (async () => {
    const stored = await SecureStore.getItemAsync(KEY_NAME, keychain);
    if (stored) return AESEncryptionKey.import(stored, 'hex');
    const key = await AESEncryptionKey.generate();
    await SecureStore.setItemAsync(KEY_NAME, await key.encoded('hex'), keychain);
    return key;
  })();
  keyPromise.catch(() => {
    keyPromise = null;
  });
  return keyPromise;
}

export const encryptedSessionStorage = {
  async getItem(name: string): Promise<string | null> {
    const sealed = await AsyncStorage.getItem(name);
    if (!sealed) return null;
    try {
      const bytes = await aesDecryptAsync(AESSealedData.fromCombined(sealed), await encryptionKey(), { output: 'bytes' });
      return utf8Decode(bytes);
    } catch {
      // Key rotated or data corrupted: drop it; the user simply signs in again.
      await AsyncStorage.removeItem(name);
      return null;
    }
  },
  async setItem(name: string, value: string): Promise<void> {
    const sealed = await aesEncryptAsync(utf8Encode(value), await encryptionKey());
    await AsyncStorage.setItem(name, await sealed.combined('base64'));
  },
  async removeItem(name: string): Promise<void> {
    await AsyncStorage.removeItem(name);
  },
};
