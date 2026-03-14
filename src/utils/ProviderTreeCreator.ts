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

// Stable innermost node — defined at module level so it is never recreated.
const FragmentWrapper: React.FC<React.PropsWithChildren<object>> = ({
  children,
}) => React.createElement(React.Fragment, null, children);

// WeakMap cache — when the same providers array reference is passed on every
// call (i.e. declared at module level), the composed tree is returned from
// cache with zero re-computation.
const composedCache = new WeakMap<object[], ComposedProvider>();

/**
 * Composes multiple React (or React Native) context providers into a single
 * wrapper component, eliminating deeply nested JSX "provider hell".
 *
 * Providers are applied outermost-first (left to right = top to bottom in the tree).
 * Declare the providers array outside your component to benefit from WeakMap caching.
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

  const composed = providers.reduceRight<ComposedProvider>(
    (InnerComponent, entry) => {
      const ProviderComponent = entry[0] as React.ComponentType<
        React.PropsWithChildren<AnyProps>
      >;
      const props: AnyProps = entry[1] ?? {};

      function ProviderWrapper({ children }: React.PropsWithChildren<object>) {
        return React.createElement(
          ProviderComponent,
          props,
          React.createElement(InnerComponent, null, children)
        );
      }

      ProviderWrapper.displayName = `ProviderTreeCreator(${
        ProviderComponent.displayName ?? ProviderComponent.name ?? 'Unknown'
      })`;

      return ProviderWrapper;
    },
    FragmentWrapper
  );

  composedCache.set(providers, composed);

  return composed;
}

export default ProviderTreeCreator;
