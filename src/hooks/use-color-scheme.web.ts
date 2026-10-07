import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  return useSyncExternalStore(
    (listener) => Appearance.addChangeListener(listener).remove,
    () => Appearance.getColorScheme() ?? 'light',
    () => 'light',
  );
}
