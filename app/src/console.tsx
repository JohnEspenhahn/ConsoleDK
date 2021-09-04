import { run } from "./lib/console-assets/console-assets-entry";
import { queryDataTable } from "./lib/console-assets/utilities/console-utilities";
import * as React from "react";
import DataGrid from 'react-data-grid';

interface Props {

}

interface State {
  rows: any[];
}

class App extends React.Component<Props, State> {

  constructor(props: Props) {
    super(props);

    this.state = {
      rows: [],
    };
  }

  async componentDidMount() {
    const resp = await queryDataTable<any>('Invoices');

    this.setState((prev) => ({
      ...prev,
      rows: resp.Items || [],
    }));
  }

  render() {
    const columns = this.state.rows && this.state.rows.length > 0 ? Object.keys(this.state.rows[0]).map(key => ({
      key: key,
      name: key
    })) : [];

    return (
      <React.Fragment>
        <DataGrid columns={columns} rows={this.state.rows} />
      </React.Fragment>
    );
  }
}

run(() => <App />);
