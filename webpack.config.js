const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const {InjectManifest} = require('workbox-webpack-plugin');
const WebpackPwaManifest = require('webpack-pwa-manifest');
const {CleanWebpackPlugin} = require('clean-webpack-plugin');
const FaviconsWebpackPlugin = require('favicons-webpack-plugin');

module.exports = {
  entry: './src/index.js',
  module: {
    rules: [
      {
        test: /\.js$/,
        loader: 'babel-loader',
      },
    ],
  },
  plugins: [
    new webpack.ProgressPlugin(),
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      title: 'Progressive Web Application'
    }),
    new InjectManifest({
      swSrc: './src/sw.js',
      swDest: 'sw.js'
    }),
    new WebpackPwaManifest({
      name: 'My Progressive Web App',
      short_name: 'MyPWA',
      description: 'My awesome Progressive Web App!',
      background_color: '#ffffff',
      icons: [
        {
          src: path.resolve('./src/assets/icon.png'),
          sizes: [96, 128, 192, 256, 384, 512] // multiple sizes
        }
      ]
    }),
    new FaviconsWebpackPlugin('./src/assets/icon.png')
  ],
  optimization: {
    minimize: true
  },
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist')
  }
};
