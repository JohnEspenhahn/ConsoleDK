export const Parameters = {
    MAPPINGS: "MAPPINGS",
    DDB_TABLE: "DDB_TABLE",
};


export type VariableType = "TABLE" | "PARTITION_KEY" | "SECONDARY_PARTITION_KEY" | "SORT_KEY" | "COLUMN";


export interface S3PrefixVariable {
    name: string;
    type: VariableType;
}

export interface ColumnVariable {
    name: string;
    type: VariableType;
}

export interface S3IngestionMapping {
    prefix: string;
    prefixVariables: S3PrefixVariable[];
    columnVariables: ColumnVariable[];
}