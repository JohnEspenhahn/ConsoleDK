### Data Ingestions

- Network transfer

- - $0.09 / GB

- S3

- - $0.01 / GB

- API Gateway

- - $0.01 / GB

- Step Function

- - $0.02 / GB

- Lambda

- - $0.01 / GB  

- DDB

- - $1.4 / GB

---------------------------------

Cost  - $1.54 / GB
Price - $2.00 / GB


### Frequent access data storage

- S3

- - $0.03 / GB

- DynamoDB

- - $0.28 / GB  * 3 for indexes = $0.84

---------------------------------

Cost  - $0.87 / GB
Price - $1.00 / GB 


### Infrequent access data storage

- S3

- - $0.03 / GB

---------------------------------

Cost  - $0.03 / GB
Price - $0.10 / GB


### Data Query

- Network transfer

- - $0.09 / GB

- DynamoDB (assume record size of 1kb)

- - ~$0.28 / GB

- Athena

- - ~$0.01 / GB

- S3 for Athena

- - ~$0.01 / GB

---------------------------------

Cost  - $0.39 / GB

+ > $0.02 / GB of infrequent access data storage scanned

Price - $0.50 / GB

+ $0.02 / GB of infrequent access data storage scanned


### Hosting

- API Gateway

- - $3.50 / M Request = $3.50

- CW Logs

- - $0.70 / GB * 3 = $2.10

- Network transfer

- - $0.09 / GB * 3 = $0.30

- Route53

- - $0.50 for hosted zone
- - $0.40 / M Request for resolutions

- Domain

- - TBD

- CloudFront

- - $0.085 / GB * 4 = $0.26

----------------------------------------

BYO Domain 
Cost  - $07.06
Price - $20.00 




---------------------------------------------------------

Ingest 100,000 rows per month = 2 GB / month   (assume each record is ~20KB)

Hosting = $20
Ingest  = $2.00 * 2  = $4.00
Storage
 Frequent access   = $1.00 * 24  = $24.00 (assume we keep 1 years of data available for frequent access)
 Infrequent access = $0.10 * 120 = $12.00 (assume we have 10 years of historic data)

Query   = $0.50 * 2  = $1.00
 Infrequent access queries = $0.02 * 120 * 10 = $24.00


Support = $100 


 Monthly cost  = $85 + $100 for support
 Monthly price = $49
 ------------------------
 Net revenue = $36 + $100 for support
