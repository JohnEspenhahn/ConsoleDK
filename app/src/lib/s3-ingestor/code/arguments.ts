export const Parameters = {
    MAPPINGS: "MAPPINGS",
};


type S3PrefixVariableType = "TABLE" | "PARTITION_KEY" | "SECONDARY_PARTITION_KEY" | "SORT_KEY" | "COLUMN";

interface SerializableIngestionTarget {
    tableName: string;
}

export interface S3PrefixVariable {
    name: string;
    type: S3PrefixVariableType;
}

export interface SerializableS3IngestionMapping {
    prefix: string;
    prefixVariables: S3PrefixVariable[];
    target: SerializableIngestionTarget;
}