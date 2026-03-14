import type { ProviderEntry } from '@hexhad/react-utils';
import { ProviderTreeCreator } from '@hexhad/react-utils';
import { useCallback } from 'react';
import { Button, ScrollView, StyleSheet, View } from 'react-native';
import { GlobalModalManager } from './GlobalManager';
import ModalCenter from './modals/ModalCenter';

const providers: ProviderEntry[] = [[View], [ScrollView]];

const AppProviders = ProviderTreeCreator(providers);

export default function App() {
  const openCable = useCallback(() => {
    GlobalModalManager.openInterdimensionalCable({ channel: 1 });
  }, []);

  const openPortalGun = useCallback(() => {
    GlobalModalManager.openPortalGun({
      destination: 'Dimension C-137',
      onConfirm: () => console.log('Portal opened!'),
    });
  }, []);

  const openMeeseeks = useCallback(() => {
    GlobalModalManager.openMeeseeksBox({
      task: 'Help me with my golf game',
      onComplete: () => console.log('Existence is pain.'),
    });
  }, []);

  return (
    <AppProviders>
      <View style={styles.container}>
        <Button title="Watch Interdimensional Cable" onPress={openCable} />
        <Button title="Open Portal Gun" onPress={openPortalGun} />
        <Button title="Summon Mr. Meeseeks" onPress={openMeeseeks} />
      </View>

      <ModalCenter />
    </AppProviders>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
});
