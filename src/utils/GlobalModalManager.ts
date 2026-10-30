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
 * declare module '@hexhad/react-utils' {
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

/** Everything the manager tracks for a single modal, kept in one record. */
interface ModalEntry {
  readonly stateKey: string;
  readonly listenerKey: string;
  readonly ref: RefObject<ModalRef | null>;
  readonly listeners: Set<ModalStateCallback>;
  isOpen: boolean;
  /** Stored as given (what `getProps` returns); `undefined` = no props. */
  props: ModalProps | undefined;
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
 * declare module '@hexhad/react-utils' {
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
  // Registration order is preserved by Map iteration, so order-sensitive
  // methods (closeAll, getOpenModals, getState) behave as before.
  const entries = new Map<string, ModalEntry>();
  // Names of currently open modals. Lets closeAll / isAnyOpen / getOpenModal
  // return immediately in the common "nothing open" case — closeAll runs on
  // every default `show()` call.
  const openModals = new Set<string>();
  // Refs requested for names that are not registered (yet). Adopted on register.
  const orphanRefs = new Map<string, RefObject<ModalRef | null>>();
  const globalListeners = new Set<GlobalModalListener<ModalNames>>();
  // Names that currently have props, in the order props were first set.
  // getAllProps / clearAllProps follow this order.
  const namesWithProps = new Set<string>();

  let destroyed = false;

  const assertAlive = (): boolean => {
    if (destroyed) {
      console.warn('[GlobalModalManager] Manager has been destroyed.');
      return false;
    }
    return true;
  };

  const getEntry = (modalName: string): ModalEntry | null => {
    const entry = entries.get(modalName);
    if (!entry) {
      console.warn(`[GlobalModalManager] Modal "${modalName}" not found`);
      return null;
    }
    return entry;
  };

  const setEntryProps = (
    modalName: string,
    entry: ModalEntry,
    props: ModalProps
  ): void => {
    entry.props = props;
    namesWithProps.add(modalName);
  };

  const clearEntryProps = (modalName: string, entry: ModalEntry): void => {
    entry.props = undefined;
    namesWithProps.delete(modalName);
  };

  const setOpen = (modalName: string, entry: ModalEntry, isOpen: boolean) => {
    entry.isOpen = isOpen;
    if (isOpen) openModals.add(modalName);
    else openModals.delete(modalName);
  };

  /**
   * Iterates a snapshot of each listener set so mutations during a callback
   * cannot affect the current notification pass. Listeners receive a frozen
   * copy of the props; nothing is allocated when there are no listeners.
   */
  const notifyListeners = (
    entry: ModalEntry,
    modalName: ModalNames,
    eventType: ModalEventType,
    isOpen: boolean,
    props: ModalProps = {}
  ): void => {
    const hasLocal = entry.listeners.size > 0;
    const hasGlobal = globalListeners.size > 0;
    if (!hasLocal && !hasGlobal) return;

    const frozenProps = Object.freeze({ ...props });

    if (hasLocal) {
      for (const cb of Array.from(entry.listeners)) cb(isOpen, frozenProps);
    }

    if (hasGlobal) {
      const event: ModalEvent<ModalNames> = Object.freeze({
        type: eventType,
        modalName,
        isOpen,
        props: frozenProps,
      });
      for (const cb of Array.from(globalListeners)) cb(event);
    }
  };

  const closeEntry = (modalName: string, entry: ModalEntry): void => {
    entry.ref.current?.dismiss?.();
    setOpen(modalName, entry, false);
    clearEntryProps(modalName, entry);
    notifyListeners(entry, modalName as ModalNames, 'hide', false);
  };

  const notifyPropsChange = (modalName: ModalNames, entry: ModalEntry) => {
    if (entry.isOpen) {
      notifyListeners(entry, modalName, 'show', true, entry.props);
    }
  };

  const addEntry = (
    modalName: string,
    stateKey: string,
    listenerKey: string
  ): void => {
    const ref = orphanRefs.get(modalName) ?? createRef<ModalRef | null>();
    orphanRefs.delete(modalName);
    entries.set(modalName, {
      stateKey,
      listenerKey,
      ref,
      listeners: new Set(),
      isOpen: false,
      props: undefined,
    });
  };

  const manager = {
    show<M extends ModalNames>(
      modalName: M,
      options: ShowOptions<PropsFor<M>> = {} as ShowOptions<PropsFor<M>>
    ): void {
      if (!assertAlive()) return;
      const entry = getEntry(modalName);
      if (!entry) return;

      const { closeOthers = true, ...props } = options;
      // Note: this also closes `modalName` itself if open, so its sheet is
      // dismissed and presented again. This keeps `show()` able to recover
      // when the UI was dismissed without telling the manager.
      if (closeOthers) manager.closeAll();

      setEntryProps(modalName, entry, props as ModalProps);

      if (entry.isOpen) {
        // Already open — update props without calling present() again
        notifyListeners(entry, modalName, 'show', true, entry.props);
        return;
      }

      entry.ref.current?.present?.();
      setOpen(modalName, entry, true);
      notifyListeners(entry, modalName, 'show', true, entry.props);
    },

    hide(modalName: ModalNames): void {
      if (!assertAlive()) return;
      const entry = getEntry(modalName);
      if (!entry?.isOpen) return;
      closeEntry(modalName, entry);
    },

    toggle<M extends ModalNames>(
      modalName: M,
      options: ShowOptions<PropsFor<M>> = {} as ShowOptions<PropsFor<M>>
    ): void {
      if (!assertAlive()) return;
      const entry = getEntry(modalName);
      if (!entry) return;
      entry.isOpen ? manager.hide(modalName) : manager.show(modalName, options);
    },

    getRef(modalName: ModalNames): RefObject<ModalRef | null> {
      const entry = entries.get(modalName);
      if (entry) return entry.ref;
      const existing = orphanRefs.get(modalName);
      if (existing) return existing;
      const ref = createRef<ModalRef | null>();
      orphanRefs.set(modalName, ref);
      return ref;
    },

    getProps<M extends ModalNames>(modalName: M): Readonly<PropsFor<M>> {
      return (entries.get(modalName)?.props ?? {}) as Readonly<PropsFor<M>>;
    },

    setProps<M extends ModalNames>(modalName: M, props: PropsFor<M>): void {
      if (!assertAlive()) return;
      const entry = getEntry(modalName);
      if (!entry) return;
      setEntryProps(modalName, entry, (props ?? {}) as ModalProps);
      notifyPropsChange(modalName, entry);
    },

    updateProps<M extends ModalNames>(
      modalName: M,
      props: Partial<PropsFor<M>>
    ): void {
      if (!assertAlive()) return;
      const entry = getEntry(modalName);
      if (!entry) return;
      setEntryProps(modalName, entry, {
        ...entry.props,
        ...(props as ModalProps),
      });
      notifyPropsChange(modalName, entry);
    },

    setProp<M extends ModalNames, K extends keyof PropsFor<M>>(
      modalName: M,
      key: K,
      value: PropsFor<M>[K]
    ): void {
      if (!assertAlive()) return;
      const entry = getEntry(modalName);
      if (!entry) return;
      setEntryProps(modalName, entry, {
        ...entry.props,
        [key as string]: value,
      });
      notifyPropsChange(modalName, entry);
    },

    getProp<M extends ModalNames, K extends keyof PropsFor<M>>(
      modalName: M,
      key: K,
      defaultValue?: PropsFor<M>[K]
    ): PropsFor<M>[K] | undefined {
      const props = entries.get(modalName)?.props;
      return (props?.[key as string] as PropsFor<M>[K]) ?? defaultValue;
    },

    closeAll(): void {
      if (!assertAlive()) return;
      if (openModals.size === 0) return;
      for (const [modalName, entry] of entries) {
        if (entry.isOpen) closeEntry(modalName, entry);
      }
    },

    isOpen(modalName: ModalNames): boolean {
      return entries.get(modalName)?.isOpen === true;
    },

    isAnyOpen(): boolean {
      return openModals.size > 0;
    },

    getOpenModals(): ModalNames[] {
      if (openModals.size === 0) return [];
      const open: ModalNames[] = [];
      for (const [name, entry] of entries) {
        if (entry.isOpen) open.push(name as ModalNames);
      }
      return open;
    },

    getOpenModal(): ModalNames | null {
      if (openModals.size === 0) return null;
      for (const [name, entry] of entries) {
        if (entry.isOpen) return name as ModalNames;
      }
      return null;
    },

    addListener<M extends ModalNames>(
      modalName: M,
      callback: ModalStateCallback<PropsFor<M>>
    ): () => void {
      const entry = getEntry(modalName);
      if (!entry) return () => {};
      const set = entry.listeners;
      set.add(callback as ModalStateCallback<ModalProps>);
      return () => set.delete(callback as ModalStateCallback<ModalProps>);
    },

    addGlobalListener(callback: GlobalModalListener<ModalNames>): () => void {
      globalListeners.add(callback);
      return () => globalListeners.delete(callback);
    },

    removeAllListeners(modalName?: ModalNames): void {
      if (modalName) {
        entries.get(modalName)?.listeners.clear();
      } else {
        for (const entry of entries.values()) entry.listeners.clear();
        globalListeners.clear();
      }
    },

    updateState(modalName: ModalNames, isOpen: boolean): void {
      if (!assertAlive()) return;
      const entry = getEntry(modalName);
      if (!entry) return;
      if (entry.isOpen === isOpen) return;
      setOpen(modalName, entry, isOpen);
      if (!isOpen) clearEntryProps(modalName, entry);
      notifyListeners(entry, modalName, 'updateState', isOpen, entry.props);
    },

    getState(): Readonly<Record<string, boolean>> {
      const state: Record<string, boolean> = {};
      for (const entry of entries.values())
        state[entry.stateKey] = entry.isOpen;
      return Object.freeze(state);
    },

    getAllProps(): Readonly<Record<string, ModalProps>> {
      const all: Record<string, ModalProps> = {};
      for (const name of namesWithProps) {
        const props = entries.get(name)?.props;
        if (props) all[name] = props;
      }
      return Object.freeze(all);
    },

    getModalNames(): ModalNames[] {
      return Array.from(entries.keys()) as ModalNames[];
    },

    clearProps(modalName: ModalNames): void {
      if (!assertAlive()) return;
      const entry = getEntry(modalName);
      if (!entry) return;
      clearEntryProps(modalName, entry);
      notifyPropsChange(modalName, entry);
    },

    clearAllProps(): void {
      if (!assertAlive()) return;
      for (const modalName of namesWithProps) {
        const entry = entries.get(modalName);
        namesWithProps.delete(modalName);
        if (!entry) continue;
        entry.props = undefined;
        notifyPropsChange(modalName as ModalNames, entry);
      }
    },

    registerModal(modalName: string, options: RegisterOptions = {}): void {
      if (!assertAlive()) return;
      if (entries.has(modalName)) {
        console.warn(
          `[GlobalModalManager] Modal "${modalName}" is already registered`
        );
        return;
      }

      addEntry(
        modalName,
        options.stateKey ?? `is${modalName}Open`,
        options.listenerKey ?? `on${modalName}StateChange`
      );
      attachConvenienceMethods(modalName);
    },

    unregisterModal(modalName: ModalNames): void {
      if (!assertAlive()) return;
      const entry = getEntry(modalName);
      if (!entry) return;

      if (entry.isOpen) manager.hide(modalName);

      entries.delete(modalName);
      openModals.delete(modalName);
      namesWithProps.delete(modalName);

      const m = manager as Record<string, unknown>;
      delete m[`open${modalName}`];
      delete m[`close${modalName}`];
      delete m[`toggle${modalName}`];
    },

    destroy(): void {
      manager.closeAll();
      manager.removeAllListeners();
      entries.clear();
      openModals.clear();
      namesWithProps.clear();
      orphanRefs.clear();
      destroyed = true;
    },

    _debugConfigs(): void {
      if (process.env.NODE_ENV === 'production') return;
      const configs: Record<string, { stateKey: string; listenerKey: string }> =
        {};
      const listenerCounts: Record<string, number> = {};
      for (const [name, entry] of entries) {
        configs[name] = {
          stateKey: entry.stateKey,
          listenerKey: entry.listenerKey,
        };
        listenerCounts[entry.listenerKey] = entry.listeners.size;
      }
      console.log('[GlobalModalManager] configs:', configs);
      console.log('[GlobalModalManager] state:', manager.getState());
      console.log('[GlobalModalManager] openModals:', manager.getOpenModals());
      console.log('[GlobalModalManager] listenerCounts:', listenerCounts);
      console.log(
        '[GlobalModalManager] globalListeners:',
        globalListeners.size
      );
    },
  };

  function attachConvenienceMethods(modalName: string): void {
    const m = manager as Record<string, unknown>;
    const name = modalName as ModalNames;
    m[`open${modalName}`] = (opts?: ShowOptions<ModalProps>) =>
      manager.show(name, opts as any);
    m[`close${modalName}`] = () => manager.hide(name);
    m[`toggle${modalName}`] = (opts?: ShowOptions<ModalProps>) =>
      manager.toggle(name, opts as any);
  }

  for (const modalName of Object.values(MODAL_NAMES)) {
    if (entries.has(modalName)) continue;
    addEntry(modalName, `is${modalName}Open`, `on${modalName}StateChange`);
    attachConvenienceMethods(modalName);
  }

  return manager as IGlobalModalManager<ModalNames> &
    ConvenienceMethods<ModalNames>;
}
