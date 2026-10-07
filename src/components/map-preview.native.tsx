import MapView, { Marker, Polyline } from 'react-native-maps';
import { StyleSheet, View } from 'react-native';

import type { ExperiencePlan, Location } from '@/domain/experience';

export function MapPreview({ plan, location }: { plan: ExperiencePlan; location?: Location }) {
  const firstPoint = plan.route.points[0];
  return (
    <View style={styles.container}>
      <MapView
        accessibilityLabel="Route preview"
        initialRegion={{
          latitude: location?.latitude ?? firstPoint.latitude,
          longitude: location?.longitude ?? firstPoint.longitude,
          latitudeDelta: 0.006,
          longitudeDelta: 0.006,
        }}
        style={styles.map}>
        <Polyline coordinates={plan.route.points} strokeColor="#1e6b52" strokeWidth={5} />
        <Marker coordinate={firstPoint} title="Start" />
        {plan.landmarks.filter((landmark) => landmark.coordinate).map((landmark) => (
          <Marker
            key={landmark.id}
            coordinate={landmark.coordinate!}
            title={landmark.title}
            description={landmark.description}
            pinColor="#d47c46"
          />
        ))}
        {location && <Marker coordinate={location} title="You are here" pinColor="#1e6b52" />}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 220, overflow: 'hidden', borderRadius: 18 },
  map: { flex: 1 },
});
