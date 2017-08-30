var ROSLIB = require("roslib");
var ROS3D = require("./vendor/ros3djs");
var TFClientShim = require('TFClientShim.js');
var $ = require('jquery');

function add(a, b) {
  return a + b;
}
function quaternion_from_axis_angle(axis, angle){
  var sum_of_sq = [axis.x, axis.y, axis.z].map(
                function(c){ return Math.pow(c, 2)}
              ).reduce(function(a,b){ return a+b; }, 0.0);
  var norm = Math.sqrt(sum_of_sq);
  var axis_normed = [axis.x, axis.y, axis.z].map(function(c) { return 1.0/norm * c});
  var s = Math.sin(angle/2);
  return new ROSLIB.Quaternion({
    x : s * axis_normed[0],
    y : s * axis_normed[1],
    z : s * axis_normed[2],
    w : Math.cos(angle/2)
  });
}

function scale(vec, c){
  return new ROSLIB.Vector3({
    x : c * vec.x,
    y : c * vec.y,
    z : c * vec.z
  });
}

function joint_transform(joint, configuration) {
  if (joint.type === "prismatic") {
    return new ROSLIB.Transform({
      translation : scale(joint.axis, configuration)
    });
  }
  else if (joint.type === "revolute" || joint.type === "continuous") {
    return new ROSLIB.Transform({
      rotation : quaternion_from_axis_angle(joint.axis, configuration)
    });
  }
  else if (joint.type === "fixed") {
    return new ROSLIB.Transform();
  }
  console.log("Unknown joint type: " + joint.type);
  return undefined;
}

function pose_to_transform(pose) {
  return new ROSLIB.Transform({
    translation : pose.position,
    rotation : pose.orientation
  });
}

function transform_to_pose(transform) {
  return new ROSLIB.Pose({
    position : transform.translation,
    orientation : transform.rotation
  });
}

function compose(tf1, tf2) {
  // ROSLIBjs doesn't provide util for chaining transforms.
  var tf_return = transform_to_pose(tf2);
  tf_return.applyTransform(tf1);
  return pose_to_transform(tf_return);
}

/*
Using notation for coordinate frames:

pose__a_link : pose expressed in base_link frame.
tx__b_link__a_link : transform such that
  var tmp = pose__a_link; // Make a copy
  tmp.applyTransform(tx__b_link__a_link ); // mutates
  var pose__b_link = tmp;

tx__a_link__b_link = transform_urdf_(urdf_model, a_link, b_link, configuration)
*/

var urdf_string;
var urdf_model;
var urdf_vis;

var viewer;
var transform_urdf_;

var joint_parents;
var joint_childs;

function init(div_id) {
  /*
  var ros = new ROSLIB.Ros({
    url : 'ws://demo.robotwebtools.org:9090'
  });
  */
  var tf_shim = new TFClientShim();

  viewer = new ROS3D.Viewer({
    divID : div_id,
    width : window.innerWidth,
    height : window.innerHeight,
    antialias : true,
    background: '#002233'
  });
  viewer.addObject(new ROS3D.Grid({
    color:'#0181c4',
    cellSize: 0.05,
    num_cells: 20
  }));


  $.get("./pr2_description/robot_uncalibrated_fix_mass.xml", function(data) {
    urdf_string = data;
    urdf_model = new ROSLIB.UrdfModel({ string : urdf_string});

    /*
    urdf_vis = new ROS3D.UrdfBare({
      urdfModel : urdf_model,
      path : 'http://resources.robotwebtools.org/',
      loader :  ROS3D.COLLADA_LOADER_2
    });
    */

    urdf_vis = new ROS3D.Urdf({
      urdfModel : urdf_model,
      //path : 'http://resources.robotwebtools.org/',
      path : 'http://0.0.0.0:8000/', // python -m SimpleHTTPServer
      tfClient : tf_shim,
      tfPrefix : "",
      loader : ROS3D.COLLADA_LOADER_2
    });
    viewer.scene.add(urdf_vis);


    joint_parents = {};
    joint_childs = {};
    for (var key_joint in urdf_model.joints) {
      var joint = urdf_model.joints[key_joint];
      joint_parents[joint.parent_link] = joint;
      joint_childs[joint.child_link] = joint;
    }

    function transform_urdf(urdf_model, root_link_name, child_link_name, configurations) {
      // child_link must be an ancestor of root_link_name.
      // If there is a loop in the URDF, this can not terminate.
      if (root_link_name === child_link_name) {
        // return Identity transform. roslibjs doesn't have way to multiply transforms. use Pose instead.
        return new ROSLIB.Transform();
      }
      var child_link = urdf_model.links[child_link_name];
      var joint = joint_childs[child_link_name];
      if (!joint) {
        return undefined;
      }
      //console.log("joint: " + joint.name);
      //console.log("joint.origin: " + joint.origin);
      var tx__root__parent = transform_urdf(urdf_model, root_link_name, joint.parent_link, configurations);
      var tx__parent__child = joint.origin;
      var tx__joint_config = joint_transform(joint, configurations[joint.name]);
      return compose(tx__root__parent, compose(tx__parent__child, tx__joint_config));
      //return [tx_child__parent, tx__parent__base].reduce(compose, new ROSLIB.Transform());
    }
    transform_urdf_ = transform_urdf

    // update all links according to configurations
    var configurations = {}
    for (joint_name in urdf_model.joints) {
      configurations[joint_name] = 0.0;
    }
    function update_configurations(configurations) {
      var tx_testoffset = new ROSLIB.Transform({
        rotation : quaternion_from_axis_angle({ x : 0, y : 0, z : 1 }, 0.0) });
      for (link_name in tf_shim.frameInfos) {
        if (link_name === "base_footprint") {
          continue; // transform_urdf not yet implemented
        }
        var tf = transform_urdf(urdf_model, "base_link", link_name, configurations);
        tf_shim.frameInfos[link_name].cbs.forEach(
          function(f) { f(compose(tx_testoffset, tf)); }
        );
      }
    }
    var t = 0.0;
    function animate() {
      var a = .1 * Math.sin(2*Math.PI * t) + 0.01 * Math.cos(2*Math.PI * .8 * t);

      for (joint_name in urdf_model.joints) {
        configurations[joint_name] = a;
      }

      // configurations["r_elbow_flex_joint"] = a;
      update_configurations(configurations);
      t += 0.1;
    };

    interval_id = setInterval(animate, 100)
  },
  "text"); // jQuery get
}
console.log("here");
window.initgg = init;
