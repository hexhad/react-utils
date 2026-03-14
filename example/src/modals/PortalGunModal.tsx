import type { ModalRef } from '@hexhad/react-utils';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { Button, Modal, StyleSheet, Text, View } from 'react-native';
import { GlobalModalManager, MODAL_NAMES } from '../GlobalManager';

type Props = {};

const PortalGunModal = forwardRef<ModalRef, Props>((_, ref) => {
  const [visible, setVisible] = useState(false);
  const [destination, setDestination] = useState('');
  const [onConfirm, setOnConfirm] = useState<(() => void) | undefined>(
    undefined
  );

  useEffect(() => {
    return GlobalModalManager.addListener(
      MODAL_NAMES.PORTAL_GUN,
      (isOpen, props) => {
        if (isOpen) {
          setDestination(props.destination);
          setOnConfirm(() => props.onConfirm);
          setVisible(true);
        } else {
          setVisible(false);
        }
      }
    );
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    GlobalModalManager.updateState(MODAL_NAMES.PORTAL_GUN, false);
  }, []);

  const present = useCallback(() => {
    setVisible(true);
  }, []);

  useImperativeHandle(ref, () => ({ present, dismiss }), [present, dismiss]);

  const handleConfirm = useCallback(() => {
    onConfirm?.();
    dismiss();
  }, [onConfirm, dismiss]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={dismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>🔫 Portal Gun</Text>
          <Text style={styles.subtitle}>Destination: {destination}</Text>
          <Button title="Open Portal" onPress={handleConfirm} />
          <Button title="Cancel" onPress={dismiss} />
        </View>
      </View>
    </Modal>
  );
});

PortalGunModal.displayName = 'PortalGunModal';

export default PortalGunModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
});
