This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md


# AGENT.md — OFFLINE

> **Project rule: Build an AI that knows when to get out of the way.**

This file defines the engineering context, product principles, architecture constraints, safety requirements, development workflow, and agent behavior for contributors and coding agents working on **OFFLINE**.

---

# 1. Project Identity

## Name

**OFFLINE**

## Tagline

> **AI that gets out of your way.**

## Core thesis

OFFLINE is an open-source, local-AI outdoor experience system whose success is measured by how little the user needs it.

It prepares a personalized outdoor experience, provides minimal guidance through audio/haptics, and deliberately disappears so the user can engage with the physical environment.

---

# 2. The Most Important Rule

## Never optimize for app engagement.

OFFLINE must optimize for:

```text
physical-world engagement ↑
digital intrusion ↓
AI dependency ↓
screen interaction ↓
```

Never introduce a feature simply because it:

- increases app sessions
- increases notifications
- increases chat
- increases screen time
- creates a feed
- encourages compulsive interaction
- makes the user look at the phone unnecessarily

If a feature makes the phone more central to the outdoor experience, challenge it.

---

# 3. Product Philosophy

The physical world is the primary interface.

The phone is a temporary scaffold.

The AI should disappear.

The strongest possible user session is:

```text
AI plans
    ↓
User starts
    ↓
Phone goes away
    ↓
User explores
    ↓
AI remains mostly silent
    ↓
User returns
    ↓
AI reports what happened
```

The goal is not to create an AI companion that users continuously talk to.

The goal is to create an AI system that makes continuous interaction unnecessary.

---

# 4. What OFFLINE Is

OFFLINE is:

- local-first
- offline-capable
- open-source
- open-model compatible
- outdoor-oriented
- experiment-oriented
- privacy-conscious
- low-interaction by design

OFFLINE is a:

> **behavioral and HCI research prototype**

It is not a medical product.

---

# 5. What OFFLINE Is NOT

Do not turn OFFLINE into:

- a social network
- a fitness tracker
- a chatbot
- a digital detox blocker
- a conventional hiking app
- a Google Maps clone
- a wildlife encyclopedia
- a mental-health therapist
- a medical diagnostic system
- an engagement platform
- an ad platform

---

# 6. Scientific Positioning

Existing research motivates investigation into:

- smartphone distraction
- nature exposure
- attention restoration
- outdoor activity
- digital wellbeing
- environmental connectedness

But OFFLINE's effectiveness is not established.

Never write:

> "OFFLINE improves mental health."

Prefer:

> "OFFLINE investigates whether a deliberately low-interaction AI system can reduce smartphone engagement during outdoor activity."

Never present project-defined metrics as clinically or scientifically validated measurements.

---

# 7. Core Research Question

> **Can an AI system deliberately designed to minimize interaction increase engagement with the physical environment?**

Potential hypotheses:

### H1

An AI system optimized to minimize interaction can reduce smartphone engagement during outdoor activity compared with conventional phone-mediated outdoor navigation.

### H2

Reduced smartphone interaction is associated with greater self-reported environmental engagement.

### H3

Local AI can provide useful outdoor assistance without continuous internet connectivity.

---

# 8. Core Metrics

These are experimental project metrics.

## Digital Intrusion Score

Possible formulation:

```text
DIS =
    screen unlocks
  + navigation checks
  + app switches
  + unnecessary AI interactions
  + normalized screen-on duration
```

Lower is better.

Do not claim the formula is scientifically validated.

---

## Physical Engagement Score

Possible formulation:

```text
PES =
    outdoor duration
  + uninterrupted walking
  + completed exploration tasks
  + environmental observations
  + route completion
```

Higher is better.

This is an internal experimental metric.

---

## AI Disappearance Rate

```text
ADR =
time requiring no AI
--------------------
total experience time
```

Higher is better.

---

# 9. Optimization Objective

The conceptual objective is:

```text
maximize PES
minimize DIS
minimize AI dependency
```

A configurable formulation may be:

```text
Objective =
    α * PhysicalEngagement
  - β * DigitalIntrusion
  - γ * AIDependency
```

Do not hard-code scientific meaning into these weights without documentation.

---

# 10. Local-First Requirement

Sensitive information should remain local whenever possible.

Potentially sensitive information includes:

- location
- routes
- movement
- walking history
- preferences
- environmental recordings
- behavioral metrics

Default architecture:

```text
sensor
  ↓
device
  ↓
local processing
  ↓
local storage
```

Not:

```text
sensor
  ↓
cloud
  ↓
third-party AI
  ↓
analytics
```

Cloud features must be optional.

---

# 11. Offline Requirement

The core experience must be designed to work without internet connectivity.

Target flow:

```text
Before leaving:

download/precompute
    ↓
route
landmarks
missions
local model
safety data
    ↓
AIRPLANE MODE
    ↓
experience
```

Never make the core experience depend on a live API.

---

# 12. AI Architecture

Use an abstraction around local models.

Do NOT write the entire application around a specific model SDK.

Preferred conceptual interface:

```text
LocalModel
├── load()
├── generate()
├── stream()
├── unload()
└── metadata()
```

Then:

```text
TinyLlamaAdapter
OtherOpenModelAdapter
```

The experience engine should not care which model is being used.

---

# 13. AI Responsibilities

The AI can help with:

- experience planning
- mission generation
- personalization
- route interpretation
- landmark descriptions
- environmental interpretation
- post-session summarization

The AI must NOT be the sole authority for:

- emergency decisions
- safety-critical routing
- restricted-area decisions
- dangerous road crossings
- medical decisions

Use deterministic safety rules around model outputs.

---

# 14. Experience Object

A conceptual experience should look like:

```json
{
  "durationMinutes": 40,
  "route": {},
  "landmarks": [],
  "missions": [],
  "attentionBudget": {
    "maxScreenInteractions": 5,
    "maxScreenSeconds": 90,
    "maxAIInteractions": 3
  },
  "safety": {},
  "offline": true
}
```

Keep schemas versioned.

Example:

```text
experience.schema.v1
```

---

# 15. Mission Design

Missions should redirect attention toward the environment.

Good:

- Find three different leaf shapes.
- Listen for three different sounds.
- Find something older than you.
- Walk for five minutes without looking at your phone.
- Find a place where you can hear water.

Bad:

- Take a photo.
- Open the app.
- Chat with AI.
- Post to social media.
- Check a leaderboard.
- Answer unnecessary questions.

Every mission should be evaluated with:

> Does this make the user more aware of the physical environment?

---

# 16. Interaction Hierarchy

Priority:

```text
1. Physical environment
2. Haptics
3. Audio
4. Screen
```

The screen should be the last resort.

---

# 17. Disappearance Mode

Disappearance Mode is a first-class product feature.

Expected lifecycle:

```text
PLANNING
   ↓
START
   ↓
MINIMAL_GUIDANCE
   ↓
DISAPPEAR
   ↓
SAFETY_OVERRIDE if necessary
   ↓
COMPLETE
   ↓
REPORT
```

Do not turn Disappearance Mode into a visual gimmick.

It should materially reduce interaction.

---

# 18. Safety Requirements

Safety always overrides minimal interaction.

The system must:

- allow immediate user override
- preserve emergency functionality
- avoid dangerous routing
- avoid unsafe crossing instructions
- avoid restricted areas
- consider weather when available
- avoid encouraging users to ignore hazards
- provide a way to return to normal phone operation

Never intentionally disable critical phone functionality.

---

# 19. Privacy Requirements

Never collect data unless it has a documented purpose.

Default:

```text
No account required
No advertising
No behavioral selling
No unnecessary analytics
No hidden telemetry
Local storage where practical
```

Users should be able to:

- inspect stored data
- delete sessions
- export experiment data
- understand what is collected

---

# 20. Repository Structure

Expected structure:

```text
offline/
│
├── AGENT.md
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── SECURITY.md
│
├── apps/
│   ├── mobile/
│   └── web/
│
├── packages/
│   ├── ai-core/
│   ├── navigation/
│   ├── experience-engine/
│   ├── interaction-engine/
│   ├── environmental-ai/
│   ├── analytics/
│   ├── safety/
│   └── shared/
│
├── models/
│   └── README.md
│
├── experiments/
│   ├── protocols/
│   ├── data/
│   ├── analysis/
│   └── reports/
│
├── docs/
│   ├── architecture/
│   ├── research/
│   ├── privacy/
│   └── design/
│
├── scripts/
│
└── tests/
```

Agents may adjust this structure if the chosen implementation stack requires it, but architecture changes must be justified.

---

# 21. Development Priorities

Priority order:

```text
P0
Core offline experience

P1
Local AI planning

P1
Minimal audio/haptic interaction

P1
Disappearance Mode

P1
Session metrics

P2
Scientific experiment mode

P2
Environmental intelligence

P3
Optional integrations
```

Do not work on P2/P3 features before the P0/P1 path works end-to-end.

---

# 22. MVP

The minimum working product must support:

```text
User:
"I have 30 minutes."

        ↓

Local AI

        ↓

Experience

        ├── route
        ├── landmarks
        ├── missions
        └── attention budget

        ↓

Start

        ↓

Phone away

        ↓

Audio/haptic guidance

        ↓

Outdoor experience

        ↓

Return

        ↓

Session report
```

If this loop works, the project has a valid MVP.

---

# 23. Demo Requirements

The demo MUST happen outdoors.

Do not demo the complete concept entirely inside an IDE or browser.

Preferred sequence:

```text
1. Start OFFLINE
2. Enter duration
3. Generate experience
4. Put phone away
5. Go outside
6. Follow minimal guidance
7. Complete missions
8. Return
9. Show metrics
```

The demo should visibly demonstrate reduced phone interaction.

---

# 24. Demo Opening

Recommended opening:

> "I'm going to show you an AI product. But you won't see the AI for most of the demo."

Then:

> "Because the AI's job is to get out of the way."

---

# 25. Demo Closing

Recommended closing:

> **"The AI worked best when I stopped using it."**

Alternative:

> **"Most technology asks for your attention. OFFLINE gives it back."**

---

# 26. Coding Rules for Agents

Before implementing a feature, answer:

1. Does this help the user spend more time in the physical world?
2. Does this reduce or increase screen interaction?
3. Can this work locally?
4. Does this introduce unnecessary cloud dependency?
5. Does this collect sensitive data?
6. Is there a deterministic safety fallback?
7. Can the feature be tested?
8. Does it belong in the MVP?

If the answers are unclear, prefer the simpler implementation.

---

# 27. LLM Agent Rules

Coding agents must:

- inspect existing architecture before modifying it
- avoid rewriting working components unnecessarily
- preserve public interfaces where practical
- write tests for non-trivial behavior
- avoid inventing APIs
- avoid hard-coding secrets
- avoid adding unnecessary dependencies
- document architectural decisions
- keep changes small and reviewable
- prioritize offline behavior
- treat safety logic as high priority
- never silently weaken privacy controls

---

# 28. Prompt Engineering Rules

The experience planner should be instructed to:

- minimize interaction
- favor physical-world observation
- produce concise instructions
- avoid unnecessary conversational output
- respect user time
- respect safety constraints
- avoid dangerous instructions
- avoid excessive missions
- avoid screen-dependent tasks

Bad:

> "Would you like me to tell you more about this bird?"

Good:

> "You heard a bird. Look around."

---

# 29. Model Output Validation

Never trust raw model output.

Pipeline:

```text
LLM
 ↓
Schema validation
 ↓
Safety validation
 ↓
Constraint validation
 ↓
Experience acceptance
 ↓
Execution
```

Example constraints:

```text
duration > 0
duration <= configured maximum

mission count <= configured maximum

screen interactions <= attention budget

route exists

safety constraints satisfied
```

---

# 30. Environmental Audio

If audio classification is implemented:

- use short intentional samples
- process locally where practical
- avoid continuous recording by default
- don't store raw audio unless explicitly necessary
- document retention
- allow the user to disable it

Do not turn environmental intelligence into surveillance.

---

# 31. Experiment Mode

Experiment mode must distinguish:

### Control

Normal outdoor behavior.

### Intervention

OFFLINE-guided behavior.

Record:

- session ID
- condition
- duration
- screen metrics
- interaction count
- route completion
- mission completion
- optional self-report metrics

Do not collect personally identifying information unless required and explicitly consented to.

---

# 32. Scientific Integrity

Agents and contributors must not:

- fabricate research results
- fabricate participant data
- call project metrics clinically validated
- claim causality from uncontrolled observations
- present an N-of-1 experiment as population-level evidence
- hide negative results

If results are negative:

> Report them.

Negative results are valuable for this project.

---

# 33. Research Reporting

Every experiment report should include:

```text
Objective
Hypothesis
Participants/sessions
Protocol
Control condition
OFFLINE condition
Metrics
Results
Limitations
Potential confounders
Conclusion
```

---

# 34. Partner Integrations

Preferred:

## TinyLlama

Use the pinned TinyLlama GGUF as the primary local model where practical.

## Sentry

Use only if tracing can be implemented without violating the project's privacy principles.

## GitHub Copilot

Can be used during development and documented in the build story.

## Entire

Can be used to capture agent development sessions.

Do not add partners purely for promotional reasons.

---

# 35. Technology Selection

Technology should be chosen based on:

1. local execution capability
2. offline support
3. mobile reliability
4. open-source compatibility
5. development speed
6. maintainability

Do not choose a technology because it is trendy.

---

# 36. Testing

Minimum test categories:

```text
Unit tests
Integration tests
Schema tests
Safety tests
Offline tests
Model-output validation tests
Analytics tests
```

Important cases:

```text
No internet
No GPS
Low battery
Invalid model output
Unsafe route
Missing landmark
Interrupted session
User cancels
Emergency override
Model unavailable
```

---

# 37. Failure Behavior

If AI fails:

```text
AI unavailable
     ↓
fallback experience
```

The user should still be able to:

- continue safely
- return home
- access normal navigation
- cancel the session

The AI must never be a single point of failure for safety.

---

# 38. Git Workflow

Use small commits.

Preferred:

```text
feat: add local experience planner
feat: add attention budget
feat: add haptic guidance
feat: add disappearance mode
feat: add session metrics
test: validate experience schema
test: validate safety constraints
docs: add research protocol
```

Avoid giant commits such as:

```text
feat: build everything
```

---

# 39. Pull Request Requirements

Every PR should include:

```text
What changed?

Why?

How was it tested?

Does it affect privacy?

Does it affect offline operation?

Does it affect safety?

Does it increase screen interaction?
```

If it increases screen interaction, explain why.

---

# 40. Definition of Done

A feature is not done merely because it compiles.

It is done when:

- implementation works
- tests exist where appropriate
- offline behavior is considered
- safety behavior is considered
- privacy implications are documented
- UX does not violate the core thesis
- documentation is updated
- no unnecessary dependencies were added

---

# 41. Anti-Patterns

Never introduce:

```text
Infinite scroll
Push notifications for engagement
Daily streaks
Social feeds
AI chat as the default interface
Constant GPS tracking
Continuous microphone recording
Cloud-only inference
Gamification that requires screen use
Ads
Attention-grabbing animations
```

Unless a future research experiment explicitly requires one, these violate the core philosophy.

---

# 42. Product Decision Rule

When two implementations are functionally equivalent:

Choose the one that:

```text
uses less battery
uses less network
uses less screen time
stores less data
requires less AI interaction
has fewer dependencies
is easier to understand
is easier to test
```

---

# 43. Architectural Decision Rule

Prefer:

```text
local
deterministic
simple
observable
testable
replaceable
```

over:

```text
cloud
opaque
complex
tightly coupled
unobservable
irreversible
```

---

# 44. Long-Term Vision

OFFLINE should eventually support:

- walking
- hiking
- running
- cycling
- gardening
- birding
- tourism
- nature exploration
- children's outdoor exploration
- educational field trips

The common architecture is:

```text
AI preparation
      ↓
physical experience
      ↓
minimal digital interaction
      ↓
AI disappearance
      ↓
measurement
```

---

# 45. Final Principle

> **If the user remembers the AI more than they remember the walk, OFFLINE failed.**

The project exists to explore whether technology can stop demanding attention and start protecting it.
