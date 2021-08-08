import { run } from "./lib/console-assets/console-assets-entry";
import * as React from "react";
import {
    Text,
    View
} from 'react-native';

class App extends React.Component {
  render() {
    return (
      <View>
        <Text>Hello, World</Text>
      </View>
    );
  }
}

run(() => <App />);
