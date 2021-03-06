var Tessel = require('./tessel'),
  commands = require('./commands'),
  logs = require('../logs'),
  Promise = require('bluebird');

Tessel.prototype.findAvailableNetworks = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    logs.info('Scanning for available networks...');
    self.connection.exec(commands.scanWiFi(), function(err, remoteProcess) {
      if (err) {
        return reject(err);
      }

      var resultsJSON = '';

      remoteProcess.stderr.on('data', function(d) {
        logs.err(d.toString());
      });

      // Gather the results
      remoteProcess.stdout.on('data', function(d) {
        resultsJSON += d;
      });

      // Wait for the transfer to finish...
      remoteProcess.once('close', function() {
        var networks;

        // Parse the response
        try {
          networks = JSON.parse(resultsJSON).results;
        } catch (err) {
          self.connection.end();
          // Throw any unfortunate errors
          if (err) {
            return reject(err);
          }
        }

        // Sort by signal strength
        networks.sort(compareBySignal);

        // Remove networks without SSIDs
        networks.forEach(function(network, index) {
          if (!network.ssid) {
            networks.splice(index, 1);
          }
        });

        self.connection.end(function() {
          // Return the networks
          return resolve(networks);
        });
      });
    });
  });
};

function compareBySignal(a, b) {
  if ((a.quality / a.quality_max) > (b.quality / b.quality_max)) {
    return -1;
  } else if ((a.quality / a.quality_max) < (b.quality / b.quality_max)) {
    return 1;
  } else {
    return 0;
  }
}

Tessel.prototype.connectToNetwork = function(opts) {
  var self = this;
  var ssid = opts.ssid;
  var password = opts.password;

  return new Promise(function(resolve, reject) {
    if (!ssid || !password) {
      return reject(new Error('Invalid credentials. Must set ssid and password'));
    }

    logs.info('Setting SSID:', ssid, 'and password:', password);
    self.connection.exec(commands.setNetworkSSID(ssid), function(err) {
      if (err) {
        return reject(err);
      }
      self.connection.exec(commands.setNetworkPassword(password), function(err) {
        if (err) {
          return reject(err);
        }
        // enable wifi
        self.connection.exec(commands.turnOnWifi(true), function(err) {
          if (err) {
            return reject(err);
          }
          self.connection.exec(commands.commitWirelessCredentials(), function(err, remoteProcess) {
            if (err) {
              return reject(err);
            }
            remoteProcess.once('close', function() {
              self.connection.exec(commands.reconnectWifi(), function(err, remoteProcess) {
                if (err) {
                  return reject(err);
                }
                remoteProcess.once('close', function() {
                  logs.info('Credentials set!');
                  self.connection.end(function() {
                    return resolve();
                  });
                });
              });
            });
          });
        });
      });
    });
  });
};

Tessel.prototype.resetMDNS = function(callback) {
  var self = this;

  // Tell the general MDNS daemon to restart
  self.connection.exec(commands.callMDNSDaemon('restart'), function(err, remoteProcess) {
    // If there was an error report it
    if (Tessel._commonErrorHandler(err)) {
      return;
    }

    remoteProcess.stderr.pipe(process.stderr);

    // When that completes
    remoteProcess.once('close', function() {
      // Tell the Tessel MDNS advertising agent to restart
      self.connection.exec(commands.callTesselMDNS('restart'), function(err, remoteProcess) {
        // If there was an error report it
        if (Tessel._commonErrorHandler(err)) {
          return;
        }

        remoteProcess.stderr.pipe(process.stderr);

        // Call the callback once this completes
        if (typeof callback === 'function') {
          remoteProcess.once('close', callback);
        }
      });
    });
  });
};
