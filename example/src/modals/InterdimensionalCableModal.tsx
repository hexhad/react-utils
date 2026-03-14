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

const InterdimensionalCableModal = forwardRef<ModalRef, Props>((_, ref) => {
  const [visible, setVisible] = useState(false);
  const [channel, setChannel] = useState<number | undefined>(undefined);

  useEffect(() => {
    return GlobalModalManager.addListener(
      MODAL_NAMES.INTERDIMENSIONAL_CABLE,
      (isOpen, props) => {
        if (isOpen) {
          setChannel(props.channel);
          setVisible(true);
        } else {
          setVisible(false);
        }
      }
    );
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    GlobalModalManager.updateState(MODAL_NAMES.INTERDIMENSIONAL_CABLE, false);
  }, []);

  const present = useCallback(() => {
    setVisible(true);
  }, []);

  useImperativeHandle(ref, () => ({ present, dismiss }), [present, dismiss]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={dismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>📺 Interdimensional Cable</Text>
          {channel !== undefined && (
            <Text style={styles.subtitle}>Channel {channel}</Text>
          )}
          <Button
            title="Next Channel"
            onPress={() => setChannel((c) => (c ?? 0) + 1)}
          />
          <Button title="Close" onPress={dismiss} />
        </View>
      </View>
    </Modal>
  );
});

InterdimensionalCableModal.displayName = 'InterdimensionalCableModal';

export default InterdimensionalCableModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
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
