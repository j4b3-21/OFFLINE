import * as Location from 'expo-location';

import type { Location as UserLocation } from '@/domain/experience';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export interface LocationProvider {
  requestPermission(): Promise<PermissionState>;
  getCurrentLocation(): Promise<UserLocation>;
  watchLocation(callback: (location: UserLocation) => void, onError?: (error: Error) => void): Promise<() => void>;
}

function toUserLocation(location: Location.LocationObject): UserLocation {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracyMeters: location.coords.accuracy ?? undefined,
    altitudeMeters: location.coords.altitude ?? undefined,
    headingDegrees: location.coords.heading ?? undefined,
    speedMps: location.coords.speed ?? undefined,
    timestamp: location.timestamp,
  };
}

export const deviceLocationProvider: LocationProvider = {
  async requestPermission() {
    const result = await Location.requestForegroundPermissionsAsync();
    return result.granted ? 'granted' : result.canAskAgain ? 'undetermined' : 'denied';
  },

  async getCurrentLocation() {
    const result = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return toUserLocation(result);
  },

  async watchLocation(callback, onError) {
    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 10,
        timeInterval: 10_000,
      },
      (location) => callback(toUserLocation(location)),
      (reason) => onError?.(new Error(reason)),
    );
    return () => subscription.remove();
  },
};
