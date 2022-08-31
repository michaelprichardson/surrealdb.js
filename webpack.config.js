import webpack from 'webpack';

export default [
	{
		target: "web",
		entry: "./index.ts",
		output: {
			filename: "index.js",
			path: new URL("./dist/web", import.meta.url).pathname,
			libraryExport: "default",
			libraryTarget: "window",
			library: "Surreal",
			clean: true,
		},
		devtool: false,
		plugins: [
			new webpack.NormalModuleReplacementPlugin(
				/..\/websocket\/index.js$/,
				"/src/websocket/index.web.js"
			),
		],
		resolve: {
			extensions: [".ts", ".js"],
		},
		module: {
			rules: [
				{
					test: /\.js$/,
					exclude: /(node_modules)/,
					use: {
						loader: "babel-loader",
						options: {
							presets: ["@babel/preset-env"],
							plugins: [
								"@babel/plugin-proposal-class-properties",
								"@babel/plugin-proposal-private-methods",
							],
						},
					},
				},
				{
					test: /\.tsx?/,
					use: "ts-loader",
					exclude: /node_modules/,
				},
			],
		},
	},
	{
		target: "node",
		entry: "./index.ts",
		output: {
			filename: "index.cjs",
			path: new URL("./dist/lib", import.meta.url).pathname,
			libraryExport: "default",
			libraryTarget: "umd",
			library: "Surreal",
			clean: true,
		},
		devtool: false,
		plugins: [
			new webpack.NormalModuleReplacementPlugin(
				/..\/websocket\/index.js$/,
				"/src/websocket/index.node.js"
			),
		],
		resolve: {
			extensions: [".ts", ".js"],
		},
		module: {
			rules: [
				{
					test: /\.js$/,
					exclude: /(node_modules)/,
					use: {
						loader: "babel-loader",
						options: {
							presets: ["@babel/preset-env"],
							plugins: [
								"@babel/plugin-proposal-class-properties",
								"@babel/plugin-proposal-private-methods",
							],
						},
					},
				},
				{
					test: /\.tsx?/,
					use: "ts-loader",
					exclude: /node_modules/,
				},
			],
		},
	},
];
