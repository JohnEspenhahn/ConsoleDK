import webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import * as cdk from "monocdk";
import * as path from "path";
import { 
    aws_s3 as s3, 
    aws_s3_deployment as deployment
} from "monocdk";

export interface ConsoleAssetsProperties {
    entry: string;
    bucketName: string;
}

export class ConsoleAssets extends cdk.Construct {

    private rootFolder: string;
    private targetFolder: string;
    private buildFolder: string;

    private props: ConsoleAssetsProperties;

    private bucket: s3.Bucket;

    constructor(scope: cdk.Construct, id: string, props: ConsoleAssetsProperties) {
        super(scope, id);

        this.props = props;

        this.rootFolder = path.resolve(__dirname, '../../..');
        this.buildFolder = path.resolve(this.rootFolder, 'build');
        this.targetFolder = path.resolve(this.buildFolder, 'console');

        this.bucket = new s3.Bucket(this, 'ConsoleAssetsBucket', {
            publicReadAccess: true,   
            websiteIndexDocument: "index.html",
            bucketName: props.bucketName,
        });
    }

    async build() {
        await (new Promise((resolve, reject) => {
            webpack([
                {
                    entry: path.resolve(this.buildFolder, this.props.entry),
                    output: {
                        filename: 'app-[hash].bundle.js',
                        path: this.targetFolder,
                    },
                    devtool: 'source-map',
                    module: {
                        rules: [
                            {
                                test: /\.(tsx?|jsx?)?$/,
                                exclude: /(node_modules|build)/,
                                include: [
                                    path.resolve(`${this.rootFolder}/src`),
                                ],
                                loader: 'babel-loader',
                                options: {
                                    rootMode: "upward",
                                    presets: [
                                        [
                                            "@babel/env",
                                            {
                                                "bugfixes": true,
                                                "shippedProposals": true,
                                                "corejs": 3,
                                                "useBuiltIns": "entry",
                                                "targets": {
                                                    "esmodules": true
                                                },
                                            }
                                        ],
                                        "@babel/preset-react",
                                        "@babel/preset-flow",    
                                        "@babel/preset-typescript"
                                    ]
                                },
                            },
                        ],
                    },
                    plugins: [
                        new HtmlWebpackPlugin({
                            title: 'App',
                            meta: {
                                viewport: 'width=device-width,minimum-scale=1,initial-scale=1',
                                endpoint: `${this.bucket.bucketWebsiteUrl}`
                            }
                        }),
                    ],
                    resolve: {
                        modules: [
                            path.join(this.rootFolder, 'node_modules')
                        ],
                        extensions: [
                        '.tsx',
                        '.ts',
                        '.jsx',
                        '.js'
                        ],
                        // https://github.com/facebook/react/issues/20235
                        alias: {
                        "react/jsx-dev-runtime": "react/jsx-dev-runtime.js",
                        "react/jsx-runtime": "react/jsx-runtime.js"
                        }
                    },
                },
            ], (err, stats) => {
                if (stats) {
                    console.log(stats.toString());
                    resolve(stats);
                } else {
                    console.log(err);
                    reject(err);
                }

                
            });
        }));

        const _depoyment = new deployment.BucketDeployment(this, "ConsoleAssetsDeployment", {
            sources: [deployment.Source.asset(this.targetFolder)],
            destinationBucket: this.bucket,
        });
    }

}