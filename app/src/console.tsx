import { run } from "./lib/console-assets/console-assets-entry";
import * as React from "react";
import DataGrid from 'react-data-grid';

class App extends React.Component {
  render() {
    const columns = [
      { key: 'id', name: 'ID' },
      { key: 'title', name: 'Title' }
    ];
    
    const rows = [
      { id: 0, title: 'Example' },
      { id: 1, title: 'Demo' }
    ];

    return (
      <React.Fragment>
        <DataGrid columns={columns} rows={rows} />
      </React.Fragment>
    );
  }
}

run(() => <App />);
