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

const MeeseeksBoxModal = forwardRef<ModalRef, Props>((_, ref) => {
  const [visible, setVisible] = useState(false);
  const [task, setTask] = useState('');
  const [onComplete, setOnComplete] = useState<(() => void) | undefined>(
    undefined
  );

  useEffect(() => {
    return GlobalModalManager.addListener(
      MODAL_NAMES.MEESEEKS_BOX,
      (isOpen, props) => {
        if (isOpen) {
          setTask(props.task);
          setOnComplete(() => props.onComplete);
          setVisible(true);
        } else {
          setVisible(false);
        }
      }
    );
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    GlobalModalManager.updateState(MODAL_NAMES.MEESEEKS_BOX, false);
  }, []);

  const present = useCallback(() => {
    setVisible(true);
  }, []);

  useImperativeHandle(ref, () => ({ present, dismiss }), [present, dismiss]);

  const handleComplete = useCallback(() => {
    onComplete?.();
    dismiss();
  }, [onComplete, dismiss]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={dismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>📦 Mr. Meeseeks Box</Text>
          <Text style={styles.subtitle}>Task: {task}</Text>
          <Text style={styles.body}>I'm Mr. Meeseeks, look at me!</Text>
          <Button title="Task Complete!" onPress={handleComplete} />
          <Button title="Dismiss" onPress={dismiss} />
        </View>
      </View>
    </Modal>
  );
});

MeeseeksBoxModal.displayName = 'MeeseeksBoxModal';

export default MeeseeksBoxModal;

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
    color: '#444',
  },
  body: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
  },
});
