// The URDF visualization utilities in ROSLIB and ros3djs require a TFClient,
// which actually listens to transforms published on the TF topic.
// We don't need any of that, so copy-paste TFClient and add some methods for
// injecting transforms.

function TFClientShim(options) {
  options = options || {};
  this.fixedFrame = options.fixedFrame || '/base_link';
  this.angularThres = options.angularThres || 2.0;
  this.transThres = options.transThres || 0.01;
  this.rate = options.rate || 10.0;
  this.updateDelay = options.updateDelay || 50;
  var seconds = options.topicTimeout || 2.0;
  var secs = Math.floor(seconds);
  var nsecs = Math.floor((seconds - secs) * 1000000000);
  this.topicTimeout = {
    secs: secs,
    nsecs: nsecs
  };

  this.currentGoal = false;
  this.currentTopic = false;
  this.frameInfos = {};
}

/**
 * Subscribe to the given TF frame.
 *
 * @param frameID - the TF frame to subscribe to
 * @param callback - function with params:
 *   * transform - the transform data
 */
TFClientShim.prototype.subscribe = function(frameID, callback) {
  // remove leading slash, if it's there
  if (frameID[0] === '/')
  {
    frameID = frameID.substring(1);
  }
  // if there is no callback registered for the given frame, create emtpy callback list
  if (!this.frameInfos[frameID]) {
    this.frameInfos[frameID] = {
      cbs: []
    };
  }
  // if we already have a transform, call back immediately
  else if (this.frameInfos[frameID].transform) {
    callback(this.frameInfos[frameID].transform);
  }
  this.frameInfos[frameID].cbs.push(callback);
};

/**
 * Unsubscribe from the given TF frame.
 *
 * @param frameID - the TF frame to unsubscribe from
 * @param callback - the callback function to remove
 */
TFClientShim.prototype.unsubscribe = function(frameID, callback) {
  // remove leading slash, if it's there
  if (frameID[0] === '/')
  {
    frameID = frameID.substring(1);
  }
  var info = this.frameInfos[frameID];
  for (var cbs = info && info.cbs || [], idx = cbs.length; idx--;) {
    if (cbs[idx] === callback) {
      cbs.splice(idx, 1);
    }
  }
  if (!callback || cbs.length === 0) {
    delete this.frameInfos[frameID];
  }
};

if (typeof module !== 'undefined') {
  module.exports = TFClientShim;
}
