import { GlobalModalManager, MODAL_NAMES } from '../GlobalManager';
import InterdimensionalCableModal from './InterdimensionalCableModal';
import MeeseeksBoxModal from './MeeseeksBoxModal';
import PortalGunModal from './PortalGunModal';

/**
 * Mount this once at the root of your app, inside AppProviders.
 * Every modal ref is wired to the GlobalModalManager here — nothing else needs to know.
 */
export default function ModalCenter() {
  return (
    <>
      <InterdimensionalCableModal
        ref={GlobalModalManager.getRef(MODAL_NAMES.INTERDIMENSIONAL_CABLE)}
      />
      <PortalGunModal ref={GlobalModalManager.getRef(MODAL_NAMES.PORTAL_GUN)} />
      <MeeseeksBoxModal
        ref={GlobalModalManager.getRef(MODAL_NAMES.MEESEEKS_BOX)}
      />
    </>
  );
}
