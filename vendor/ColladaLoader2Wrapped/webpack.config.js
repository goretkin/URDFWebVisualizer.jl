// module.exports = { output: { libraryTarget: 'var', library: 'ROS3D' }, externals: [ { "./build/ros3d.js", 'var ROS3D' } ] }
module.exports = { output: { libraryTarget: 'var', library: 'ColladaLoader2' }, externals: [ { "./build/ColladaLoader2.js", 'var ColladaLoader2' } ], module: {noParse: [/ColladaLoader2.js/]} }
