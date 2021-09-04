import { run } from "./lib/console-assets/console-assets-entry";
import { DataTable } from "./lib/console-assets/utilities/console-utilities";
import * as React from "react";

interface Props {

}

interface State {
  
}

class App extends React.Component<Props, State> {

  constructor(props: Props) {
    super(props);
  }

  render() {
    return (
      <React.Fragment>
        <DataTable tableName="Invoices" />
      </React.Fragment>
    );
  }
}

run(() => <App />);
