import { queryDataTable } from "./console-utilities";
import * as React from "react";
import DataGrid from 'react-data-grid';

interface Props {
  tableName: string;
}

interface State {
  rows: any[];
  columns: { key: string, name: string }[];
}

export class DataTable extends React.Component<Props, State> {

  constructor(props: Props) {
    super(props);

    this.state = {
      rows: [],
      columns: [],
    };
  }

  async componentDidMount() {
    const resp = await queryDataTable<any>(this.props.tableName);

    const rows = resp.Items || [];
    const columns = rows.length > 0 ? Object.keys(rows[0]).map(key => ({
      key: key,
      name: key
    })) : [];

    this.setState((prev) => ({
      ...prev,
      rows,
      columns,
    }));
  }

  render() {
    return (
      <div className="datatable">
        <DataGrid columns={this.state.columns} rows={this.state.rows} />
      </div>
    );
  }
}
