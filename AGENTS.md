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

Run lint, typecheck and `npm run test:all` before declaring any task done.

## Navigation & Routing

- This app is currently a **single screen**: `index.ts` registers `App.tsx`, which renders panels from `src/components/`. Expo Router is **not installed** and there is no `src/app/` directory. Do not add routes or import from `expo-router` unless the task is to introduce navigation.
- If a second screen is ever needed, add Expo Router then (`npx expo install expo-router`, routes in `src/app/`). Docs: https://docs.expo.dev/router/introduction.md

## Project layout

- `src/automatic*.ts` and `src/reminderPlan.ts` are shared by the app and the Supabase Edge Functions (Deno). Keep them free of React Native and Expo imports, and keep the `.ts` extension on their relative imports.
- `supabase/functions/` holds the scheduled workers; `supabase/migrations/` and `supabase/schedules/` are applied by hand in the Supabase SQL Editor.
- Stored reports are re-validated by recomputing the bias (`readAutoReport`). Changing rule logic or reason text in `src/automaticBias.ts` makes archived reports unreadable; add a new versioned model instead of editing `fundamental-scenario-v1`.
- `npm run test:all` runs the app tests, the Deno worker tests and the Python tests.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
