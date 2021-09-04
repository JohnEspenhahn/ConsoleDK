import { S3IngestionMapping, S3PrefixVariable, ColumnVariable, VariableType } from "./arguments";

export interface Mapping {
    customerId: string;
    partitionKeyPrefix?: string;
    sortKey?: string;
    columns: { [columnName: string]: string };
    columnVariables: ColumnVariable[];
}

export interface ColumnMapping {
    partitionKeySuffix?: string;
    sortKey?: string;
}

export function validate(mappings: S3IngestionMapping[]) {
    const prefixRegexes = new Set();
    for (const mapping of mappings) {
        validateMapping(mapping.prefix, mapping.prefixVariables, mapping.columnVariables);
        const prefixRegex = mappingPrefixToRegex("", mapping.prefix, mapping.prefixVariables);
        if (prefixRegexes.has(prefixRegex)) {
            throw new Error(`Equivalent duplicate paths convert to ${prefixRegex}. Occured with ${mapping.prefix}`);
        } else {
            prefixRegexes.add(prefixRegex);
        }
    }
}

export function validateMapping(prefix: string, prefixVariables: S3PrefixVariable[], columnVariables: ColumnVariable[]) {
    validatePrefixVariables(prefix, prefixVariables);
    assertHasExactlyOneVariableOfType(prefixVariables, [], "PARTITION_KEY");
    assertHasZeroOrOneVariablesOfType(prefixVariables, columnVariables, "SECONDARY_PARTITION_KEY");
    assertHasZeroOrOneVariablesOfType(prefixVariables, columnVariables, "SORT_KEY");
    assertHasZeroVariablesOfType(columnVariables, "COLUMN");
    assertHasZeroVariablesOfType(columnVariables, "PARTITION_KEY");
}

function mappingPrefixToRegex(publicTableName: string, prefix: string, prefixVariables: S3PrefixVariable[]) {
    for (const prefixVar of prefixVariables) {
        if (prefixVar.in) {
            const condition = `(?<${prefixVar.name}>` + prefixVar.in.join("|") + ")"
            prefix = prefix.replace('{' + prefixVar.name + '}', condition);
        } else {
            prefix = prefix.replace('{' + prefixVar.name + '}', `(?<${prefixVar.name}>[^/]+)`)
        }
    }

    return "^(?<customerId>[^/]+)/" + publicTableName + "/" + prefix + "[^/]+$";
}

export function parse(publicTableName: string, key: string, mappings: S3IngestionMapping[]): Mapping | null {
    for (const mapping of mappings) {
        const regexString = mappingPrefixToRegex(publicTableName, mapping.prefix, mapping.prefixVariables);
        console.log(regexString);

        const regex = new RegExp(regexString);
        const match = regex.exec(key);
        if (match && match.groups) {
            const type2Var = createTypeToVariableLookup(mapping.prefixVariables);

            const columns = type2Var.COLUMN.reduce((acc, prefixVar) => {
                if (match.groups) {
                    acc[prefixVar] = match.groups[prefixVar] ?? "";
                }
                
                return acc;
            }, {} as { [columnName: string]: string });

            const customerId = match.groups.customerId;
            if (customerId.indexOf("_") >= 0) {
                throw new Error("Invalid customerId, contains underscore");
            }

            return {
                customerId,
                partitionKeyPrefix: match.groups[type2Var.PARTITION_KEY] + (match.groups[type2Var.SECONDARY_PARTITION_KEY] ?? ""),
                sortKey: match.groups[type2Var.SORT_KEY],
                columns,
                columnVariables: mapping.columnVariables,
            }
        }
    }

    return null;
}

export type TypeToVariableLookup = {
    PARTITION_KEY: string;
    SECONDARY_PARTITION_KEY: string;
    SORT_KEY: string;
    COLUMN: string[];
}

export function getColumnMappingForRow(row: any, typeToVariableLookup: TypeToVariableLookup): ColumnMapping {
    return {
        partitionKeySuffix: row[typeToVariableLookup.SECONDARY_PARTITION_KEY] || '',
        sortKey: row[typeToVariableLookup.SORT_KEY] || '',
    };
}

export function createTypeToVariableLookup(variables: (S3PrefixVariable | ColumnVariable)[]): TypeToVariableLookup {
    const lookup: TypeToVariableLookup = {
        PARTITION_KEY: "",
        SECONDARY_PARTITION_KEY: "",
        SORT_KEY: "",
        COLUMN: [],
    };

    for (const prefixVar of variables) {
        if (prefixVar.type === "COLUMN") {
            lookup.COLUMN.push(prefixVar.name);
        } else {
            lookup[prefixVar.type] = prefixVar.name;
        }
    }

    return lookup;
}

function validatePrefixVariables(prefix: string, prefixVariables: S3PrefixVariable[]) {
    if (prefix.startsWith('/')) {
        throw new Error(`Prefix ${prefix} cannot start with '/'`);
    } else if (!prefix.endsWith('/')) {
        throw new Error(`Prefix ${prefix} must end with '/'`);
    }

    for (const prefixVar of prefixVariables) {
        if (prefixVar.in) {
            if (prefixVar.in.filter(val => val.indexOf("_") >= 0).length > 0) {
                throw new Error(`PrefixVariable in cannot contain '_' ${prefixVar.in}`);
            }
        }
    }

    const parts = prefix.split('/');
    const variables = parts.filter(part => part.match(/^{.+?}$/)).map(part => part.substring(1, part.length - 1));

    const variablesSet = new Set(variables);

    if (variables.length !== variablesSet.size) {
        throw new Error(`Prefix ${prefix} cannot contain duplicate variables`);
    }

    const prefixVariablesSet = new Set(prefixVariables.map(prefixVar => prefixVar.name));
    if (prefixVariablesSet.size !== prefixVariables.length) {
        throw new Error(`Prefix variables cannot contain duplicate variable names: ${JSON.stringify(prefixVariables)}`);
    }

    const missing: string[] = [];
    prefixVariablesSet.forEach(prefixVar => {
        if (!variablesSet.has(prefixVar)) {
            missing.push(prefixVar);
        }
    });

    if (missing.length > 0) {
        throw new Error(`Missing variables in prefix ${prefix}: ${missing.join(', ')}. Found: ${variables.join(', ')}`);
    }
}

function assertHasExactlyOneVariableOfType(prefixVariables: S3PrefixVariable[], columnVariables: ColumnVariable[], type: VariableType) {
    const count = countVariablesOfType(prefixVariables, columnVariables, type);
    if (count !== 1) {
        throw new Error(`Expected exactly one variable of type ${type}. Found ${count}.`)
    }
}

function assertHasZeroOrOneVariablesOfType(prefixVariables: S3PrefixVariable[], columnVariables: ColumnVariable[], type: VariableType) {
    const count = countVariablesOfType(prefixVariables, columnVariables, type);
    if (count !== 0 && count !== 1) {
        throw new Error(`Expected zero or one variables of type ${type}. Found ${count}.`)
    }
}

function assertHasZeroVariablesOfType(columnVariables: ColumnVariable[], type: VariableType) {
    const count = countVariablesOfType([], columnVariables, type);
    if (count !== 0 && count !== 1) {
        throw new Error(`Expected zero variables of type ${type} in ColumnVariables. Found ${count}.`)
    }
}

function countVariablesOfType(prefixVariables: S3PrefixVariable[], columnVariables: ColumnVariable[], type: VariableType) {
    let count = 0;
    for (const prefixVar of prefixVariables) {
        if (prefixVar.type === type) {
            count += 1;
        }
    }

    for (const columnVar of columnVariables) {
        if (columnVar.type === type) {
            count += 1;
        }
    }

    return count;
}