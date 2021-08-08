import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from 'monocdk';
import * as App from '../src/stack/app-stack';
import { parse } from "../src/lib/s3-ingestor/code/mapping-parser";

test('Mapping parser', () => {
    const match = parse('944551238448/test-table/test-customer/testdata.csv', [
        {
          "prefix": "{Table}/{Partition}/",
          "prefixVariables": [
              {
                  "name": "Table",
                  "type": "TABLE"
              },
              {
                  "name": "Partition",
                  "type": "PARTITION_KEY"
              }
          ],
          "columnVariables": []
      }
    ]);

    if (!match) {
      throw new Error("No match");
    }
});

test('Mapping parser in', () => {
    const match = parse('944551238448/test-table/test-customer/testdata.csv', [
        {
          "prefix": "{Table}/{Partition}/",
          "prefixVariables": [
              {
                  "name": "Table",
                  "type": "TABLE",
                  "in": ["test-table2", "test-table"]
              },
              {
                  "name": "Partition",
                  "type": "PARTITION_KEY"
              }
          ],
          "columnVariables": []
      }
    ]);

    console.log(match);

    if (!match) {
      throw new Error("No match");
    }
});
