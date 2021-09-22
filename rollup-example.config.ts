import typescript from '@rollup/plugin-typescript'
import coffeescript from 'rollup-plugin-coffee-script'
import resolve from '@rollup/plugin-node-resolve';

export default {
    input: 'examples/main.ts',
    plugins: [typescript(), coffeescript(), resolve()],
    output: {
        file: 'build/example-bundle.js',
        format: 'esm',
        inlineDynamicImports: true,
        interop: 'esModule',
        sourcemap: true,
    }
}
