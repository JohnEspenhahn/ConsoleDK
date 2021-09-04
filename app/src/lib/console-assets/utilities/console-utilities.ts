import { apiCall } from "./api";

export interface QueryDataTableResponse<T> {
  Items: T[];
}

export async function queryDataTable<T>(table: string): Promise<QueryDataTableResponse<T>> {
    return await apiCall(`queryDataTable/${table}`);
}

export { DataTable } from "./datatable";

