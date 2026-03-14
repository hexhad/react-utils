import type { RefObject } from 'react';
import { createRef } from 'react';

export interface ModalRef {
  present?: () => void;
  dismiss?: () => void;
}

export type ModalProps = Record<string, unknown>;

export type ModalStateCallback<P extends ModalProps = ModalProps> = (
  isOpen: boolean,
  props: Readonly<P>
) => void;

export type ShowOptions<P extends ModalProps = ModalProps> = Partial<P> & {
  /** Close all other open modals before showing this one. Default: `true` */
  closeOthers?: boolean;
};

/**
 * Augment this interface in your app to enable fully typed props per modal.
 *
 * @example
 * declare module '@hexhad/react-native-utils' {
 *   interface ModalPropsRegistry {
 *     PortalGun:   { destination: string; onConfirm: () => void };
 *     MeeseeksBox: { task: string; onComplete: () => void };
 *     Plumbus:     { quantity: number };
 *   }
 * }
 */

export interface ModalPropsRegistry {}

type PropsFor<M extends string> = M extends keyof ModalPropsRegistry
  ? ModalPropsRegistry[M]
  : ModalProps;

interface ModalConfig {
  readonly stateKey: string;
  readonly listenerKey: string;
}

export interface RegisterOptions {
  stateKey?: string;
  listenerKey?: string;
}

export type ModalEventType = 'show' | 'hide' | 'toggle' | 'updateState';

export interface ModalEvent<ModalNames extends string = string> {
  readonly type: ModalEventType;
  readonly modalName: ModalNames;
  readonly isOpen: boolean;
  readonly props: Readonly<ModalProps>;
}

export type GlobalModalListener<ModalNames extends string = string> = (
  event: ModalEvent<ModalNames>
) => void;

type ConvenienceMethods<ModalNames extends string> = {
  [M in ModalNames as `open${M}`]: (options?: ShowOptions<PropsFor<M>>) => void;
} & {
  [M in ModalNames as `close${M}`]: () => void;
} & {
  [M in ModalNames as `toggle${M}`]: (
    options?: ShowOptions<PropsFor<M>>
  ) => void;
};

export interface IGlobalModalManager<ModalNames extends string = string> {
  show<M extends ModalNames>(
    modalName: M,
    options?: ShowOptions<PropsFor<M>>
  ): void;
  hide(modalName: ModalNames): void;
  toggle<M extends ModalNames>(
    modalName: M,
    options?: ShowOptions<PropsFor<M>>
  ): void;
  getRef(modalName: ModalNames): RefObject<ModalRef | null>;
  getProps<M extends ModalNames>(modalName: M): Readonly<PropsFor<M>>;
  setProps<M extends ModalNames>(modalName: M, props: PropsFor<M>): void;
  updateProps<M extends ModalNames>(
    modalName: M,
    props: Partial<PropsFor<M>>
  ): void;
  setProp<M extends ModalNames, K extends keyof PropsFor<M>>(
    modalName: M,
    key: K,
    value: PropsFor<M>[K]
  ): void;
  getProp<M extends ModalNames, K extends keyof PropsFor<M>>(
    modalName: M,
    key: K,
    defaultValue?: PropsFor<M>[K]
  ): PropsFor<M>[K] | undefined;
  closeAll(): void;
  isOpen(modalName: ModalNames): boolean;
  isAnyOpen(): boolean;
  getOpenModals(): ModalNames[];
  getOpenModal(): ModalNames | null;
  addListener<M extends ModalNames>(
    modalName: M,
    callback: ModalStateCallback<PropsFor<M>>
  ): () => void;
  addGlobalListener(callback: GlobalModalListener<ModalNames>): () => void;
  removeAllListeners(modalName?: ModalNames): void;
  updateState(modalName: ModalNames, isOpen: boolean): void;
  getState(): Readonly<Record<string, boolean>>;
  getAllProps(): Readonly<Record<string, ModalProps>>;
  getModalNames(): ModalNames[];
  clearProps(modalName: ModalNames): void;
  clearAllProps(): void;
  registerModal(modalName: string, config?: RegisterOptions): void;
  unregisterModal(modalName: ModalNames): void;
  /** Closes all modals, clears all listeners and state. */
  destroy(): void;
  /** No-op in production. */
  _debugConfigs(): void;
}

/**
 * Creates a typed GlobalModalManager for a given set of modal names.
 *
 * @example
 * // modals.ts
 * export const MODAL_NAMES = {
 *   PORTAL_GUN:   'PortalGun',
 *   MEESEEKS_BOX: 'MeeseeksBox',
 *   PLUMBUS:      'Plumbus',
 * } as const;
 *
 * export type ModalName = typeof MODAL_NAMES[keyof typeof MODAL_NAMES];
 *
 * declare module '@hexhad/react-native-utils' {
 *   interface ModalPropsRegistry {
 *     PortalGun:   { destination: string; onConfirm: () => void };
 *     MeeseeksBox: { task: string; onComplete: () => void };
 *     Plumbus:     { quantity: number };
 *   }
 * }
 *
 * export const GlobalModalManager = createModalManager<ModalName>(MODAL_NAMES);
 *
 * GlobalModalManager.openPortalGun({ destination: 'Dimension C-137', onConfirm: () => {} });
 * GlobalModalManager.closeMeeseeksBox();
 * GlobalModalManager.togglePlumbus();
 */
export function createModalManager<ModalNames extends string>(
  MODAL_NAMES: Record<string, ModalNames>
): IGlobalModalManager<ModalNames> & ConvenienceMethods<ModalNames> {
  // All internal maps use Map instead of plain objects so noUncheckedIndexedAccess
  // does not widen every lookup to T | undefined — Map.get() already returns T | undefined
  // explicitly, and we guard all access through helper functions.
  const MODAL_CONFIGS = new Map<string, ModalConfig>();
  const modalRefs = new Map<string, RefObject<ModalRef | null>>();
  const modalState = new Map<string, boolean>();
  const modalProps = new Map<string, ModalProps>();
  const listeners = new Map<string, Set<ModalStateCallback>>();
  const globalListeners = new Set<GlobalModalListener<ModalNames>>();

  let destroyed = false;

  for (const key of Object.keys(MODAL_NAMES)) {
    const modalValue = MODAL_NAMES[key] as ModalNames;
    const stateKey = `is${modalValue}Open`;
    const listenerKey = `on${modalValue}StateChange`;
    MODAL_CONFIGS.set(modalValue, { stateKey, listenerKey });
    modalState.set(stateKey, false);
    listeners.set(listenerKey, new Set());
  }

  const assertAlive = (): boolean => {
    if (destroyed) {
      console.warn('[GlobalModalManager] Manager has been destroyed.');
      return false;
    }
    return true;
  };

  const getModalRef = (modalName: string): RefObject<ModalRef | null> => {
    const existing = modalRefs.get(modalName);
    if (existing) return existing;
    const ref = createRef<ModalRef | null>();
    modalRefs.set(modalName, ref);
    return ref;
  };

  const getConfig = (modalName: string): ModalConfig | null => {
    const config = MODAL_CONFIGS.get(modalName);
    if (!config) {
      console.warn(`[GlobalModalManager] Modal "${modalName}" not found`);
      return null;
    }
    return config;
  };

  const getListenerSet = (
    listenerKey: string
  ): Set<ModalStateCallback> | null => {
    return listeners.get(listenerKey) ?? null;
  };

  /**
   * Iterates a snapshot of each listener set so mutations during a callback
   * cannot affect the current notification pass.
   */
  const notifyListeners = (
    listenerKey: string,
    modalName: ModalNames,
    eventType: ModalEventType,
    isOpen: boolean,
    props: ModalProps = {}
  ): void => {
    const frozenProps = Object.freeze({ ...props });

    const set = getListenerSet(listenerKey);
    if (set && set.size > 0) {
      for (const cb of Array.from(set)) {
        cb(isOpen, frozenProps);
      }
    }

    if (globalListeners.size > 0) {
      const event: ModalEvent<ModalNames> = Object.freeze({
        type: eventType,
        modalName,
        isOpen,
        props: frozenProps,
      });
      for (const cb of Array.from(globalListeners)) {
        cb(event);
      }
    }
  };

  const manager = {
    show<M extends ModalNames>(
      modalName: M,
      options: ShowOptions<PropsFor<M>> = {} as ShowOptions<PropsFor<M>>
    ): void {
      if (!assertAlive()) return;
      const config = getConfig(modalName);
      if (!config) return;

      const { closeOthers = true, ...props } = options;
      if (closeOthers) manager.closeAll();

      if (modalState.get(config.stateKey) === true) {
        // Already open — update props without calling present() again
        modalProps.set(modalName, props as ModalProps);
        notifyListeners(
          config.listenerKey,
          modalName,
          'show',
          true,
          props as ModalProps
        );
        return;
      }

      modalProps.set(modalName, props as ModalProps);
      getModalRef(modalName).current?.present?.();
      modalState.set(config.stateKey, true);
      notifyListeners(
        config.listenerKey,
        modalName,
        'show',
        true,
        props as ModalProps
      );
    },

    hide(modalName: ModalNames): void {
      if (!assertAlive()) return;
      const config = getConfig(modalName);
      if (!config || modalState.get(config.stateKey) !== true) return;

      getModalRef(modalName).current?.dismiss?.();
      modalState.set(config.stateKey, false);
      modalProps.delete(modalName);
      notifyListeners(config.listenerKey, modalName, 'hide', false);
    },

    toggle<M extends ModalNames>(
      modalName: M,
      options: ShowOptions<PropsFor<M>> = {} as ShowOptions<PropsFor<M>>
    ): void {
      if (!assertAlive()) return;
      const config = getConfig(modalName);
      if (!config) return;
      modalState.get(config.stateKey) === true
        ? manager.hide(modalName)
        : manager.show(modalName, options);
    },

    getRef(modalName: ModalNames): RefObject<ModalRef | null> {
      return getModalRef(modalName);
    },

    getProps<M extends ModalNames>(modalName: M): Readonly<PropsFor<M>> {
      return (modalProps.get(modalName) ?? {}) as Readonly<PropsFor<M>>;
    },

    setProps<M extends ModalNames>(modalName: M, props: PropsFor<M>): void {
      if (!assertAlive()) return;
      const config = getConfig(modalName);
      if (!config) return;
      modalProps.set(modalName, (props ?? {}) as ModalProps);
      if (modalState.get(config.stateKey) === true) {
        notifyListeners(
          config.listenerKey,
          modalName,
          'show',
          true,
          modalProps.get(modalName) ?? {}
        );
      }
    },

    updateProps<M extends ModalNames>(
      modalName: M,
      props: Partial<PropsFor<M>>
    ): void {
      if (!assertAlive()) return;
      const config = getConfig(modalName);
      if (!config) return;
      modalProps.set(modalName, {
        ...(modalProps.get(modalName) ?? {}),
        ...(props as ModalProps),
      });
      if (modalState.get(config.stateKey) === true) {
        notifyListeners(
          config.listenerKey,
          modalName,
          'show',
          true,
          modalProps.get(modalName) ?? {}
        );
      }
    },

    setProp<M extends ModalNames, K extends keyof PropsFor<M>>(
      modalName: M,
      key: K,
      value: PropsFor<M>[K]
    ): void {
      if (!assertAlive()) return;
      const config = getConfig(modalName);
      if (!config) return;
      const current = modalProps.get(modalName) ?? {};
      const updated = { ...current, [key as string]: value };
      modalProps.set(modalName, updated);
      if (modalState.get(config.stateKey) === true) {
        notifyListeners(config.listenerKey, modalName, 'show', true, updated);
      }
    },

    getProp<M extends ModalNames, K extends keyof PropsFor<M>>(
      modalName: M,
      key: K,
      defaultValue?: PropsFor<M>[K]
    ): PropsFor<M>[K] | undefined {
      const props = modalProps.get(modalName);
      return (props?.[key as string] as PropsFor<M>[K]) ?? defaultValue;
    },

    closeAll(): void {
      if (!assertAlive()) return;
      for (const [modalName, config] of MODAL_CONFIGS) {
        if (modalState.get(config.stateKey) === true) {
          getModalRef(modalName).current?.dismiss?.();
          modalState.set(config.stateKey, false);
          modalProps.delete(modalName);
          notifyListeners(
            config.listenerKey,
            modalName as ModalNames,
            'hide',
            false
          );
        }
      }
    },

    isOpen(modalName: ModalNames): boolean {
      const config = MODAL_CONFIGS.get(modalName);
      return config ? modalState.get(config.stateKey) === true : false;
    },

    isAnyOpen(): boolean {
      for (const value of modalState.values()) {
        if (value) return true;
      }
      return false;
    },

    getOpenModals(): ModalNames[] {
      const open: ModalNames[] = [];
      for (const [name, config] of MODAL_CONFIGS) {
        if (modalState.get(config.stateKey) === true) {
          open.push(name as ModalNames);
        }
      }
      return open;
    },

    getOpenModal(): ModalNames | null {
      for (const [name, config] of MODAL_CONFIGS) {
        if (modalState.get(config.stateKey) === true) return name as ModalNames;
      }
      return null;
    },

    addListener<M extends ModalNames>(
      modalName: M,
      callback: ModalStateCallback<PropsFor<M>>
    ): () => void {
      const config = getConfig(modalName);
      if (!config) return () => {};
      const set = getListenerSet(config.listenerKey);
      if (!set) return () => {};
      set.add(callback as ModalStateCallback<ModalProps>);
      return () => set.delete(callback as ModalStateCallback<ModalProps>);
    },

    addGlobalListener(callback: GlobalModalListener<ModalNames>): () => void {
      globalListeners.add(callback);
      return () => globalListeners.delete(callback);
    },

    removeAllListeners(modalName?: ModalNames): void {
      if (modalName) {
        const config = MODAL_CONFIGS.get(modalName);
        if (config) getListenerSet(config.listenerKey)?.clear();
      } else {
        for (const set of listeners.values()) set.clear();
        globalListeners.clear();
      }
    },

    updateState(modalName: ModalNames, isOpen: boolean): void {
      if (!assertAlive()) return;
      const config = getConfig(modalName);
      if (!config) return;
      const previous = modalState.get(config.stateKey);
      if (previous === isOpen) return;
      modalState.set(config.stateKey, isOpen);
      if (!isOpen) modalProps.delete(modalName);
      notifyListeners(
        config.listenerKey,
        modalName,
        'updateState',
        isOpen,
        modalProps.get(modalName) ?? {}
      );
    },

    getState(): Readonly<Record<string, boolean>> {
      return Object.freeze(Object.fromEntries(modalState));
    },

    getAllProps(): Readonly<Record<string, ModalProps>> {
      return Object.freeze(Object.fromEntries(modalProps));
    },

    getModalNames(): ModalNames[] {
      return Array.from(MODAL_CONFIGS.keys()) as ModalNames[];
    },

    clearProps(modalName: ModalNames): void {
      if (!assertAlive()) return;
      const config = getConfig(modalName);
      if (!config) return;
      modalProps.delete(modalName);
      if (modalState.get(config.stateKey) === true) {
        notifyListeners(config.listenerKey, modalName, 'show', true, {});
      }
    },

    clearAllProps(): void {
      if (!assertAlive()) return;
      for (const modalName of modalProps.keys()) {
        const config = MODAL_CONFIGS.get(modalName);
        modalProps.delete(modalName);
        if (config && modalState.get(config.stateKey) === true) {
          notifyListeners(
            config.listenerKey,
            modalName as ModalNames,
            'show',
            true,
            {}
          );
        }
      }
    },

    registerModal(modalName: string, options: RegisterOptions = {}): void {
      if (!assertAlive()) return;
      if (MODAL_CONFIGS.has(modalName)) {
        console.warn(
          `[GlobalModalManager] Modal "${modalName}" is already registered`
        );
        return;
      }

      const stateKey = options.stateKey ?? `is${modalName}Open`;
      const listenerKey = options.listenerKey ?? `on${modalName}StateChange`;

      MODAL_CONFIGS.set(modalName, { stateKey, listenerKey });
      modalState.set(stateKey, false);
      listeners.set(listenerKey, new Set());

      const m = manager as Record<string, unknown>;

      m[`open${modalName}`] = (opts?: ShowOptions<ModalProps>) =>
        manager.show(modalName as ModalNames, opts as any);
      m[`close${modalName}`] = () => manager.hide(modalName as ModalNames);

      m[`toggle${modalName}`] = (opts?: ShowOptions<ModalProps>) =>
        manager.toggle(modalName as ModalNames, opts as any);
    },

    unregisterModal(modalName: ModalNames): void {
      if (!assertAlive()) return;
      const config = getConfig(modalName);
      if (!config) return;

      if (modalState.get(config.stateKey) === true) manager.hide(modalName);

      MODAL_CONFIGS.delete(modalName);
      modalState.delete(config.stateKey);
      listeners.delete(config.listenerKey);
      modalRefs.delete(modalName);
      modalProps.delete(modalName);

      const m = manager as Record<string, unknown>;
      delete m[`open${modalName}`];
      delete m[`close${modalName}`];
      delete m[`toggle${modalName}`];
    },

    destroy(): void {
      manager.closeAll();
      manager.removeAllListeners();
      MODAL_CONFIGS.clear();
      modalRefs.clear();
      modalState.clear();
      modalProps.clear();
      destroyed = true;
    },

    _debugConfigs(): void {
      if (process.env.NODE_ENV === 'production') return;
      console.log(
        '[GlobalModalManager] configs:',
        Object.fromEntries(MODAL_CONFIGS)
      );
      console.log(
        '[GlobalModalManager] state:',
        Object.fromEntries(modalState)
      );
      console.log('[GlobalModalManager] openModals:', manager.getOpenModals());
      console.log(
        '[GlobalModalManager] listenerCounts:',
        Object.fromEntries(
          Array.from(listeners.entries()).map(([k, v]) => [k, v.size])
        )
      );
      console.log(
        '[GlobalModalManager] globalListeners:',
        globalListeners.size
      );
    },
  };

  for (const modalValue of Object.values(MODAL_NAMES)) {
    const m = manager as Record<string, unknown>;

    m[`open${modalValue}`] = (options?: ShowOptions<ModalProps>) =>
      manager.show(modalValue as ModalNames, options as any);
    m[`close${modalValue}`] = () => manager.hide(modalValue as ModalNames);

    m[`toggle${modalValue}`] = (options?: ShowOptions<ModalProps>) =>
      manager.toggle(modalValue as ModalNames, options as any);
  }

  return manager as IGlobalModalManager<ModalNames> &
    ConvenienceMethods<ModalNames>;
}
