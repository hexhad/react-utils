import { createModalManager } from '../utils/GlobalModalManager';

const MODAL_NAMES = { A: 'A', B: 'B', C: 'C' } as const;
type Name = (typeof MODAL_NAMES)[keyof typeof MODAL_NAMES];

const setup = () => {
  const manager = createModalManager<Name>(MODAL_NAMES);
  const calls: string[] = [];
  for (const name of Object.values(MODAL_NAMES)) {
    (manager.getRef(name) as { current: unknown }).current = {
      present: () => calls.push(`present:${name}`),
      dismiss: () => calls.push(`dismiss:${name}`),
    };
  }
  return { manager, calls };
};

describe('GlobalModalManager', () => {
  it('show presents with props set before present()', () => {
    const { manager } = setup();
    let seen: unknown;
    (manager.getRef('A') as { current: unknown }).current = {
      present: () => (seen = manager.getProps('A')),
    };
    manager.show('A', { x: 1 });
    expect(seen).toEqual({ x: 1 });
    expect(manager.isOpen('A')).toBe(true);
    expect(manager.isAnyOpen()).toBe(true);
    expect(manager.getOpenModal()).toBe('A');
  });

  it('show closes others (and re-presents the target) by default', () => {
    const { manager, calls } = setup();
    manager.show('A');
    manager.show('B');
    manager.show('B', { y: 2 });
    expect(calls).toEqual([
      'present:A',
      'dismiss:A',
      'present:B',
      'dismiss:B',
      'present:B',
    ]);
    expect(manager.getOpenModals()).toEqual(['B']);
    expect(manager.getProps('B')).toEqual({ y: 2 });
  });

  it('closeOthers: false stacks and updates already-open modals in place', () => {
    const { manager, calls } = setup();
    const listener = jest.fn();
    manager.addListener('A', listener);
    manager.show('A');
    manager.show('B', { closeOthers: false });
    manager.show('A', { closeOthers: false, z: 3 });
    expect(calls).toEqual(['present:A', 'present:B']);
    expect(listener).toHaveBeenLastCalledWith(true, { z: 3 });
    expect(manager.getOpenModals()).toEqual(['A', 'B']);
  });

  it('hide dismisses, clears props and notifies', () => {
    const { manager, calls } = setup();
    const listener = jest.fn();
    manager.addListener('A', listener);
    manager.show('A', { x: 1 });
    manager.hide('A');
    manager.hide('A');
    expect(calls).toEqual(['present:A', 'dismiss:A']);
    expect(listener).toHaveBeenLastCalledWith(false, {});
    expect(listener).toHaveBeenCalledTimes(2);
    expect(manager.getProps('A')).toEqual({});
    expect(manager.isAnyOpen()).toBe(false);
    expect(manager.getOpenModal()).toBeNull();
  });

  it('toggle and convenience methods', () => {
    const { manager } = setup();
    manager.toggleA();
    expect(manager.isOpen('A')).toBe(true);
    manager.toggleA();
    expect(manager.isOpen('A')).toBe(false);
    manager.openB({ q: 1 });
    expect(manager.getProp('B', 'q')).toBe(1);
    manager.closeB();
    expect(manager.isOpen('B')).toBe(false);
  });

  it('prop updates notify only while open', () => {
    const { manager } = setup();
    const listener = jest.fn();
    manager.addListener('A', listener);
    manager.setProps('A', { a: 1 });
    expect(listener).not.toHaveBeenCalled();
    manager.show('A', { a: 1 });
    manager.updateProps('A', { b: 2 });
    manager.setProp('A', 'c', 3);
    expect(listener).toHaveBeenLastCalledWith(true, { a: 1, b: 2, c: 3 });
    manager.clearProps('A');
    expect(listener).toHaveBeenLastCalledWith(true, {});
    expect(manager.getProp('A', 'a', 'fallback')).toBe('fallback');
  });

  it('passes frozen props and global events', () => {
    const { manager } = setup();
    const global = jest.fn();
    manager.addGlobalListener(global);
    manager.show('A', { x: 1 });
    const event = global.mock.calls[0][0];
    expect(event).toEqual({
      type: 'show',
      modalName: 'A',
      isOpen: true,
      props: { x: 1 },
    });
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.props)).toBe(true);
  });

  it('unsubscribes listeners', () => {
    const { manager } = setup();
    const listener = jest.fn();
    const off = manager.addListener('A', listener);
    off();
    manager.show('A');
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops notifying when a listener throws (0.2.0 behaviour)', () => {
    const { manager } = setup();
    const after = jest.fn();
    manager.addListener('A', () => {
      throw new Error('boom');
    });
    manager.addListener('A', after);
    expect(() => manager.show('A')).toThrow('boom');
    expect(after).not.toHaveBeenCalled();
    expect(manager.isOpen('A')).toBe(true);
  });

  it('getProps returns the stored object, listeners get a frozen copy', () => {
    const { manager } = setup();
    const seen: unknown[] = [];
    manager.addListener('A', (_open, p) => seen.push(p));
    manager.show('A');
    const props = { x: 1 };
    manager.setProps('A', props);
    expect(manager.getProps('A')).toBe(props);
    expect(Object.isFrozen(manager.getProps('A'))).toBe(false);
    expect(seen[1]).toEqual({ x: 1 });
    expect(seen[1]).not.toBe(props);
    expect(Object.isFrozen(seen[1])).toBe(true);
  });

  it('updateState syncs without calling dismiss', () => {
    const { manager, calls } = setup();
    const listener = jest.fn();
    manager.addListener('A', listener);
    manager.show('A');
    manager.updateState('A', false);
    manager.updateState('A', false);
    expect(calls).toEqual(['present:A']);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(manager.isAnyOpen()).toBe(false);
  });

  it('getState and getAllProps', () => {
    const { manager } = setup();
    manager.show('B', { k: 1 });
    expect(manager.getState()).toEqual({
      isAOpen: false,
      isBOpen: true,
      isCOpen: false,
    });
    expect(manager.getAllProps()).toEqual({ B: { k: 1 } });
    manager.clearAllProps();
    expect(manager.getAllProps()).toEqual({});
  });

  it('register / unregister', () => {
    const { manager } = setup();
    const early = manager.getRef('D' as Name);
    manager.registerModal('D', { stateKey: 'dOpen' });
    expect(manager.getRef('D' as Name)).toBe(early);
    expect(manager.getModalNames()).toEqual(['A', 'B', 'C', 'D']);
    (manager as any).openD();
    expect(manager.getState().dOpen).toBe(true);
    manager.unregisterModal('D' as Name);
    expect(manager.isAnyOpen()).toBe(false);
    expect((manager as any).openD).toBeUndefined();
    expect('dOpen' in manager.getState()).toBe(false);
  });

  it('becomes a no-op after destroy', () => {
    const { manager, calls } = setup();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    manager.show('A');
    manager.destroy();
    manager.show('A');
    expect(calls).toEqual(['present:A', 'dismiss:A']);
    expect(manager.isAnyOpen()).toBe(false);
    warn.mockRestore();
  });

  it('warns on unknown modal names', () => {
    const { manager } = setup();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    manager.show('Nope' as Name);
    expect(warn).toHaveBeenCalledWith(
      '[GlobalModalManager] Modal "Nope" not found'
    );
    warn.mockRestore();
  });
});
