import React from 'react';

type AnyProps = Record<string, unknown>;

/**
 * A tuple of [ComponentType, optional props].
 * Supports any React component including React Native components.
 */
export type ProviderEntry<P extends AnyProps = AnyProps> =
  | [React.ComponentType<React.PropsWithChildren<P>>, P]
  | [React.ComponentType<React.PropsWithChildren<P>>];

/** The composed wrapper component returned by `ProviderTreeCreator`. */
export type ComposedProvider = React.ComponentType<
  React.PropsWithChildren<object>
>;

export interface ProviderTreeProps {
  providers: readonly ProviderEntry[];
  children?: React.ReactNode;
}

const getName = (component: React.ComponentType<any>): string =>
  component.displayName ?? component.name ?? 'Unknown';

/**
 * Nests `children` inside every provider, outermost-first, without adding any
 * intermediate wrapper components to the tree.
 */
function nestProviders(
  providers: readonly ProviderEntry[],
  children: React.ReactNode
): React.ReactNode {
  let node = children;
  for (let i = providers.length - 1; i >= 0; i--) {
    const entry = providers[i]!;
    node = React.createElement(
      entry[0] as React.ComponentType<React.PropsWithChildren<AnyProps>>,
      entry[1],
      node
    );
  }
  return node;
}

// WeakMap cache — when the same providers array reference is passed on every
// call (i.e. declared at module level), the composed tree is returned from
// cache with zero re-computation.
const composedCache = new WeakMap<object, ComposedProvider>();

/**
 * Composes multiple React (or React Native) context providers into a single
 * wrapper component, eliminating deeply nested JSX "provider hell".
 *
 * Providers are applied outermost-first (left to right = top to bottom in the tree).
 * Declare the providers array outside your component to benefit from WeakMap caching.
 *
 * The result is a single component, so N providers add N + 1 nodes to the
 * tree rather than one wrapper per provider.
 *
 * Every call with a new array returns a new component type, which remounts
 * everything below it. When the providers are built inside a component
 * (e.g. with `useMemo`), prefer `<ProviderTree providers={...}>`.
 *
 * @example
 * const providers: ProviderEntry[] = [
 *   [RickProvider, { dimension: 'C-137' }],
 *   [MortyProvider],
 *   [CouncilOfRicksProvider, { member: 'Doofus Rick' }],
 * ];
 *
 * const AppProviders = ProviderTreeCreator(providers);
 *
 * export default function App() {
 *   return (
 *     <AppProviders>
 *       <GalacticFederation />
 *     </AppProviders>
 *   );
 * }
 */
export function ProviderTreeCreator(
  providers: ProviderEntry[]
): ComposedProvider {
  const cached = composedCache.get(providers);
  if (cached) return cached;

  // Snapshot so later mutation of the caller's array cannot change the tree.
  const snapshot = providers.slice();

  function ComposedProviders({ children }: React.PropsWithChildren<object>) {
    return nestProviders(snapshot, children) as React.ReactElement;
  }

  ComposedProviders.displayName = `ProviderTreeCreator(${snapshot
    .map((entry) => getName(entry[0]))
    .join(', ')})`;

  composedCache.set(providers, ComposedProviders);

  return ComposedProviders;
}

/**
 * Component form of `ProviderTreeCreator`. Safe to use with providers built
 * during render: changing the `providers` array (or a provider's props)
 * re-renders the providers in place instead of remounting the subtree.
 *
 * @example
 * <ProviderTree providers={[[Provider, { store }], [SafeAreaProvider]]}>
 *   <App />
 * </ProviderTree>
 */
export function ProviderTree({ providers, children }: ProviderTreeProps) {
  return nestProviders(providers, children) as React.ReactElement;
}

export default ProviderTreeCreator;
