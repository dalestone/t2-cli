var fs = require('fs')
  , tessel = require('tessel')
  , envfile = require('envfile')
  , config = envfile.parseFileSync(__dirname + '/../config.env')
  , ssh = require('./tessel-ssh');
  ;

function sftpDeploy(opts) {

  tessel.logs.info('Connecting to remote Tessel...');

  // Create a new SSH client connection object
  ssh.createConnection(function(err, conn) {

    // Throw any errors that pop up
    if (err) throw err;

    // Log that it was successful
    tessel.logs.info('Connected.');

    tessel.logs.info('Bundling up code...');
    // Command V2 to extract a tarball it receives on stdin to the remote deploy dir
    conn.exec('rm -rf /tmp/remote-script/*; tar -x -C /tmp/remote-script', function(err, rstdin) {
      // Gather details about the file structure of the script being sent
      var ret = tessel.analyzeScript(process.cwd() + "/" + opts.entryPoint, {verbose: opts.verbose});
      // Tar up the code to improve transfer rates
      tessel.tarCode(ret.pushdir, {node: true}, function(err, bundle) {
        tessel.logs.info('Bundled.')
        // Throw any unfortunate errors
        if (err) throw err;

        tessel.logs.info('Deploying code of size', ret.size, 'bytes ...');
        // Write the zipped code to stdin on v2
        rstdin.end(bundle);
        
        // Wait for the transfer to finish...
        rstdin.once('finish', function() {
          tessel.logs.info('Deployed.');
          tessel.logs.info('Running script...');
          // Once it has been written, run the script with Node
          conn.exec('node /tmp/remote-script/' + opts.entryPoint, function(err, stream) {
            if (err) throw err;
            stream.on('close', function(code, signal) {
              stream.signal('KILL');
              conn.end();
            }).on('data', function(data) {
              console.log(data.toString());
            }).stderr.on('data', function(data) {
              console.log("Err: ", data.toString());
              stream.signal('KILL');
              conn.end();
            });
          });
        });
      }); 
    });
  });
}

module.exports.sftpDeploy = sftpDeploy;