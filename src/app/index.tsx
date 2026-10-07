import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ExperienceEngine } from '@/experience/experience-engine';
import {
  getExperience,
  getLatestOpenSession,
  getSessionEvents,
  initializeDatabase,
  recordSessionEvent,
  saveExperience,
  saveSession,
} from '@/data/database';
import {
  audioGuidance,
  signalGuidance,
} from '@/interaction/guidance';
import {
  createSession,
  createSessionReport,
  transitionSession,
} from '@/session/session-engine';
import { buildSessionStory } from '@/session/session-story';
import type { ExperiencePlan, Location, SessionEvent, SessionRecord, SessionReport, WalkMode } from '@/domain/experience';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { MapPreview } from '@/components/map-preview';
import { deviceLocationProvider } from '@/location/location-provider';
import {
  createNavigationState,
  updateNavigationState,
  type NavigationState,
} from '@/navigation/navigation-engine';
import { safetyEngine } from '@/safety/safety-engine';
import { activeModel, modelSetupRequired } from '@/ai/active-model';
import { localModelManager, type ModelDownloadProgress } from '@/ai/tinyllama/tinyllama-model-manager';
import { integrationConfig } from '@/config/integrations';
import { SystemVoiceProvider } from '@/voice/voice-provider';
import { QueuedVoiceProvider } from '@/voice/voice-queue';
import { DEFAULT_WALKING_CONFIG, WALKING_INTERVAL_OPTIONS, type WalkingConfig } from '@/walking/walking-config';
import { WalkingMonitor } from '@/walking/walking-monitor';
import type { WalkingSnapshot } from '@/walking/walking-types';
import {
  resolveCueContext,
  type PlanCueContext,
} from '@/walking/cue-context';

const engine = new ExperienceEngine(activeModel);

// One small mode toggle at Prepare; the labels are the whole interface.
const WALK_MODE_OPTIONS: readonly { value: WalkMode; label: string }[] = [
  { value: 'quiet', label: 'Quiet' },
  { value: 'curious', label: 'Curious' },
  { value: 'explore', label: 'Explore new area' },
];

export default function HomeScreen() {
  const theme = useTheme();
  const [duration, setDuration] = useState('30');
  // Prepare-mode variant: quiet / curious / explore. 'quiet' is the default and
  // the planner also defaults to it, so an unset mode can never invent one.
  const [walkMode, setWalkMode] = useState<WalkMode>('quiet');
  const [plan, setPlan] = useState<ExperiencePlan>();
  const [session, setSession] = useState<SessionRecord>();
  const [loading, setLoading] = useState(false);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [location, setLocation] = useState<Location>();
  const [locationMessage, setLocationMessage] = useState('Location is requested when you start.');
  const [navigation, setNavigation] = useState<NavigationState>();
  const walkingMonitorRef = useRef<WalkingMonitor | undefined>(undefined);
  const [walkingConfig, setWalkingConfig] = useState<WalkingConfig>(DEFAULT_WALKING_CONFIG);
  const [walkingSnapshot, setWalkingSnapshot] = useState<WalkingSnapshot>();
  const [downloadDialogVisible, setDownloadDialogVisible] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress>();
  const [downloadLoading, setDownloadLoading] = useState(false);
  const downloadCancelledRef = useRef(false);
  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([]);
  // The debrief needs stored session events; loaded once when the session completes.
  const [reportReady, setReportReady] = useState(false);
  // Raw DIS/PES/ADR scores sit behind a toggle once the story is rendered.
  const [showMetrics, setShowMetrics] = useState(false);

  // Honest, app-local session metrics. Everything here is measured inside
  // OFFLINE itself: foreground time while the session is ACTIVE, returns to
  // the app while ACTIVE (a proxy for "checks"), and paused time. Platform
  // screen-on / unlock counts are not available, so they are never claimed.
  const screenForegroundMsRef = useRef(0);
  const foregroundSinceRef = useRef<number | undefined>(undefined);
  const screenChecksRef = useRef(0);
  const pausedMsRef = useRef(0);
  const pauseStartRef = useRef<number | undefined>(undefined);
  const [notedMissionIds, setNotedMissionIds] = useState<string[]>([]);
  // Mirrors whether the live GPS guide (WalkingMonitor) is running, in state so
  // the render can branch without reading a ref.
  const [guideActive, setGuideActive] = useState(false);

  // Guidance + event logging react to navigation transitions, not to every GPS point.
  const navigationStatusRef = useRef<string | undefined>(undefined);
  const navigationSegmentRef = useRef(-1);

  // The walking guide re-resolves plan context on EVERY check from the freshest
  // screen state (plan, navigation, location) rather than the values captured
  // when the guide started. The function the monitor holds stays stable while
  // each call reads current state through the ref, so landmark/mission cues
  // follow the walker instead of freezing at guide start. The ref is refreshed
  // in an effect (never during render); monitor checks run on timers, long
  // after any effect has flushed, so they always see the latest context.
  const cueContextRef = useRef<() => PlanCueContext>(() => resolveCueContext(undefined, undefined, undefined));
  useEffect(() => {
    cueContextRef.current = () => resolveCueContext(plan, navigation, location);
  });

  useEffect(() => {
    initializeDatabase()
      .then(async () => {
        const openSession = await getLatestOpenSession();
        if (openSession) {
          const savedPlan = await getExperience(openSession.experienceId);
          if (savedPlan) {
            const recoveredSession =
              openSession.status === 'STARTED' ? { ...openSession, status: 'ACTIVE' as const } : openSession;
            setPlan(savedPlan);
            setSession(recoveredSession);
            setNavigation(createNavigationState(savedPlan.route));
            if (openSession.status === 'ACTIVE') {
              setLocationMessage('Recovered an unfinished session. Your saved route is ready.');
            }
          }
        }
        setDatabaseReady(true);
      })
      .catch(() => Alert.alert('Storage unavailable', 'The local session database could not be opened.'));
  }, []);

  useEffect(() => () => {
    void walkingMonitorRef.current?.stop();
  }, []);

  const sessionActive = session?.status === 'ACTIVE';

  // Measure app-visible time and returns-to-app only while a session is ACTIVE.
  useEffect(() => {
    if (!sessionActive) return;
    foregroundSinceRef.current = AppState.currentState === 'active' ? Date.now() : undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        screenChecksRef.current += 1;
        foregroundSinceRef.current = Date.now();
      } else if (foregroundSinceRef.current !== undefined) {
        screenForegroundMsRef.current += Date.now() - foregroundSinceRef.current;
        foregroundSinceRef.current = undefined;
      }
    });
    return () => {
      if (foregroundSinceRef.current !== undefined) {
        screenForegroundMsRef.current += Date.now() - foregroundSinceRef.current;
        foregroundSinceRef.current = undefined;
      }
      subscription.remove();
    };
  }, [sessionActive]);

  // Accumulate paused time so "uninterrupted minutes" reflects real pauses.
  const walkingStatus = walkingSnapshot?.status;
  useEffect(() => {
    if (walkingStatus === 'PAUSED') {
      pauseStartRef.current ??= Date.now();
    } else if (pauseStartRef.current !== undefined) {
      pausedMsRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = undefined;
    }
  }, [walkingStatus]);

  // React only to navigation state transitions: off-route, recovery, and
  // segment advances are the moments that deserve haptic guidance.
  useEffect(() => {
    if (!navigation || !session || session.status !== 'ACTIVE') return;
    const previousStatus = navigationStatusRef.current;
    if (previousStatus === undefined) {
      navigationStatusRef.current = navigation.status;
      navigationSegmentRef.current = navigation.currentSegmentIndex;
      return;
    }
    if (navigation.status === 'OFF_ROUTE' && previousStatus !== 'OFF_ROUTE') {
      void recordSessionEvent(session.id, 'NAVIGATION_OFF_ROUTE').catch(() => undefined);
      void signalGuidance('attention');
    } else if (previousStatus === 'OFF_ROUTE' && navigation.status !== 'OFF_ROUTE') {
      void recordSessionEvent(session.id, 'ROUTE_RECOVERED').catch(() => undefined);
      void signalGuidance('continue');
    }
    if (
      navigation.status !== 'OFF_ROUTE' &&
      navigation.currentSegmentIndex > navigationSegmentRef.current
    ) {
      void signalGuidance('turn');
    }
    navigationStatusRef.current = navigation.status;
    navigationSegmentRef.current = navigation.currentSegmentIndex;
  }, [navigation, session]);

  const report = useMemo(
    () => (plan && session?.status === 'COMPLETED' ? createSessionReport(session, plan) : undefined),
    [plan, session],
  );

  const story = useMemo(
    () =>
      report && plan && reportReady
        ? buildSessionStory(report, plan, sessionEvents, notedMissionIds)
        : undefined,
    [report, plan, reportReady, sessionEvents, notedMissionIds],
  );

  // The walk section of the debrief needs the session's stored events
  // (off-route / recovery). Missions and phone sections come from live state,
  // so mission toggles stay reflected even after this one-time load.
  useEffect(() => {
    if (!session || session.status !== 'COMPLETED' || reportReady) return;
    let cancelled = false;
    void getSessionEvents(session.id)
      .then((events) => {
        if (!cancelled) {
          setSessionEvents(events);
          // Only present when the data actually loaded: an unreadable event
          // log must never be reported as "you stayed on route."
          setReportReady(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session, reportReady]);

  // One mission at a time during the walk, advanced by the same cue-context
  // resolver the walking monitor uses — a single source of truth for the
  // active mission, no duplicated bracket math. Resolves to no mission when
  // plan, navigation, or location is missing (honest degradation), and the
  // ACTIVE gate keeps the mission off the screen outside a live walk.
  const currentMission =
    plan && session?.status === 'ACTIVE'
      ? resolveCueContext(plan, navigation, location).mission
      : undefined;

  function toggleMission(missionId: string) {
    if (!session || session.status !== 'COMPLETED') return;
    const wasNoted = notedMissionIds.includes(missionId);
    const next = wasNoted
      ? notedMissionIds.filter((id) => id !== missionId)
      : [...notedMissionIds, missionId];
    setNotedMissionIds(next);
    const updated: SessionRecord = {
      ...session,
      metrics: { ...session.metrics, missionCompletions: next.length },
    };
    setSession(updated);
    void saveSession(updated);
    void recordSessionEvent(
      session.id,
      wasNoted ? 'MISSION_UNNOTED' : 'MISSION_NOTED',
      missionId,
    ).catch(() => undefined);
  }

  async function generateExperience() {
    const minutes = Number(duration);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240) {
      Alert.alert('Choose a valid duration', 'Enter between 1 and 240 minutes.');
      return;
    }

    if (modelSetupRequired && !(await localModelManager.isDownloaded())) {
      setDownloadDialogVisible(true);
      return;
    }

    setLoading(true);
    // Fresh session, fresh honest counters.
    screenForegroundMsRef.current = 0;
    foregroundSinceRef.current = undefined;
    screenChecksRef.current = 0;
    pausedMsRef.current = 0;
    pauseStartRef.current = undefined;
    setNotedMissionIds([]);
    setWalkingSnapshot(undefined);
    navigationStatusRef.current = undefined;
    navigationSegmentRef.current = -1;
    try {
      let planningLocation: Location | undefined;
      try {
        if (await deviceLocationProvider.requestPermission() === 'granted') {
          planningLocation = await deviceLocationProvider.getCurrentLocation();
          setLocation(planningLocation);
        }
      } catch {
        setLocationMessage('Location is unavailable. Using a cached route template.');
      }
      // The hour is fixed at generation time so the plan variant (e.g. the
      // evening light mission) never depends on the wall clock at cue time.
      const nextPlan = await engine.create(
        minutes,
        planningLocation,
        undefined,
        walkMode,
        new Date().getHours(),
      );
      const safety = safetyEngine.validateExperience(nextPlan);
      if (!safety.safe) throw new Error(safety.reasons.join(' '));
      await saveExperience(nextPlan);
      const nextSession = transitionSession(createSession(nextPlan.id), 'PLANNED');
      await saveSession(nextSession);
      void recordSessionEvent(nextSession.id, 'SESSION_CREATED').catch(() => undefined);
      void recordSessionEvent(nextSession.id, 'EXPERIENCE_GENERATED', nextPlan.id).catch(() => undefined);
      setPlan(nextPlan);
      setSession(nextSession);
      setNavigation(createNavigationState(nextPlan.route));
    } catch (error) {
      Alert.alert('Could not prepare experience', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function downloadModel() {
    setDownloadLoading(true);
    setDownloadProgress(undefined);
    downloadCancelledRef.current = false;
    try {
      await localModelManager.download(setDownloadProgress);
      setDownloadDialogVisible(false);
    } catch (error) {
      if (!downloadCancelledRef.current) {
        Alert.alert('Download failed', error instanceof Error ? error.message : 'Please try again.');
      }
    } finally {
      setDownloadLoading(false);
    }
  }

  async function startWalkingGuide(): Promise<boolean> {
    if (!plan) return false;
    const permission = await deviceLocationProvider.requestPermission();
    if (permission !== 'granted') {
      setLocationMessage('Location permission was not granted. Continuing with the saved route.');
      await audioGuidance.speak('Location is unavailable. Follow the saved route and put your phone away.');
      return false;
    }
    const provider = new SystemVoiceProvider({
      ...integrationConfig.voice,
      enabled: walkingConfig.voiceEnabled,
    });
    const queuedVoice = new QueuedVoiceProvider(provider);
    const monitor = new WalkingMonitor({
      model: activeModel,
      voice: queuedVoice,
      voiceProvider: 'system',
      getCurrentLocation: () => deviceLocationProvider.getCurrentLocation(),
      subscribeToLocation: deviceLocationProvider.watchLocation,
      config: walkingConfig,
      routeSeed: plan.routeSeed ?? 0,
      cueContext: () => cueContextRef.current(),
    });
    monitor.subscribe((snapshot) => {
      setWalkingSnapshot(snapshot);
      if (snapshot.currentPosition) {
        setLocation(snapshot.currentPosition);
        setNavigation((previous) =>
          previous ? updateNavigationState(plan.route, snapshot.currentPosition!, previous) : previous,
        );
      }
    });
    walkingMonitorRef.current = monitor;
    await monitor.start();
    setGuideActive(true);
    setLocationMessage('Location active. Keep the phone down; cues are occasional.');
    return true;
  }

  async function stopWalkingGuide() {
    const monitor = walkingMonitorRef.current;
    if (monitor) {
      await monitor.stop();
      walkingMonitorRef.current = undefined;
    }
    setGuideActive(false);
  }

  async function startExperience() {
    if (!plan || !session) return;
    if (walkingMonitorRef.current) return;
    try {
      await startWalkingGuide();
      const started = transitionSession(session, 'STARTED');
      const active = transitionSession(started, 'ACTIVE');
      await saveSession(active);
      setSession(active);
      void recordSessionEvent(active.id, 'SESSION_STARTED').catch(() => undefined);
      await signalGuidance('continue');
    } catch (error) {
      await stopWalkingGuide();
      setLocationMessage(error instanceof Error ? error.message : 'Location is unavailable.');
      await audioGuidance.speak('Location is unavailable. Follow the saved route and put your phone away.');
    }
  }

  // Reconnects the guide for a recovered ACTIVE session without re-running the
  // session state machine (status is already ACTIVE).
  async function resumeGuide() {
    if (!plan || !session || session.status !== 'ACTIVE') return;
    try {
      await startWalkingGuide();
    } catch (error) {
      await stopWalkingGuide();
      setLocationMessage(error instanceof Error ? error.message : 'Location is unavailable.');
    }
  }

  async function completeExperience() {
    if (!plan || !session) return;
    await stopWalkingGuide();
    // Flush open measurement windows before snapshotting the metrics.
    if (foregroundSinceRef.current !== undefined) {
      screenForegroundMsRef.current += Date.now() - foregroundSinceRef.current;
      foregroundSinceRef.current = undefined;
    }
    if (pauseStartRef.current !== undefined) {
      pausedMsRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = undefined;
    }
    const totalMs = session.startedAt
      ? Math.max(0, Date.now() - Date.parse(session.startedAt))
      : plan.durationMinutes * 60_000;
    const completed = transitionSession(
      {
        ...session,
        metrics: {
          ...session.metrics,
          screenInteractions: screenChecksRef.current,
          screenSeconds: Math.round(screenForegroundMsRef.current / 1000),
          // One planning interaction plus every spoken walking cue.
          aiInteractions: 1 + (walkingSnapshot?.recentCueHistory.length ?? 0),
          // Missions stay at zero until the user marks them on the report.
          missionCompletions: notedMissionIds.length,
          routeCompleted: navigation?.status === 'COMPLETED',
          uninterruptedMinutes: Math.floor(Math.max(0, totalMs - pausedMsRef.current) / 60_000),
        },
      },
      'COMPLETED',
    );
    await saveSession(completed);
    setSession(completed);
    void recordSessionEvent(completed.id, 'SESSION_COMPLETED').catch(() => undefined);
    await signalGuidance('attention');
  }

  // One-tap audible debrief for when the phone comes back out after the walk.
  // Reuses the same guidance voice path; only the opening is a sound cue.
  function speakDebrief() {
    if (!story) return;
    const text = `${story.opening} ${story.sections.map((section) => section.text).join(' ')}`;
    void audioGuidance.speak(text);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
            LOCAL OUTDOOR EXPERIENCE
          </ThemedText>
          <ThemedText type="title" style={styles.title}>
            Get out of the way.
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.intro}>
            OFFLINE prepares a quiet walk, then asks less of you.
          </ThemedText>

          {!plan && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="subtitle">How long do you have?</ThemedText>
              <View style={styles.durationRow}>
                <TextInput
                  accessibilityLabel="Duration in minutes"
                  keyboardType="number-pad"
                  maxLength={3}
                  onChangeText={setDuration}
                  placeholder="30"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.durationInput, { color: theme.text, borderColor: theme.textSecondary }]}
                  value={duration}
                />
                <ThemedText>minutes</ThemedText>
              </View>
              <View style={styles.modeRow}>
                {WALK_MODE_OPTIONS.map((option) => {
                  const selected = walkMode === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setWalkMode(option.value)}
                      style={[styles.modeButton, selected && styles.modeButtonSelected]}>
                      <ThemedText type="small" themeColor={selected ? 'text' : 'textSecondary'}>
                        {option.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              <PrimaryButton
                disabled={!databaseReady || loading}
                label={loading ? 'Preparing...' : 'Prepare my experience'}
                onPress={generateExperience}
              />
              <ThemedText type="small" themeColor="textSecondary">
                {modelSetupRequired
                  ? 'TinyLlama runs on this device after a one-time download. No account or cloud AI is used.'
                  : 'The planner runs locally and deterministically. No account, no cloud AI, no download.'}
              </ThemedText>
            </ThemedView>
          )}

          {plan && session && session.status === 'PLANNED' && (
            <PlanCard plan={plan} location={location} onStart={startExperience} />
          )}

          {plan && session && session.status === 'ACTIVE' && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="subtitle">Disappear mode</ThemedText>
              <ThemedText style={styles.body}>
                The phone is now a fallback. Follow the route, notice what is around you, and return when you are ready.
              </ThemedText>
              <View style={styles.statusPill}>
                <ThemedText type="smallBold">ACTIVE · SCREEN DOWN</ThemedText>
              </View>
              <MapPreview plan={plan} location={location} />
              <ThemedText type="small" themeColor="textSecondary">
                {walkingSnapshot?.error ?? (navigation?.status === 'OFF_ROUTE'
                  ? 'You appear off the saved route. Stop and use normal navigation if you are unsure.'
                  : locationMessage)}
              </ThemedText>
              <ThemedText type="smallBold">
                {activeModel.metadata().displayName} · {walkingSnapshot?.movementState ?? 'stationary'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Distance since check: {Math.round(walkingSnapshot?.distanceMovedMeters ?? 0)} m · next check:{' '}
                {walkingSnapshot?.nextCheckAt ? `${walkingConfig.aiCheckIntervalMs / 1000}s interval` : 'waiting'}
              </ThemedText>
              <View style={styles.intervalRow}>
                {WALKING_INTERVAL_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      const nextConfig = { ...walkingConfig, aiCheckIntervalMs: option.value };
                      setWalkingConfig(nextConfig);
                      walkingMonitorRef.current?.updateConfig(nextConfig);
                    }}
                    style={[styles.intervalButton, walkingConfig.aiCheckIntervalMs === option.value && styles.intervalButtonSelected]}>
                    <ThemedText type="small">{option.label}</ThemedText>
                  </Pressable>
                ))}
              </View>
              {guideActive ? (
                walkingSnapshot?.status === 'PAUSED' ? (
                  <PrimaryButton label="Resume walking" onPress={() => walkingMonitorRef.current?.resume()} />
                ) : (
                  <PrimaryButton label="Pause walking" onPress={() => walkingMonitorRef.current?.pause()} />
                )
              ) : (
                <PrimaryButton label="Reconnect GPS guide" onPress={resumeGuide} />
              )}
              {navigation?.nextInstruction && navigation.status !== 'COMPLETED' && (
                <ThemedText style={styles.nextInstruction}>
                  Next: {navigation.nextInstruction.text}
                </ThemedText>
              )}
              {currentMission && (
                <ThemedText style={styles.nextInstruction}>
                  Mission: {currentMission.prompt}
                </ThemedText>
              )}
              <PrimaryButton label="I’m back" onPress={completeExperience} />
            </ThemedView>
          )}

          {report && plan && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="subtitle">Welcome back.</ThemedText>
              <ThemedText style={styles.body}>You did not need the AI for most of the walk.</ThemedText>
              {story && (
                <>
                  <ThemedText style={styles.routeSummary}>{story.opening}</ThemedText>
                  {story.sections.map((section) => (
                    <View key={section.heading} style={styles.storySection}>
                      <ThemedText type="smallBold" themeColor="textSecondary">
                        {section.heading}
                      </ThemedText>
                      <ThemedText style={styles.body}>{section.text}</ThemedText>
                    </View>
                  ))}
                  <ThemedText type="small" themeColor="textSecondary">
                    Every line above is derived from your walk — nothing invented.
                  </ThemedText>
                </>
              )}
              {plan.missions.length > 0 && (
                <>
                  <ThemedText type="smallBold" style={styles.sectionLabel}>
                    Which did you notice? (optional)
                  </ThemedText>
                  {plan.missions.map((mission) => {
                    const noted = notedMissionIds.includes(mission.id);
                    return (
                      <Pressable
                        key={mission.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: noted }}
                        onPress={() => toggleMission(mission.id)}
                        style={styles.missionRow}>
                        <ThemedText themeColor={noted ? 'text' : 'textSecondary'}>
                          {noted ? '✓ ' : '○ '}
                          {mission.prompt}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </>
              )}
              {story ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setShowMetrics((visible) => !visible)}
                    style={styles.metricToggle}>
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      {showMetrics ? 'Hide' : 'Show'} how this is measured
                    </ThemedText>
                  </Pressable>
                  {showMetrics && (
                    <MetricRows report={report} plan={plan} />
                  )}
                </>
              ) : (
                <MetricRows report={report} plan={plan} />
              )}
              {story && integrationConfig.voice.enabled && (
                <PrimaryButton label="Read my debrief" onPress={speakDebrief} />
              )}
              <PrimaryButton
                label="Plan another walk"
                onPress={() => {
                  setPlan(undefined);
                  setSession(undefined);
                }}
              />
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push('/archive')}
                style={styles.pastWalksLink}>
                <ThemedText type="small" themeColor="textSecondary">
                  Past walks
                </ThemedText>
              </Pressable>
            </ThemedView>
          )}
        </ScrollView>
      </SafeAreaView>
      <Modal
        animationType="fade"
        transparent
        visible={downloadDialogVisible}
        onRequestClose={() => {
          if (!downloadLoading) setDownloadDialogVisible(false);
        }}>
        <View style={styles.modalBackdrop}>
          <ThemedView type="backgroundElement" style={styles.downloadCard}>
            <ThemedText type="subtitle">Set up local AI</ThemedText>
            <ThemedText themeColor="textSecondary">
              TinyLlama is downloaded once to this device ({Math.round(integrationConfig.model.sizeBytes / 1_000_000)} MB).
              It stays available offline after that.
            </ThemedText>
            {downloadLoading && (
              <>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.round((downloadProgress?.fraction ?? 0) * 100)}%` },
                    ]}
                  />
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {downloadProgress ? `${Math.round(downloadProgress.fraction * 100)}% downloaded` : 'Starting download...'}
                </ThemedText>
              </>
            )}
            {!downloadLoading && (
              <PrimaryButton label="Download TinyLlama" onPress={downloadModel} />
            )}
            {downloadLoading ? (
              <Pressable
                onPress={() => {
                  downloadCancelledRef.current = true;
                  void localModelManager.cancelDownload().then(() => {
                    setDownloadLoading(false);
                    setDownloadProgress(undefined);
                  });
                }}
                style={styles.cancelButton}>
                <ThemedText type="smallBold">Cancel download</ThemedText>
              </Pressable>
            ) : (
              <Pressable onPress={() => setDownloadDialogVisible(false)} style={styles.cancelButton}>
                <ThemedText type="smallBold">Not now</ThemedText>
              </Pressable>
            )}
          </ThemedView>
        </View>
      </Modal>
    </ThemedView>
  );
}

function PlanCard({
  plan,
  location,
  onStart,
}: {
  plan: ExperiencePlan;
  location?: Location;
  onStart: () => void;
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="subtitle">Your experience is ready.</ThemedText>
      <ThemedText style={styles.routeSummary}>{plan.route.summary}</ThemedText>
      <ThemedText themeColor="textSecondary">
        {plan.route.distanceKm} km · about {plan.durationMinutes} minutes · offline
      </ThemedText>
      <MapPreview plan={plan} location={location} />
      <ThemedText type="smallBold" style={styles.sectionLabel}>Landmarks</ThemedText>
      {plan.landmarks.map((landmark) => (
        <View key={landmark.id} style={styles.landmark}>
          <ThemedText type="smallBold">{landmark.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{landmark.description}</ThemedText>
        </View>
      ))}
      <ThemedText type="smallBold" style={styles.sectionLabel}>Try noticing</ThemedText>
      {plan.missions.map((mission) => (
        <View key={mission.id} style={styles.mission}>
          <ThemedText style={styles.missionDot}>•</ThemedText>
          <ThemedText style={styles.missionText}>{mission.prompt}</ThemedText>
        </View>
      ))}
      <ThemedText type="small" themeColor="textSecondary">
        Attention budget: {plan.attentionBudget.maxScreenInteractions} screen checks,{' '}
        {plan.attentionBudget.maxScreenSeconds} seconds on screen.
      </ThemedText>
      <PrimaryButton label="Start · put phone away" onPress={onStart} />
    </ThemedView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <ThemedText themeColor="textSecondary">{label}</ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

function MetricRows({ report, plan }: { report: SessionReport; plan: ExperiencePlan }) {
  return (
    <>
      <Metric label="Outdoor time" value={`${report.durationMinutes} min`} />
      <Metric label="Uninterrupted time" value={`${report.uninterruptedMinutes} min`} />
      <Metric label="Route completed" value={report.routeCompleted ? 'Yes' : 'Not quite'} />
      <Metric
        label="Missions noticed"
        value={`${report.missionCompletions} / ${plan.missions.length}`}
      />
      <Metric label="Digital intrusion score" value={`${report.digitalIntrusionScore}`} />
      <Metric label="Physical engagement score" value={`${report.physicalEngagementScore}`} />
      <Metric label="AI disappearance rate" value={`${Math.round(report.aiDisappearanceRate * 100)}%`} />
      <ThemedText type="small" themeColor="textSecondary">
        Scores are OFFLINE-defined experimental metrics. Screen values are app-local proxies
        measured during this session; unlock counts are not available on this platform.
      </ThemedText>
    </>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, disabled && styles.buttonDisabled, pressed && styles.buttonPressed]}>
      {disabled ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.buttonText}>{label}</ThemedText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  eyebrow: { letterSpacing: 1.5 },
  title: { fontSize: 44, lineHeight: 48, maxWidth: 360 },
  intro: { fontSize: 18, lineHeight: 26, maxWidth: 360 },
  card: { borderRadius: 24, padding: Spacing.four, gap: Spacing.three },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  durationInput: {
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 24,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    width: 110,
  },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  modeButton: { borderColor: '#aeb8b0', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  modeButtonSelected: { backgroundColor: '#d7eadf', borderColor: '#1e6b52' },
  button: {
    alignItems: 'center',
    backgroundColor: '#1e6b52',
    borderRadius: 14,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: '#ffffff', fontWeight: '700' },
  body: { fontSize: 17, lineHeight: 26 },
  routeSummary: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
  nextInstruction: { fontSize: 19, lineHeight: 28, fontWeight: '700' },
  landmark: { borderLeftColor: '#d47c46', borderLeftWidth: 3, gap: 2, paddingLeft: Spacing.two },
  sectionLabel: { marginTop: Spacing.two },
  storySection: { gap: 2 },
  metricToggle: { marginTop: Spacing.two, paddingVertical: Spacing.two },
  missionRow: { paddingVertical: Spacing.one },
  mission: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  missionDot: { color: '#1e6b52', fontSize: 20, lineHeight: 24 },
  missionText: { flex: 1 },
  statusPill: { alignSelf: 'flex-start', backgroundColor: '#d7eadf', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  metric: { flexDirection: 'row', justifyContent: 'space-between', borderBottomColor: '#c9cec9', borderBottomWidth: 1, paddingVertical: Spacing.two },
  intervalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  intervalButton: { borderColor: '#aeb8b0', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  intervalButtonSelected: { backgroundColor: '#d7eadf', borderColor: '#1e6b52' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)', padding: Spacing.four },
  downloadCard: { width: '100%', maxWidth: 360, borderRadius: 20, padding: Spacing.four, gap: Spacing.three },
  progressTrack: { height: 8, width: '100%', overflow: 'hidden', borderRadius: 999, backgroundColor: '#d6ddd8' },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: '#1e6b52' },
  cancelButton: { alignItems: 'center', paddingVertical: Spacing.one },
  pastWalksLink: { alignItems: 'center', paddingVertical: Spacing.one },
});
