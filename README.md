# @hexhad/react-utils

Performance-focused React and React Native utilities, written in TypeScript.

---

## Installation

```bash
npm install @hexhad/react-utils
# or
yarn add @hexhad/react-utils
```

React ≥ 17 is required as a peer dependency.

---

## What's inside

```
src/
└── utils/
    ├── ProviderTreeCreator.ts
    └── GlobalModalManager.ts
```

---

## ProviderTreeCreator

Composes multiple context providers into a single wrapper component, eliminating deeply nested "provider hell".

### The problem

```tsx
// Hard to read, hard to reorder, easy to get wrong
export default function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
```

### The solution

```tsx
import { ProviderTreeCreator } from '@hexhad/react-utils';
import type { ProviderEntry } from '@hexhad/react-utils';

// Declare outside the component so WeakMap caching kicks in
const providers: ProviderEntry[] = [
  [ThemeProvider, { theme: darkTheme }],
  [AuthProvider],
  [QueryClientProvider, { client: queryClient }],
  [NavigationContainer],
];

const AppProviders = ProviderTreeCreator(providers);

export default function App() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}
```

Providers are applied **outermost-first** — left to right in the array maps to top to bottom in the tree.

### Performance

- The innermost `FragmentWrapper` is defined at module level and never recreated.
- Each intermediate wrapper is a named function so React DevTools shows `ProviderTreeCreator(ThemeProvider)` instead of anonymous arrows.
- When you declare the providers array outside your component, `ProviderTreeCreator` returns the cached result on repeat calls via a `WeakMap` — zero re-computation.

### API

```ts
ProviderTreeCreator(providers: ProviderEntry[]): ComposedProvider
```

```ts
// A single entry — component plus optional props
type ProviderEntry<P> =
  | [ComponentType<PropsWithChildren<P>>, P]
  | [ComponentType<PropsWithChildren<P>>];

// The resulting wrapper component
type ComposedProvider = ComponentType<PropsWithChildren<object>>;
```

---

## GlobalModalManager

A zero-dependency, typed modal manager for React Native (and React DOM). It manages state, refs, props, and listeners for every modal in your app from a single place, without any React context or re-renders.

### Behaviour

- Calling `show` closes all other open modals first by default (`closeOthers: true`).
- If the target modal is already open, `show` updates its props and notifies listeners without calling `present()` again.
- `hide` calls `dismiss()` on the modal ref, clears its props, and notifies listeners.
- `toggle` calls `hide` if the modal is open, otherwise `show`.
- `updateState` is for syncing external dismissal (e.g. a swipe-down gesture) back into the manager without calling `dismiss()` again.
- Every listener removal returns an unsubscribe function — no need to call `removeAllListeners` manually.
- After `destroy()` is called, every method becomes a no-op.

### Setup

```ts
// src/modals.ts
import { createModalManager } from '@hexhad/react-utils';

export const MODAL_NAMES = {
  PORTAL_GUN: 'PortalGun',
  MEESEEKS_BOX: 'MeeseeksBox',
  PLUMBUS: 'Plumbus',
} as const;

export type ModalName = (typeof MODAL_NAMES)[keyof typeof MODAL_NAMES];

// Optional — gives you fully typed props per modal at zero runtime cost
declare module '@hexhad/react-utils' {
  interface ModalPropsRegistry {
    PortalGun: { destination: string; onConfirm: () => void };
    MeeseeksBox: { task: string; onComplete: () => void };
    Plumbus: { quantity: number };
  }
}

export const GlobalModalManager = createModalManager<ModalName>(MODAL_NAMES);
```

### Attaching refs

Render all your modals in one place and attach the manager's refs:

```tsx
// src/ModalCenter.tsx
import { GlobalModalManager, MODAL_NAMES } from './modals';

export function ModalCenter() {
  return (
    <>
      <PortalGunModal ref={GlobalModalManager.getRef(MODAL_NAMES.PORTAL_GUN)} />
      <MeeseeksBoxModal
        ref={GlobalModalManager.getRef(MODAL_NAMES.MEESEEKS_BOX)}
      />
      <PlumbusModal ref={GlobalModalManager.getRef(MODAL_NAMES.PLUMBUS)} />
    </>
  );
}
```

### Opening and closing

```ts
// Auto-generated convenience methods (one per modal name)
GlobalModalManager.openPortalGun({
  destination: 'Dimension C-137',
  onConfirm: () => {},
});
GlobalModalManager.closePortalGun();
GlobalModalManager.togglePortalGun();

// Generic methods
GlobalModalManager.show(MODAL_NAMES.PORTAL_GUN, {
  destination: 'Dimension C-137',
  onConfirm: () => {},
});
GlobalModalManager.hide(MODAL_NAMES.PORTAL_GUN);
GlobalModalManager.toggle(MODAL_NAMES.PORTAL_GUN);

// Open alongside other modals instead of replacing them
GlobalModalManager.show(MODAL_NAMES.PLUMBUS, {
  closeOthers: false,
  quantity: 3,
});

// Close everything
GlobalModalManager.closeAll();
```

### Reading state

```ts
GlobalModalManager.isOpen(MODAL_NAMES.PORTAL_GUN); // boolean
GlobalModalManager.isAnyOpen(); // boolean
GlobalModalManager.getOpenModal(); // first open name or null
GlobalModalManager.getOpenModals(); // all open modal names
GlobalModalManager.getState(); // frozen { isPortalGunOpen: false, ... }
```

### Props

```ts
// Get all props for a modal (typed if ModalPropsRegistry is augmented)
const props = GlobalModalManager.getProps(MODAL_NAMES.PORTAL_GUN);
// props.destination → string

// Get one prop with an optional default
const dest = GlobalModalManager.getProp(
  MODAL_NAMES.PORTAL_GUN,
  'destination',
  'Citadel'
);

// Replace all props
GlobalModalManager.setProps(MODAL_NAMES.PORTAL_GUN, {
  destination: 'Blips and Chitz',
  onConfirm: () => {},
});

// Merge into existing props
GlobalModalManager.updateProps(MODAL_NAMES.PORTAL_GUN, {
  destination: 'Cronenberg World',
});

// Set one prop
GlobalModalManager.setProp(
  MODAL_NAMES.PORTAL_GUN,
  'destination',
  'Bird Person Home'
);

// Clear props for one modal
GlobalModalManager.clearProps(MODAL_NAMES.PORTAL_GUN);

// Clear all
GlobalModalManager.clearAllProps();
```

### Reading props inside a modal component

```tsx
// src/modals/PortalGunModal.tsx
import { forwardRef, useEffect, useState } from 'react';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { GlobalModalManager, MODAL_NAMES } from '../modals';

export const PortalGunModal = forwardRef((_, ref) => {
  const [props, setProps] = useState(
    GlobalModalManager.getProps(MODAL_NAMES.PORTAL_GUN)
  );

  useEffect(() => {
    return GlobalModalManager.addListener(
      MODAL_NAMES.PORTAL_GUN,
      (isOpen, latest) => {
        if (isOpen) setProps(latest);
      }
    );
  }, []);

  return (
    <BottomSheetModal ref={ref}>
      <Text>{props.destination}</Text>
      <Button title="Go" onPress={props.onConfirm} />
    </BottomSheetModal>
  );
});
```

### Listeners

```ts
// Per-modal listener
const unsub = GlobalModalManager.addListener(
  MODAL_NAMES.PORTAL_GUN,
  (isOpen, props) => {
    console.log(isOpen, props.destination);
  }
);
unsub(); // unsubscribe

// Global listener — fires for every modal event
const unsub = GlobalModalManager.addGlobalListener(
  ({ type, modalName, isOpen }) => {
    analytics.track('modal', { type, modalName, isOpen });
  }
);
unsub();

// Remove all listeners for one modal
GlobalModalManager.removeAllListeners(MODAL_NAMES.PORTAL_GUN);

// Remove everything
GlobalModalManager.removeAllListeners();
```

### Syncing external dismissal

When a bottom sheet is swiped closed by the user, the manager doesn't know. Call `updateState` from the sheet's `onDismiss` to keep state in sync without triggering a redundant `dismiss()` call:

```tsx
<BottomSheetModal
  ref={ref}
  onDismiss={() =>
    GlobalModalManager.updateState(MODAL_NAMES.PORTAL_GUN, false)
  }
/>
```

### Dynamic registration

```ts
// Register a modal that is not in MODAL_NAMES
GlobalModalManager.registerModal('Snuffles');
GlobalModalManager.openSnuffles({ wantsTalk: true }); // convenience method auto-attached

// Remove it
GlobalModalManager.unregisterModal('Snuffles');
```

### Cleanup

```ts
// Useful for test teardown or module hot reload
GlobalModalManager.destroy();
// All modals closed, all listeners cleared, all state wiped.
// Every method is a silent no-op after this point.
```

### Debugging

No-op in production (`NODE_ENV === 'production'`).

```ts
GlobalModalManager._debugConfigs();
// [GlobalModalManager] configs: { PortalGun: { stateKey: '...', listenerKey: '...' }, ... }
// [GlobalModalManager] state: { isPortalGunOpen: false, ... }
// [GlobalModalManager] openModals: []
// [GlobalModalManager] listenerCounts: { onPortalGunStateChange: 0, ... }
// [GlobalModalManager] globalListeners: 0
```

---

## Extending the library

The library is structured so new utilities drop in without touching existing code.

```
src/
└── utils/
    ├── ProviderTreeCreator.ts   ← existing
    ├── GlobalModalManager.ts   ← existing
    ├── useToggle.ts             ← add new file here
    └── index.ts                 ← export it from here
```

**Step 1** — create `src/utils/yourUtil.ts` and write your utility following the same patterns: `strict` TypeScript, no runtime deps, React Native compatible (no DOM APIs).

**Step 2** — add its exports to `src/utils/index.ts`:

```ts
export { useToggle } from './useToggle';
export type { UseToggleReturn } from './useToggle';
```

That's it. The root `src/index.ts` re-exports everything from `./utils`, so consumers get it automatically from `@hexhad/react-utils`.

### Conventions to follow

- One file per utility.
- Export all public types — consumers should never need to reconstruct types manually.
- Use `for...of` over `.forEach` in imperative loops.
- Use early returns over nested `if` blocks.
- Use `Set` or `Map` over plain objects for collections that are mutated at runtime.
- Gate any `console.log` calls with `process.env['NODE_ENV'] !== 'production'`.
- No runtime dependencies — React is a peer dep only.

---

## Project structure

```
@hexhad/react-utils/
├── src/
│   ├── index.ts               re-exports everything from ./utils
│   └── utils/
│       ├── index.ts           barrel for all utilities
│       ├── ProviderTreeCreator.ts
│       └── GlobalModalManager.ts
├── dist/                      compiled JS + .d.ts + source maps
├── tsconfig.json
└── package.json
```

## Build

```bash
npm run build        # compile to dist/
npm run type-check   # tsc --noEmit
npm run clean        # remove dist/
```
