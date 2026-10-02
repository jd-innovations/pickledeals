import AsyncStorage from '@react-native-async-storage/async-storage';
import { palette, type ColorScheme, type ColorTokens } from '@pickledeals/shared';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';

export type AppearancePreference = 'system' | 'light' | 'dark';

type ThemeValue = {
  colors: ColorTokens;
  scheme: ColorScheme;
  preference: AppearancePreference;
  setPreference: (p: AppearancePreference) => void;
};

const STORAGE_KEY = 'pd.appearance';
const ThemeContext = createContext<ThemeValue | null>(null);

function applyNative(p: AppearancePreference) {
  Appearance.setColorScheme(p === 'system' ? 'unspecified' : p);
}

/**
 * System is the default. Light/Dark overrides are applied through Appearance.setColorScheme so
 * native UI (tab bar, sheets, alerts, keyboards, maps) follows the same choice as our tokens.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<AppearancePreference>('system');
  const system = useColorScheme();
  const scheme: ColorScheme = system === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') {
          setPreferenceState(v);
          applyNative(v);
        }
      })
      .catch(() => {});
  }, []);

  function setPreference(p: AppearancePreference) {
    setPreferenceState(p);
    applyNative(p);
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {});
  }

  return (
    <ThemeContext.Provider value={{ colors: palette[scheme], scheme, preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}
