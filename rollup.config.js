import {terser} from 'rollup-plugin-terser'

export default {
	input: 'src/index.js',
	output: [
		{
			file: 'dist/synthaser.js',
			format: 'umd',
			name: 'SynthasePlot'
		},
		{
			file: 'dist/synthaser.min.js',
			format: 'umd',
			name: 'SynthasePlot',
			plugins: [terser()]
		}
	],
	plugins: []
}
