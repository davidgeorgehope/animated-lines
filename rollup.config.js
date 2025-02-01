import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.js',
  output: {
    file: 'gifuct-js.umd.js',
    format: 'umd',
    name: 'gifuct',
    globals: {
      'gifuct-js': 'gifuct'
    }
  },
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false
    }), 
    commonjs({
      transformMixedEsModules: true
    })
  ]
};