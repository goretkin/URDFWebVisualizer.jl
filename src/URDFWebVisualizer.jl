module URDFWebVisualizer

import JSON

js_path = joinpath(@__DIR__,"..","build","main.js")
js = readstring(js_path)
display(
  MIME"text/html"(),
  """
  <script>$js</script>
  <p>URDFWebVisualizer javascript loaded.</p>
  """
)

function display_player_html(id)
  display(
    MIME"text/html"(),
    """
    <div id=$(id)>
      <div class="urdf"></div>
      <input class="play" type="button" value="Play">
      <input class="pause" type="button" value="Pause">

      <input class="slider" type="range" min="1" max="500" value="0" step="1"/>
      <input class="numeric_frame" type="number"/>
    </div>
    """
  )
end

# joint_data size (n_joints, n_times)
# joint_order is string array of joint names
function run_player_js(id, joint_order, joint_data, base_link, frame_rate, options)
    script = """
      (function() {  // don't leak scope.
        var mother = document.getElementById('$(id)');
        var joint_order = $(JSON.json(joint_order));
        var joint_data = $(JSON.json(joint_data));

        function show_frame(frame, vis) {
          var configurations = {};
          for (var i = 0; i < joint_order.length; i++) {
            configurations[joint_order[i]] = joint_data[frame-1][i];
          }
          vis.update_configurations(configurations, '$(base_link)');
        }

        // init_urdf_player (ROS3D.Viewer) expects a div id, this is a clunky
        // mechanism to work around that.
        mother.getElementsByClassName('urdf')[0].setAttribute('id', '$(id)-urdf-canvas');

        // https://stackoverflow.com/a/171256
        function objassign(obj1, obj2) {
          for (var attrname in obj2) { obj1[attrname] = obj2[attrname]; }
        }

        var options = $(JSON.json(options));
        var default_size = mother.offsetWidth

        var viewer_options = {
          divID : '$(id)-urdf-canvas',
          width : default_size,
          height : default_size,
          antialias : true,
          background: '#002233'
        }

        // merge in options from Julia
        objassign(viewer_options, options.viewer_options);
        options.viewer_options = viewer_options;

        init_urdf_player(options, mother, show_frame, $(frame_rate),
          $(size(joint_data, 2)));

      })();
      """
      display(MIME"application/javascript"(), script)
end

end
