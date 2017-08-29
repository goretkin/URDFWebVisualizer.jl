module.exports = { output: { libraryTarget: 'var', library: 'STLLoader' }, externals: [ { "./STLLoader.js", 'var STLLoader' } ], module: {noParse: [/STLLoader.js/]} }
