import * as React from 'react';
import { DefaultTheme, Provider as PaperProvider } from 'react-native-paper';
import {
  AppRegistry,
  Platform
} from 'react-native';

declare var document: any;

export function run(app: () => JSX.Element, theme=DefaultTheme) {
  AppRegistry.registerComponent(
    'NativeApp',
    () => wrap(app, theme)
  );

  AppRegistry.runApplication('App', { rootTag: document.getElementById('root') });
}

function wrap(app: () => JSX.Element, theme=DefaultTheme): React.ComponentType<any> {
  return () => (
    <PaperProvider theme={theme}>
      <React.Fragment>
        {Platform.OS === 'web' ? (
          <style type="text/css">{`
            @font-face {
              font-family: 'MaterialCommunityIcons';
              src: url(${require('react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf')}) format('truetype');
            }
          `}</style>
        ) : null}
        {app()}
      </React.Fragment>
    </PaperProvider>
  );
}