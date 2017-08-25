const path = require("path");

module.exports = {
  entry: "./main",
  target: "web",
  output: {
    publicPath: "/",
    path: `${__dirname}/build`,
    filename: "[name].js"
  },
  devtool: "inline-source-map",
  resolve: {
    modules: [path.resolve("./"), "node_modules"],
    extensions: [".js", ".ts"],
  },
  module: {
    rules: [
      {
        enforce: "pre",
        test: /\.ts$/,
        exclude: /node_modules/,
        use: ["tslint-loader"],
      },
      {
        test: /\.ts$/,
        exclude: /(node_modules|\.d\.ts$)/,
        use: ["ts-loader"],
      },
    ],
  },
};
