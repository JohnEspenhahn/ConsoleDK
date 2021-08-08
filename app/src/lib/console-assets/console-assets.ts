import * as webpack from 'webpack';
import * as cdk from "monocdk";
import * as path from "path";
import * as HtmlWebpackPlugin from 'html-webpack-plugin';

export interface ConsoleAssetsProperties {
    entry: string;
}

export class ConsoleAssets extends cdk.Construct {

    constructor(scope: cdk.Construct, id: string, props: ConsoleAssetsProperties) {
        super(scope, id);

        const root = path.resolve(__dirname, '../../..');
        webpack([
            {
                entry: props.entry,
                output: {
                    filename: 'app-[hash].bundle.js',
                    path: path.resolve(root, 'build/src')
                },
                devtool: 'source-map',
                module: {
                    rules: [
                        {
                            test: /\.(ts|tsx|js)?$/,
                            include: [
                                props.entry,
                                path.resolve(root, "src"),
                                path.resolve(root, "node_modules")
                            ],
                            use: {
                                loader: 'babel-loader',
                                options: {
                                    presets: [
                                        ["@babel/preset-env", { useBuiltIns: "usage", corejs: "2" }],
                                        "@babel/preset-react",
                                        "@babel/preset-flow",
                                        "@babel/preset-typescript"
                                    ],
                                    plugins: [
                                        "@babel/plugin-proposal-class-properties",
                                        "@babel/plugin-proposal-object-rest-spread"
                                    ]
                                },
                            },
                        },
                    ],
                },
                plugins: [
                    new HtmlWebpackPlugin({
                        title: 'App',
                        meta: {
                            viewport: 'width=device-width,minimum-scale=1,initial-scale=1'
                        }
                    }),
                ],
                resolve: {
                    extensions: [
                      '.tsx'
                    ],
                    alias: Object.assign({
                    //   'react-native$': 'react-native-web',
                    }),
                  },
            },
        ], (err, stats) => {
            if (stats) {
                console.log(stats.toString());
            } else {
                console.log(err);
            }
        });

    }

}