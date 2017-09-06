var ROSLIB = require("roslib");
var ROS3D = require("./vendor/ros3djs");
var TFClientShim = require('./vendor/TFClientShim.js');
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

function init_urdf_viewer(options) {
  options.width = typeof options.width === 'undefined' ? window.innerWidth : options.width;
  options.height = typeof options.height === 'undefined' ? window.innerHeight : options.height;
  var urdf_resources_url = options.urdf_resources_url;

  var tf_shim = new TFClientShim();

  viewer = new ROS3D.Viewer({
    divID : options.div_id,
    width : options.width,
    height : options.height,
    antialias : true,
    background: '#002233'
  });
  viewer.addObject(new ROS3D.Grid(options.grid_options || {
    color:'#0181c4',
    cellSize: 0.05,
    num_cells: 20
  }));

  function load_urdf(data) {
    urdf_string = data;
    urdf_model = new ROSLIB.UrdfModel({ string : urdf_string});

    urdf_vis = new ROS3D.Urdf({
      urdfModel : urdf_model,
      path : urdf_resources_url,
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
        // return Identity transform.
        return new ROSLIB.Transform();
      }
      var child_link = urdf_model.links[child_link_name];
      var joint = joint_childs[child_link_name];
      if (!joint) {
        return undefined;
      }
      var tx__root__parent = transform_urdf(urdf_model, root_link_name, joint.parent_link, configurations);
      var tx__parent__child = joint.origin;
      var tx__joint_config = joint_transform(joint, configurations[joint.name]);
      return compose(tx__root__parent, compose(tx__parent__child, tx__joint_config));
    }
    transform_urdf_ = transform_urdf

    // update the transforms in tf_shim
    function update_link(link_name, transform) {
      tf_shim.frameInfos[link_name].cbs.forEach(
        function(f) { f(transform); }
      );
    }

    // update all links according to configurations, placing root at origin.
    function update_configurations(configurations, root) {
      for (link_name in tf_shim.frameInfos) {
        var tf = transform_urdf(urdf_model, root, link_name, configurations);
        if (tf === 'undefined') {
          console.error('transform_urdf cannot transform.');
        }
        else {
          update_link(link_name, tf);
        }
      }
    }

    var output = {};
    output.update_link = update_link;
    output.update_configurations = update_configurations;
    output.urdf_model = urdf_model;
    // TODO call this only once all the 3D assets are loaded
    if (options.urdf_vis_ready) { options.urdf_vis_ready(output); }
  }

  if (options.urdf_url) {
    $.get(options.urdf_url, load_urdf, "text");
  }
  else if (options.urdf_text) {
    load_urdf(options.urdf_text);
  }
  else {
    console.log("Need either urdf_url or urdf_text");
  }
}

function init_urdf_player(viewer_options, dom_mother, show_frame, frame_rate, max_frame) {
  var sync_elements = ['slider', 'numeric_frame'].map(function(n) { return dom_mother.getElementsByClassName(n)[0]});
  var play_state = 'stopped';
  var animation_time_start = 0.0;
  var time_start;
  var interval_handle;
  var last_animation_time;

  dom_mother.getElementsByClassName('slider')[0].setAttribute('max', max_frame);

  function vis_ready(vis) {
    sync_elements.forEach(function(element) {
      element.addEventListener("change", function(){
        update_time(parseInt(this.value), this)
      });
      element.addEventListener("input", function(){
        update_time(parseInt(this.value), this)
      });
    })

    function update_time(new_frame, source) {
      // update other sync representations of the quantity
      sync_elements.forEach(function(element) {
        if (element !== source) { element.value = new_frame; }
      })

      if (source !== "playerbacker") {
        last_animation_time = new_frame / frame_rate;
        pause_press();
      }

      if (new_frame >= max_frame) {
        last_animation_time = 0.0;
        pause_press();
      }
      show_frame(new_frame, vis);
    }

    dom_mother.getElementsByClassName('play')[0].addEventListener("click", play_press);
    dom_mother.getElementsByClassName('pause')[0].addEventListener("click", pause_press);

    function play_press() {
      if (play_state === 'playing') { return; }
      play_state = 'playing';
      time_start = new Date();
      interval_handle = setInterval(animate, 20);
    }

    // function
    function pause_press() {
      animation_time_start = last_animation_time;
      if (play_state === 'paused') { return; }
      play_state = 'paused';
      clearInterval(interval_handle);
      time_start = "";
      interval_handle = "";
    }

    function animate() {
      var play_time = ((new Date()).getTime() - time_start)/1000.0;
      var animation_time = animation_time_start + play_time;
      var frame = parseInt(animation_time * frame_rate);
      // clip to max frame
      if (frame >= max_frame) { frame = max_frame; }
      last_animation_time = animation_time;
      update_time(frame, "playerbacker");
    }
  }

  viewer_options.urdf_vis_ready = vis_ready;
  init_urdf_viewer(viewer_options)
}

window.init_urdf_viewer = init_urdf_viewer;
window.init_urdf_player = init_urdf_player;
