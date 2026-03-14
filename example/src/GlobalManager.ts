import { createModalManager } from '@hexhad/react-utils';

export const MODAL_NAMES = {
  INTERDIMENSIONAL_CABLE: 'InterdimensionalCable',
  PORTAL_GUN: 'PortalGun',
  MEESEEKS_BOX: 'MeeseeksBox',
} as const;

export type ModalName = (typeof MODAL_NAMES)[keyof typeof MODAL_NAMES];

declare module '@hexhad/react-utils' {
  interface ModalPropsRegistry {
    InterdimensionalCable: {
      channel?: number;
      onClose?: () => void;
    };
    PortalGun: {
      destination: string;
      onConfirm: () => void;
    };
    MeeseeksBox: {
      task: string;
      onComplete: () => void;
    };
  }
}

export const GlobalModalManager = createModalManager<ModalName>(MODAL_NAMES);
