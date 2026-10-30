---
name: react-utils
description: >-
  Consumer guide for @hexhad/react-utils in React and React Native apps. Use
  this skill when composing context providers with ProviderTreeCreator or
  ProviderTree, or when creating, wiring, opening, closing or listening to
  modals and bottom sheets through createModalManager / GlobalModalManager —
  including typed modal props, modal components exposing present/dismiss,
  syncing a swipe or back-button dismissal, reading modal props, and debugging
  a modal that will not open or close. Also use it for "provider hell", a
  global modal registry, or code that imports from '@hexhad/react-utils',
  even when the package is not named.
---

# @hexhad/react-utils

Two zero-dependency utilities:

- **`ProviderTreeCreator` / `ProviderTree`** — compose many context providers without nested JSX.
- **`createModalManager`** — one typed registry that opens, closes and passes props to every modal in the app, with no React context and no re-renders of its own.

```sh
yarn add @hexhad/react-utils   # peer deps: react, react-native (any version)
```

## Providers

### Pick the right form

| Where the providers array is built                            | Use                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------ |
| Module scope (static array)                                   | `ProviderTreeCreator(providers)` once, at module scope |
| Inside a component (`useMemo`, depends on state or callbacks) | `<ProviderTree providers={providers}>`                 |

`ProviderTreeCreator` returns a **new component type** for every new array. If the array is rebuilt during render, everything below it remounts and loses its state. `ProviderTree` updates the providers in place instead.

```tsx
import { ProviderTree, ProviderTreeCreator } from '@hexhad/react-utils';
import type { ProviderEntry } from '@hexhad/react-utils';

// Static: create once at module scope (cached by array reference).
const AppProviders = ProviderTreeCreator([
  [ThemeProvider, { theme: 'dark' }],
  [AuthProvider],
  [QueryClientProvider, { client: queryClient }],
]);

export const App = () => (
  <AppProviders>
    <Root />
  </AppProviders>
);

// Dynamic: providers depend on values from inside the component.
export const AppWithStore = () => {
  const onBeforeLift = useCallback(() => restoreLanguage(i18n), [i18n]);
  const providers = useMemo<ProviderEntry[]>(
    () => [
      [Provider, { store }],
      [RememberGate, { onBeforeLift }],
    ],
    [onBeforeLift]
  );

  return (
    <ProviderTree providers={providers}>
      <Root />
    </ProviderTree>
  );
};
```

Rules:

- Entries are `[Component]` or `[Component, props]`. Order is outermost first: the first entry wraps everything.
- Never call `ProviderTreeCreator` in a render body without memoizing it, and prefer `ProviderTree` over `useMemo(() => ProviderTreeCreator(...))`.
- Keep provider props stable (`useMemo`/`useCallback`) so providers don't re-render needlessly.

## Modal manager

### 1. Create the manager once

```ts
// managers/GlobalModalManager.ts
import { createModalManager } from '@hexhad/react-utils';

export const MODAL_NAMES = {
  PORTAL_GUN: 'PortalGun',
  MEESEEKS_BOX: 'MeeseeksBox',
} as const;

export type ModalName = (typeof MODAL_NAMES)[keyof typeof MODAL_NAMES];

// Optional: typed props per modal. The module name must be exactly
// '@hexhad/react-utils', otherwise the augmentation silently does nothing.
declare module '@hexhad/react-utils' {
  interface ModalPropsRegistry {
    PortalGun: { destination: string; onConfirm: () => void };
    MeeseeksBox: { task: string };
  }
}

export const GlobalModalManager = createModalManager<ModalName>(MODAL_NAMES);
```

Each modal value gets convenience methods: `openPortalGun(props)`, `closePortalGun()`, `togglePortalGun(props)`.

### 2. Make each modal expose `present` / `dismiss`

The manager drives a modal through its ref (`ModalRef`: `present?()`, `dismiss?()`), and pushes props to it through a listener.

```tsx
import type { ModalRef } from '@hexhad/react-utils';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';

const PortalGunModal = forwardRef<ModalRef>((_, ref) => {
  const [visible, setVisible] = useState(false);
  // Lazy initializer: read props once at mount, not on every render.
  const [props, setProps] = useState(() =>
    GlobalModalManager.getProps(MODAL_NAMES.PORTAL_GUN)
  );

  // addListener returns its unsubscribe function — return it from the effect.
  useEffect(
    () =>
      GlobalModalManager.addListener(MODAL_NAMES.PORTAL_GUN, (isOpen, next) => {
        setVisible(isOpen);
        setProps(next);
      }),
    []
  );

  // Closed by the user (swipe, backdrop, back button): tell the manager.
  const handleUserDismiss = useCallback(() => {
    setVisible(false);
    GlobalModalManager.updateState(MODAL_NAMES.PORTAL_GUN, false);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      present: () => setVisible(true),
      dismiss: () => setVisible(false),
    }),
    []
  );

  return (
    <Sheet visible={visible} onDismiss={handleUserDismiss}>
      <Text>{props.destination}</Text>
    </Sheet>
  );
});
```

### 3. Mount it with the manager's ref

```tsx
<PortalGunModal ref={GlobalModalManager.getRef(MODAL_NAMES.PORTAL_GUN)} />
```

`getRef` always returns the same ref object for a name, so it's safe to call during render or at module scope.

### 4. Open and close from anywhere

```ts
GlobalModalManager.show(MODAL_NAMES.PORTAL_GUN, {
  destination: 'Dimension C-137',
  onConfirm: () => {},
});
GlobalModalManager.hide(MODAL_NAMES.PORTAL_GUN);
GlobalModalManager.closeAll();
```

Works outside React too (thunks, API interceptors, navigation listeners).

## Behaviour to rely on

- **`show()` closes every open modal first** (`closeOthers: true` by default), **including the target itself**. An already-open modal is dismissed and presented again. This is deliberate: it lets `show()` recover when a modal was closed without the manager knowing.
- **Stack modals** with `closeOthers: false`. If the target is already open, `show` then only updates its props and notifies listeners, without calling `present()` again.
- **Props are set before `present()` runs**, so a modal can read `getProps(name)` inside its own `present`.
- **`hide()` clears the modal's props.** Read what you need before hiding.
- **`getProps()` returns the stored object** (or a new `{}` when there are none). Treat it as read-only. Listeners receive a frozen copy.
- **If a listener throws**, later listeners are skipped and the error propagates to the caller of `show`/`hide`.
- **`updateState(name, isOpen)`** syncs state without calling `dismiss()`/`present()`. Use it when the UI closed itself.
- **Calling `ref.current.present()` directly bypasses the manager**: `isOpen`, listeners and props won't know. Prefer `show()`.
- **After `destroy()`** every state-changing method does nothing and warns `Manager has been destroyed`.
- **An unknown modal name** passed to `show`/`hide`/`toggle`/prop setters/`addListener` logs `[GlobalModalManager] Modal "X" not found` and does nothing; getters such as `isOpen` and `getProps` just return `false` / `{}`.

## API

| Method                                                                       | Purpose                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `show(name, options?)` / `hide(name)` / `toggle(name, options?)`             | Open / close / flip; `options` = props + `closeOthers`           |
| `open<Name>()` / `close<Name>()` / `toggle<Name>()`                          | Generated shortcuts per modal                                    |
| `closeAll()`                                                                 | Dismiss every open modal                                         |
| `getRef(name)`                                                               | Stable `RefObject<ModalRef>` to attach to the modal              |
| `getProps(name)` / `getProp(name, key, default?)`                            | Read props                                                       |
| `setProps` / `updateProps` / `setProp` / `clearProps` / `clearAllProps`      | Write props; listeners are notified only while the modal is open |
| `isOpen(name)` / `isAnyOpen()` / `getOpenModal()` / `getOpenModals()`        | Query state                                                      |
| `addListener(name, (isOpen, props) => …)`                                    | Per-modal listener; returns unsubscribe                          |
| `addGlobalListener(event => …)`                                              | All modals; `event = { type, modalName, isOpen, props }`         |
| `updateState(name, isOpen)`                                                  | Sync a dismissal that happened in the UI                         |
| `registerModal(name, { stateKey?, listenerKey? })` / `unregisterModal(name)` | Add or remove modals at runtime                                  |
| `getState()` / `getAllProps()` / `getModalNames()`                           | Snapshots (`getState` keys are `is<Name>Open`)                   |
| `removeAllListeners(name?)` / `destroy()` / `_debugConfigs()`                | Cleanup and debugging                                            |

## Troubleshooting

| Symptom                                    | Cause / fix                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `show()` does nothing visible              | The modal isn't mounted, or its ref isn't from `getRef(name)`, or its `present` isn't exposed via `useImperativeHandle`. |
| Modal opens, but props are empty           | The component read props once at mount. Update them from `addListener`, or read `getProps` inside `present`.             |
| `isOpen()` stays `true` after a swipe-down | The sheet's dismiss callback must call `updateState(name, false)` (or `hide(name)`).                                     |
| Opening modal B closes modal A             | That's the default. Pass `closeOthers: false` to stack.                                                                  |
| Typed props aren't checked                 | The `declare module` name must be `'@hexhad/react-utils'`, and the file must be part of the TS program.                  |
| Whole app remounts unexpectedly            | `ProviderTreeCreator` is called with a new array during render. Switch to `<ProviderTree>`.                              |
