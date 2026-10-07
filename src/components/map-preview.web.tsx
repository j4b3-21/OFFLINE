import { StyleSheet, View } from 'react-native';

import type { ExperiencePlan, Location } from '@/domain/experience';
import { ThemedText } from '@/components/themed-text';

export function MapPreview({ plan, location }: { plan: ExperiencePlan; location?: Location }) {
  return (
    <View style={styles.container} accessibilityLabel="Cached route preview">
      <View style={styles.routeLine} />
      <ThemedText type="smallBold">Cached route</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {plan.route.points.length} route points · {location ? 'location available' : 'waiting for location'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Web preview uses the saved route geometry. Native builds render the interactive map.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#dfece3',
    borderRadius: 18,
    gap: 8,
    justifyContent: 'center',
    minHeight: 180,
    overflow: 'hidden',
    padding: 20,
  },
  routeLine: {
    backgroundColor: '#1e6b52',
    borderRadius: 8,
    height: 8,
    marginBottom: 12,
    transform: [{ rotate: '-8deg' }],
    width: '70%',
  },
});
