import React, { createContext, useContext } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  ProviderTree,
  ProviderTreeCreator,
} from '../utils/ProviderTreeCreator';
import type { ProviderEntry } from '../utils/ProviderTreeCreator';

const Ctx = createContext<string[]>([]);

const makeProvider = (name: string) => {
  const P = ({
    children,
    suffix = '',
  }: React.PropsWithChildren<{ suffix?: string }>) => {
    const parent = useContext(Ctx);
    return (
      <Ctx.Provider value={[...parent, name + suffix]}>{children}</Ctx.Provider>
    );
  };
  P.displayName = name;
  return P;
};

const A = makeProvider('A');
const B = makeProvider('B');

let mounts = 0;
const Leaf = () => {
  React.useEffect(() => {
    mounts++;
  }, []);
  return <>{useContext(Ctx).join('>')}</>;
};

const render = (el: React.ReactElement) => {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(el);
  });
  return r;
};

beforeEach(() => {
  mounts = 0;
});

describe('ProviderTreeCreator', () => {
  it('nests providers outermost-first with props', () => {
    const Tree = ProviderTreeCreator([
      [A, { suffix: '1' }],
      [B],
    ] as ProviderEntry[]);
    expect(
      render(
        <Tree>
          <Leaf />
        </Tree>
      ).toJSON()
    ).toBe('A1>B');
  });

  it('caches by array reference and names the component', () => {
    const providers = [[A], [B]] as ProviderEntry[];
    const Tree = ProviderTreeCreator(providers);
    expect(ProviderTreeCreator(providers)).toBe(Tree);
    expect(Tree.displayName).toBe('ProviderTreeCreator(A, B)');
  });

  it('adds no wrapper component per provider', () => {
    const Tree = ProviderTreeCreator([[A], [B]] as ProviderEntry[]);
    const r = render(
      <Tree>
        <Leaf />
      </Tree>
    );
    // Tree -> A -> B -> Leaf (context providers are not composite instances)
    const composites: string[] = [];
    const walk = (node: any) => {
      if (typeof node.type === 'function')
        composites.push(node.type.displayName ?? node.type.name);
      node.children?.forEach((c: any) => typeof c === 'object' && walk(c));
    };
    walk(r.root);
    expect(composites).toEqual([Tree.displayName, 'A', 'B', 'Leaf']);
  });

  it('works with no providers', () => {
    const Tree = ProviderTreeCreator([]);
    expect(
      render(
        <Tree>
          <Leaf />
        </Tree>
      ).toJSON()
    ).toBeNull();
  });
});

describe('ProviderTree', () => {
  it('updates provider props in place without remounting children', () => {
    const r = render(
      <ProviderTree providers={[[A, { suffix: '1' }], [B]] as ProviderEntry[]}>
        <Leaf />
      </ProviderTree>
    );
    expect(r.toJSON()).toBe('A1>B');
    act(() => {
      r.update(
        <ProviderTree
          providers={[[A, { suffix: '2' }], [B]] as ProviderEntry[]}
        >
          <Leaf />
        </ProviderTree>
      );
    });
    expect(r.toJSON()).toBe('A2>B');
    expect(mounts).toBe(1);
  });
});
