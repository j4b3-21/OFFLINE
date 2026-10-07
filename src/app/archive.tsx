import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import {
  deleteSession,
  exportSession,
  getExperience,
  initializeDatabase,
  listSessions,
} from '@/data/database';
import { createSessionReport } from '@/session/session-engine';
import type { ExperiencePlan, SessionRecord } from '@/domain/experience';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';

export default function ArchiveScreen() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  // Plan lookups are keyed by experience id and shared across rows.
  const [plans, setPlans] = useState<Record<string, ExperiencePlan | undefined>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    initializeDatabase()
      .then(listSessions)
      .then(async (rows) => {
        if (cancelled) return;
        const experienceIds = [...new Set(rows.map((row) => row.experienceId))];
        const entries = await Promise.all(
          experienceIds.map(async (id) => [id, await getExperience(id)] as const),
        );
        if (!cancelled) {
          setSessions(rows);
          setPlans(Object.fromEntries(entries));
        }
      })
      .catch(() => {
        if (!cancelled) {
          Alert.alert('Archive unavailable', 'The local session database could not be opened.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleExport(session: SessionRecord) {
    try {
      const json = await exportSession(session.id);
      await Share.share({ message: json });
    } catch (error) {
      Alert.alert(
        'Export failed',
        error instanceof Error ? error.message : 'The session could not be exported.',
      );
    }
  }

  function handleDelete(session: SessionRecord) {
    Alert.alert(
      'Delete this walk?',
      'This removes the session, its events, and its saved plan from this device. Anything you exported is kept on your side.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void confirmDelete(session),
        },
      ],
    );
  }

  async function confirmDelete(session: SessionRecord) {
    try {
      await deleteSession(session.id);
      const remaining = sessions.filter((row) => row.id !== session.id);
      setSessions(remaining);
      setPlans((previous) => {
        const next = { ...previous };
        if (!remaining.some((row) => row.experienceId === session.experienceId)) {
          delete next[session.experienceId];
        }
        return next;
      });
    } catch (error) {
      Alert.alert(
        'Delete failed',
        error instanceof Error ? error.message : 'The session could not be deleted.',
      );
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable accessibilityRole="link" onPress={() => router.back()} style={styles.backRow}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              ← Back
            </ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
            SESSION ARCHIVE
          </ThemedText>
          <ThemedText type="title" style={styles.title}>
            Past walks.
          </ThemedText>

          {loading ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ActivityIndicator />
            </ThemedView>
          ) : sessions.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText themeColor="textSecondary">
                No past walks yet — plan one on the home screen.
              </ThemedText>
            </ThemedView>
          ) : (
            sessions.map((session) => (
              <ArchiveRow
                key={session.id}
                session={session}
                plan={plans[session.experienceId]}
                onExport={() => void handleExport(session)}
                onDelete={() => handleDelete(session)}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function ArchiveRow({
  session,
  plan,
  onExport,
  onDelete,
}: {
  session: SessionRecord;
  plan?: ExperiencePlan;
  onExport: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  // The same honest metric shape as the home-screen report; requires the plan.
  const report = plan ? createSessionReport(session, plan) : undefined;
  const date = session.startedAt ?? session.completedAt;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.rowHeader}>
        <ThemedText type="smallBold">
          {report ? `${report.durationMinutes} min` : '—'} · {formatDate(date)}
        </ThemedText>
      </View>
      <Metric label="Missions" value={formatMissions(session, plan)} />
      <Metric label="Route completed" value={session.metrics.routeCompleted ? 'Yes' : 'Not quite'} />
      <Metric label="Digital intrusion score" value={report ? `${report.digitalIntrusionScore}` : '—'} />
      <Metric label="Physical engagement score" value={report ? `${report.physicalEngagementScore}` : '—'} />
      <Metric label="AI disappearance rate" value={report ? `${Math.round(report.aiDisappearanceRate * 100)}%` : '—'} />
      <View style={styles.rowActions}>
        <Pressable accessibilityRole="button" onPress={onExport} style={styles.actionButton}>
          <ThemedText type="smallBold" style={styles.exportText}>
            Export
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onDelete}
          style={[styles.actionButton, { borderColor: theme.textSecondary }]}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Delete
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

function formatMissions(session: SessionRecord, plan?: ExperiencePlan): string {
  const completed = session.metrics.missionCompletions;
  return plan ? `${completed} / ${plan.missions.length}` : `${completed}`;
}

function formatDate(value?: string): string {
  if (!value) return 'no date recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'no date recorded';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  backRow: { alignSelf: 'flex-start', paddingVertical: Spacing.one },
  eyebrow: { letterSpacing: 1.5 },
  title: { fontSize: 44, lineHeight: 48, maxWidth: 360 },
  card: { borderRadius: 24, padding: Spacing.four, gap: Spacing.two },
  rowHeader: { marginBottom: Spacing.one },
  metric: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomColor: '#c9cec9',
    borderBottomWidth: 1,
    paddingVertical: Spacing.one,
  },
  rowActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  actionButton: {
    borderColor: '#1e6b52',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  exportText: { color: '#1e6b52' },
});